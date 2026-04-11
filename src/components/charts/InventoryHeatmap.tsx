"use client";
/**
 * InventoryHeatmap — shows position over time as a color gradient.
 * Red = short limit, Green = long limit, White = flat.
 */

import React, { useRef, useEffect, useCallback } from "react";
import {
  useVisualizerStore,
  selectViewport,
  selectProduct,
} from "@/lib/store/useVisualizerStore";
import { bisectLeft, bisectRight } from "@/lib/math/lttb";

const POSITION_LIMITS: Record<string, number> = {
  AMETHYSTS: 20, STARFRUIT: 20, KELP: 50, SQUID_INK: 50,
  CROISSANTS: 250, JAMS: 350, DJEMBES: 60,
  PICNIC_BASKET1: 60, PICNIC_BASKET2: 100,
  VOLCANIC_ROCK: 400,
  DEFAULT: 100,
};

function getPositionLimit(product: string): number {
  return POSITION_LIMITS[product] ?? POSITION_LIMITS.DEFAULT;
}

/** Interpolate: red (#ef5350) at -1, white (#e8eaed) at 0, green (#26a69a) at +1 */
function positionToColor(normalized: number): string {
  const clamped = Math.max(-1, Math.min(1, normalized));
  if (clamped >= 0) {
    // 0 → white, 1 → green
    const r = Math.round(232 + (38 - 232) * clamped);
    const g = Math.round(234 + (166 - 234) * clamped);
    const b = Math.round(237 + (154 - 237) * clamped);
    return `rgb(${r},${g},${b})`;
  } else {
    // -1 → red, 0 → white
    const t = -clamped;
    const r = Math.round(232 + (239 - 232) * t);
    const g = Math.round(234 + (83 - 234) * t);
    const b = Math.round(237 + (80 - 237) * t);
    return `rgb(${r},${g},${b})`;
  }
}

export function InventoryHeatmap({ height = 80 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(true);

  const logA = useVisualizerStore((s) => s.logA);
  const logB = useVisualizerStore((s) => s.logB);
  const showStratB = useVisualizerStore((s) => s.showStratB);
  const product = useVisualizerStore(selectProduct);
  const viewport = useVisualizerStore(selectViewport);

  const render = useCallback(() => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.offsetWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#0f1012";
    ctx.fillRect(0, 0, w, height);

    const limit = getPositionLimit(product);
    const numRows = showStratB ? 2 : 1;
    const rowH = (height - 20) / numRows;

    const drawHeatmapRow = (
      log: typeof logA,
      rowY: number,
      label: string,
      color: string
    ) => {
      const tr = log?.trades.get(product);
      if (!tr || tr.length === 0) {
        ctx.fillStyle = "#5c6370";
        ctx.font = "9px 'JetBrains Mono', monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${label}: no trades`, 4, rowY + rowH / 2 + 3);
        return;
      }

      // Build cumulative position time series from own trades
      const positions: { ts: number; pos: number }[] = [{ ts: tr.timestamps[0], pos: 0 }];
      let pos = 0;
      for (let i = 0; i < tr.length; i++) {
        if (tr.isOwn[i]) {
          pos += tr.aggressors[i] === 1 ? tr.quantities[i] : -tr.quantities[i];
          positions.push({ ts: tr.timestamps[i], pos });
        }
      }

      if (positions.length === 0) return;

      // Filter to viewport
      const xMin = viewport.xMin;
      const xMax = viewport.xMax;
      const xRange = xMax - xMin || 1;

      // Draw one pixel column per position step in viewport
      const pixelsPerTs = w / xRange;
      for (let i = 0; i < positions.length - 1; i++) {
        const { ts, pos: p } = positions[i];
        const nextTs = positions[i + 1].ts;
        if (nextTs < xMin || ts > xMax) continue;

        const x1 = Math.max(0, ((ts - xMin) / xRange) * w);
        const x2 = Math.min(w, ((nextTs - xMin) / xRange) * w);
        const normalized = p / limit;
        ctx.fillStyle = positionToColor(normalized);
        ctx.fillRect(x1, rowY, Math.max(1, x2 - x1), rowH - 2);
      }
      // Last segment to end
      const last = positions[positions.length - 1];
      const x1 = Math.max(0, ((last.ts - xMin) / xRange) * w);
      ctx.fillStyle = positionToColor(last.pos / limit);
      ctx.fillRect(x1, rowY, w - x1, rowH - 2);

      // Row label
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(0, rowY, 36, rowH - 2);
      ctx.fillStyle = color;
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(label, 18, rowY + rowH / 2 + 3);
    };

    drawHeatmapRow(logA, 0, "A", "#00d4aa");
    if (showStratB && logB) {
      drawHeatmapRow(logB, rowH, "B", "#7c6af7");
    }

    // Legend
    ctx.fillStyle = "#5c6370";
    ctx.font = "9px 'JetBrains Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText("SHORT", w - 2, height - 5);
    ctx.textAlign = "center";
    ctx.fillText("FLAT", w / 2, height - 5);
    ctx.textAlign = "left";
    ctx.fillText("LONG", 2, height - 5);

    // Gradient legend bar
    const grd = ctx.createLinearGradient(w * 0.15, 0, w * 0.85, 0);
    grd.addColorStop(0, "#ef5350");
    grd.addColorStop(0.5, "#e8eaed");
    grd.addColorStop(1, "#26a69a");
    ctx.fillStyle = grd;
    ctx.fillRect(w * 0.15, height - 10, w * 0.7, 4);
  }, [logA, logB, product, viewport, showStratB, height]);

  useEffect(() => { dirtyRef.current = true; }, [logA, logB, product, viewport, showStratB]);

  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    return () => { running = false; };
  }, [render]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => { dirtyRef.current = true; });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
