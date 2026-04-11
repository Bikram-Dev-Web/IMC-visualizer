"use client";
/**
 * CanvasChart — high-performance canvas-based multi-series chart.
 *
 * Architecture:
 *  - Renders to an HTML5 Canvas via requestAnimationFrame (60fps cap)
 *  - Uses a "dirty" flag → only re-renders when data/viewport changes
 *  - LTTB downsampling applied in the render path: always ≤ MAX_POINTS rendered
 *  - Zoom via wheel event (preserving cursor position)
 *  - Pan via pointer drag
 *  - Crosshair synced through Zustand store across all chart instances
 *  - Supports left and right Y axes, area fills, scatter dots, bar charts
 *  - Annotations: vertical lines + labeled points
 */

import React, {
  useRef, useEffect, useCallback, useMemo, useState,
} from "react";
import { windowedLTTB } from "@/lib/math/lttb";
import {
  useVisualizerStore,
  selectViewport,
  selectCrosshair,
} from "@/lib/store/useVisualizerStore";
import type { ChartAnnotation } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_POINTS = 2000; // max points passed to canvas per series
const PADDING = { top: 10, right: 60, bottom: 32, left: 60 };
const TICK_COUNT = { x: 8, yLeft: 6, yRight: 6 };
const FONT = "10px 'JetBrains Mono', monospace";
const CROSSHAIR_COLOR = "rgba(255,255,255,0.18)";
const GRID_COLOR = "rgba(255,255,255,0.04)";
const TICK_COLOR = "#5c6370";
const LABEL_COLOR = "#9aa0b0";

// ─── Types ────────────────────────────────────────────────────────────────────
export type SeriesType = "line" | "area" | "bar" | "scatter" | "step";

export interface ChartSeries {
  id: string;
  label: string;
  timestamps: Float64Array;
  values: Float64Array;
  color: string;
  type?: SeriesType;
  yAxis?: "left" | "right";
  lineWidth?: number;
  fillAlpha?: number; // 0-1 for area
  dotRadius?: number; // for scatter
  visible?: boolean;
}

export interface CanvasChartProps {
  series: ChartSeries[];
  height?: number;
  annotations?: ChartAnnotation[];
  yLeftLabel?: string;
  yRightLabel?: string;
  /** If true, zero line is drawn on left axis */
  showZeroLine?: boolean;
  /** Sync group id — components with same id share crosshair */
  syncGroup?: string;
  className?: string;
  onHover?: (timestamp: number | null, values: Record<string, number>) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function niceTickInterval(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / mag;
  let nice: number;
  if (normalized < 1.5) nice = 1;
  else if (normalized < 3.5) nice = 2;
  else if (normalized < 7.5) nice = 5;
  else nice = 10;
  return nice * mag;
}

function formatTimestamp(ts: number): string {
  // IMC timestamps are in "ticks" (100ms increments typically)
  // Format as T=XXXXX or as HH:MM:SS.ms depending on magnitude
  if (ts > 1_000_000_000) {
    // Unix-like timestamp
    return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
  }
  return `T${Math.round(ts)}`;
}

function formatValue(v: number, decimals = 1): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return v.toFixed(decimals);
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CanvasChart({
  series,
  height = 280,
  annotations = [],
  yLeftLabel,
  yRightLabel,
  showZeroLine = false,
  className = "",
  onHover,
}: CanvasChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const dirtyRef = useRef(true);
  const dragRef = useRef<{ x: number; xMinStart: number; xMaxStart: number } | null>(null);

  const viewport = useVisualizerStore(selectViewport);
  const crosshair = useVisualizerStore(selectCrosshair);
  const { setViewport, panViewport, zoomViewport, setCrosshair } = useVisualizerStore();

  // Track canvas width
  const [width, setWidth] = useState(800);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) { setWidth(w); dirtyRef.current = true; }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Mark dirty when props change
  useEffect(() => { dirtyRef.current = true; }, [series, viewport, crosshair, annotations, width]);

  // ─── Render function ─────────────────────────────────────────────────────

  const render = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const plotLeft = PADDING.left;
    const plotRight = width - PADDING.right;
    const plotTop = PADDING.top;
    const plotBottom = height - PADDING.bottom;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    if (plotWidth <= 0 || plotHeight <= 0) return;

    // Coordinate transforms
    const xMin = viewport.xMin;
    const xMax = viewport.xMax;
    const xRange = xMax - xMin || 1;

    const tsToX = (ts: number) => plotLeft + ((ts - xMin) / xRange) * plotWidth;
    const xToTs = (x: number) => xMin + ((x - plotLeft) / plotWidth) * xRange;

    // Compute Y range for left and right axes
    const leftSeries = series.filter((s) => (s.yAxis ?? "left") === "left" && s.visible !== false);
    const rightSeries = series.filter((s) => s.yAxis === "right" && s.visible !== false);

    function computeYRange(
      seriesArr: ChartSeries[]
    ): { min: number; max: number } {
      let min = Infinity;
      let max = -Infinity;
      for (const s of seriesArr) {
        if (!s.timestamps || !s.values || s.timestamps.length === 0) continue;
        const ds = windowedLTTB(s.timestamps, s.values, xMin, xMax, MAX_POINTS);
        for (let i = 0; i < ds.values.length; i++) {
          const v = ds.values[i];
          if (!isNaN(v) && isFinite(v)) {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
      if (!isFinite(min) || !isFinite(max)) return { min: 0, max: 1 };
      if (min === max) { min -= 1; max += 1; }
      const pad = (max - min) * 0.08;
      return { min: min - pad, max: max + pad };
    }

    const leftRange = computeYRange(leftSeries);
    const rightRange = computeYRange(rightSeries);

    const leftYRange = leftRange.max - leftRange.min || 1;
    const rightYRange = rightRange.max - rightRange.min || 1;

    const valToYLeft = (v: number) =>
      plotBottom - ((v - leftRange.min) / leftYRange) * plotHeight;
    const valToYRight = (v: number) =>
      plotBottom - ((v - rightRange.min) / rightYRange) * plotHeight;

    // ─── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = "#0f1012";
    ctx.fillRect(0, 0, width, height);

    // Clip plot area
    ctx.save();
    ctx.rect(plotLeft, plotTop, plotWidth, plotHeight);
    ctx.clip();

    // ─── Grid ──────────────────────────────────────────────────────────────
    ctx.strokeStyle = GRID_COLOR;
    ctx.lineWidth = 1;

    // X grid
    const xInterval = niceTickInterval(xRange, TICK_COUNT.x);
    const xStart = Math.ceil(xMin / xInterval) * xInterval;
    for (let t = xStart; t <= xMax; t += xInterval) {
      const x = tsToX(t);
      ctx.beginPath();
      ctx.moveTo(x, plotTop);
      ctx.lineTo(x, plotBottom);
      ctx.stroke();
    }

    // Y grid (left)
    const yInterval = niceTickInterval(leftYRange, TICK_COUNT.yLeft);
    const yStart = Math.ceil(leftRange.min / yInterval) * yInterval;
    for (let v = yStart; v <= leftRange.max; v += yInterval) {
      const y = valToYLeft(v);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y);
      ctx.lineTo(plotRight, y);
      ctx.stroke();
    }

    // Zero line
    if (showZeroLine && leftRange.min < 0 && leftRange.max > 0) {
      const y0 = valToYLeft(0);
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(plotLeft, y0);
      ctx.lineTo(plotRight, y0);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ─── Annotations ───────────────────────────────────────────────────────
    for (const ann of annotations) {
      if (ann.timestamp < xMin || ann.timestamp > xMax) continue;
      const x = tsToX(ann.timestamp);
      if (ann.type === "vertical") {
        ctx.strokeStyle = ann.color;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, plotTop);
        ctx.lineTo(x, plotBottom);
        ctx.stroke();
        ctx.setLineDash([]);
        // Label
        ctx.fillStyle = ann.color;
        ctx.font = FONT;
        ctx.fillText(ann.label, x + 3, plotTop + 12);
      } else if (ann.type === "point" && ann.y !== undefined) {
        const y = valToYLeft(ann.y);
        ctx.fillStyle = ann.color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = ann.color;
        ctx.font = FONT;
        ctx.fillText(ann.label, x + 6, y - 4);
      }
    }

    // ─── Series ────────────────────────────────────────────────────────────
    for (const s of series) {
      if (s.visible === false || !s.timestamps || !s.values) continue;
      if (s.timestamps.length === 0) continue;

      const ds = windowedLTTB(s.timestamps, s.values, xMin, xMax, MAX_POINTS);
      if (ds.timestamps.length === 0) continue;

      const isRight = s.yAxis === "right";
      const toY = isRight ? valToYRight : valToYLeft;
      const type = s.type ?? "line";
      const lw = s.lineWidth ?? 1.5;
      const color = s.color;

      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = lw;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      if (type === "scatter") {
        const r = s.dotRadius ?? 3;
        for (let i = 0; i < ds.timestamps.length; i++) {
          const x = tsToX(ds.timestamps[i]);
          const y = toY(ds.values[i]);
          if (!isFinite(y)) continue;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }

      if (type === "bar") {
        const barW = Math.max(1, (plotWidth / ds.timestamps.length) * 0.7);
        const y0 = toY(0);
        for (let i = 0; i < ds.timestamps.length; i++) {
          const x = tsToX(ds.timestamps[i]);
          const v = ds.values[i];
          const y = toY(v);
          if (!isFinite(y)) continue;
          ctx.fillStyle = v >= 0 ? "#26a69a55" : "#ef535055";
          ctx.fillRect(x - barW / 2, Math.min(y, y0), barW, Math.abs(y - y0));
        }
        continue;
      }

      // Line / area / step
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < ds.timestamps.length; i++) {
        const x = tsToX(ds.timestamps[i]);
        const y = toY(ds.values[i]);
        if (!isFinite(y) || !isFinite(x)) { first = true; continue; }

        if (first) {
          ctx.moveTo(x, y);
          first = false;
        } else {
          if (type === "step") {
            const prevX = tsToX(ds.timestamps[i - 1]);
            ctx.lineTo(prevX, y);
          }
          ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      // Area fill
      if (type === "area" && ds.timestamps.length > 0) {
        const alpha = s.fillAlpha ?? 0.12;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        // Re-build path with bottom closure
        ctx.beginPath();
        let f = true;
        for (let i = 0; i < ds.timestamps.length; i++) {
          const x = tsToX(ds.timestamps[i]);
          const y = toY(ds.values[i]);
          if (!isFinite(y) || !isFinite(x)) { f = true; continue; }
          if (f) { ctx.moveTo(x, plotBottom); ctx.lineTo(x, y); f = false; }
          else ctx.lineTo(x, y);
        }
        ctx.lineTo(tsToX(ds.timestamps[ds.timestamps.length - 1]), plotBottom);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }

    // ─── Crosshair ─────────────────────────────────────────────────────────
    if (crosshair.timestamp !== null) {
      const cx = tsToX(crosshair.timestamp);
      if (cx >= plotLeft && cx <= plotRight) {
        ctx.strokeStyle = CROSSHAIR_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cx, plotTop);
        ctx.lineTo(cx, plotBottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore(); // remove clip

    // ─── Axes ──────────────────────────────────────────────────────────────
    ctx.font = FONT;

    // X axis ticks + labels
    ctx.fillStyle = TICK_COLOR;
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    for (let t = xStart; t <= xMax; t += xInterval) {
      const x = tsToX(t);
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "center";
      ctx.fillText(formatTimestamp(t), x, plotBottom + 16);
      ctx.fillStyle = TICK_COLOR;
      ctx.fillRect(x, plotBottom, 1, 4);
    }

    // Y left ticks + labels
    for (let v = yStart; v <= leftRange.max; v += yInterval) {
      const y = valToYLeft(v);
      if (y < plotTop || y > plotBottom) continue;
      ctx.fillStyle = LABEL_COLOR;
      ctx.textAlign = "right";
      ctx.fillText(formatValue(v), plotLeft - 6, y + 3);
    }

    // Y right ticks + labels (if any right-axis series)
    if (rightSeries.length > 0) {
      const yIntR = niceTickInterval(rightYRange, TICK_COUNT.yRight);
      const yStartR = Math.ceil(rightRange.min / yIntR) * yIntR;
      for (let v = yStartR; v <= rightRange.max; v += yIntR) {
        const y = valToYRight(v);
        if (y < plotTop || y > plotBottom) continue;
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = "left";
        ctx.fillText(formatValue(v), plotRight + 4, y + 3);
      }
    }

    // Axis line
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(plotLeft, plotTop);
    ctx.lineTo(plotLeft, plotBottom);
    ctx.lineTo(plotRight, plotBottom);
    ctx.stroke();

    // Y-axis labels
    if (yLeftLabel) {
      ctx.save();
      ctx.translate(10, (plotTop + plotBottom) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = TICK_COLOR;
      ctx.textAlign = "center";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.fillText(yLeftLabel, 0, 0);
      ctx.restore();
    }

    // Crosshair tooltip
    if (crosshair.timestamp !== null) {
      const cx = tsToX(crosshair.timestamp);
      if (cx >= plotLeft && cx <= plotRight) {
        // Find nearest values for each series
        const lines: string[] = [`T = ${formatTimestamp(crosshair.timestamp)}`];
        for (const s of series) {
          if (s.visible === false || !s.timestamps || s.timestamps.length === 0) continue;
          // Binary search for nearest timestamp
          let lo = 0, hi = s.timestamps.length - 1, closest = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (s.timestamps[mid] < crosshair.timestamp!) lo = mid + 1;
            else hi = mid - 1;
          }
          closest = Math.min(lo, s.timestamps.length - 1);
          const v = s.values[closest];
          if (!isNaN(v)) lines.push(`${s.label}: ${formatValue(v, 2)}`);
        }
        // Draw tooltip box
        const boxW = 120;
        const boxH = lines.length * 14 + 10;
        let bx = cx + 8;
        if (bx + boxW > plotRight) bx = cx - boxW - 8;
        const by = plotTop + 4;
        ctx.fillStyle = "rgba(15,16,18,0.92)";
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(bx, by, boxW, boxH, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = LABEL_COLOR;
        ctx.textAlign = "left";
        ctx.font = FONT;
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], bx + 6, by + 14 + i * 14);
        }
      }
    }
  }, [series, viewport, crosshair, annotations, width, height, showZeroLine, yLeftLabel, yRightLabel]);

  // ─── RAF loop ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [render]);

  // ─── Pointer events ────────────────────────────────────────────────────────

  const getTimestamp = useCallback(
    (clientX: number): number => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = clientX - rect.left;
      const plotLeft = PADDING.left;
      const plotRight = rect.width - PADDING.right;
      const xRange = viewport.xMax - viewport.xMin;
      return viewport.xMin + ((x - plotLeft) / (plotRight - plotLeft)) * xRange;
    },
    [viewport]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const centerTs = getTimestamp(e.clientX);
      const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      zoomViewport(factor, centerTs);
      dirtyRef.current = true;
    },
    [getTimestamp, zoomViewport]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = {
        x: e.clientX,
        xMinStart: viewport.xMin,
        xMaxStart: viewport.xMax,
      };
    },
    [viewport]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const ts = getTimestamp(e.clientX);
      setCrosshair({ timestamp: ts, x: e.clientX });
      dirtyRef.current = true;

      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.x;
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const plotWidth = rect.width - PADDING.left - PADDING.right;
        const xRange = dragRef.current.xMaxStart - dragRef.current.xMinStart;
        const dtPerPixel = xRange / plotWidth;
        const dt = -dx * dtPerPixel;
        setViewport({
          xMin: dragRef.current.xMinStart + dt,
          xMax: dragRef.current.xMaxStart + dt,
        });
        dirtyRef.current = true;
      }

      // Fire hover callback
      if (onHover) {
        const values: Record<string, number> = {};
        for (const s of series) {
          if (!s.timestamps || s.timestamps.length === 0) continue;
          let lo = 0, hi = s.timestamps.length - 1, closest = 0;
          while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (s.timestamps[mid] < ts) lo = mid + 1;
            else hi = mid - 1;
          }
          closest = Math.min(lo, s.timestamps.length - 1);
          values[s.id] = s.values[closest];
        }
        onHover(ts, values);
      }
    },
    [getTimestamp, setCrosshair, setViewport, series, onHover]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handlePointerLeave = useCallback(() => {
    dragRef.current = null;
    setCrosshair({ timestamp: null, x: null });
    dirtyRef.current = true;
  }, [setCrosshair]);

  const handleDoubleClick = useCallback(() => {
    useVisualizerStore.getState().resetViewport();
    dirtyRef.current = true;
  }, []);

  return (
    <div ref={containerRef} className={`relative select-none ${className}`} style={{ height }}>
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", cursor: dragRef.current ? "grabbing" : "crosshair" }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}
