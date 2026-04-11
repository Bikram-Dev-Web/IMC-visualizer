"use client";
/**
 * DepthChart — snapshot order book depth at the crosshair timestamp.
 * Renders bid/ask volume distribution as a mirrored horizontal bar chart.
 */

import React, { useEffect, useRef, useCallback } from "react";
import {
  useVisualizerStore,
  selectProduct,
  selectCrosshair,
} from "@/lib/store/useVisualizerStore";
import { bisectLeft } from "@/lib/math/lttb";

const LEVELS = 3;
const COLORS = { bid: "#26a69a", ask: "#ef5350", bg: "#0f1012", grid: "rgba(255,255,255,0.04)" };

export function DepthChart({ height = 200 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const logA = useVisualizerStore((s) => s.logA);
  const product = useVisualizerStore(selectProduct);
  const crosshair = useVisualizerStore(selectCrosshair);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.offsetWidth;
    canvas.width = width * (window.devicePixelRatio || 1);
    canvas.height = height * (window.devicePixelRatio || 1);
    ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    const ob = logA?.orderBooks.get(product);
    if (!ob || ob.length === 0) {
      ctx.fillStyle = "#5c6370";
      ctx.font = "11px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("No order book data", width / 2, height / 2);
      return;
    }

    // Find tick at crosshair
    const ts = crosshair.timestamp ?? ob.timestamps[ob.length - 1];
    const idx = Math.min(bisectLeft(ob.timestamps, ts), ob.length - 1);

    // Collect levels
    const bids: { price: number; size: number }[] = [];
    const asks: { price: number; size: number }[] = [];
    for (let l = 0; l < LEVELS; l++) {
      const bp = ob.bidPrices[l]?.[idx];
      const bs = ob.bidSizes[l]?.[idx];
      const ap = ob.askPrices[l]?.[idx];
      const as_ = ob.askSizes[l]?.[idx];
      if (!isNaN(bp) && bs > 0) bids.push({ price: bp, size: bs });
      if (!isNaN(ap) && as_ > 0) asks.push({ price: ap, size: as_ });
    }

    if (bids.length === 0 && asks.length === 0) return;

    const allSizes = [...bids.map((b) => b.size), ...asks.map((a) => a.size)];
    const maxSize = Math.max(...allSizes, 1);

    const PAD = { left: 50, right: 20, top: 10, bottom: 24 };
    const plotW = width - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;
    const rowH = plotH / (LEVELS * 2 + 1);

    ctx.font = "10px 'JetBrains Mono', monospace";

    // Draw bids (top half)
    for (let i = 0; i < bids.length; i++) {
      const y = PAD.top + i * rowH;
      const barW = (bids[i].size / maxSize) * plotW;
      ctx.fillStyle = COLORS.bid + "33";
      ctx.fillRect(PAD.left, y + 2, barW, rowH - 4);
      ctx.fillStyle = COLORS.bid;
      ctx.textAlign = "right";
      ctx.fillText(bids[i].price.toFixed(0), PAD.left - 4, y + rowH / 2 + 3);
      ctx.textAlign = "left";
      ctx.fillStyle = "#9aa0b0";
      ctx.fillText(`×${bids[i].size}`, PAD.left + barW + 4, y + rowH / 2 + 3);
    }

    // Mid line
    const midY = PAD.top + LEVELS * rowH + rowH / 2;
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    const mid = ob.midPrices[idx];
    ctx.fillStyle = "#ffa726";
    ctx.textAlign = "center";
    ctx.fillText(`Mid: ${mid.toFixed(2)}`, width / 2, midY - 4);

    // Draw asks (bottom half)
    for (let i = 0; i < asks.length; i++) {
      const y = PAD.top + (LEVELS + 1 + i) * rowH;
      const barW = (asks[i].size / maxSize) * plotW;
      ctx.fillStyle = COLORS.ask + "33";
      ctx.fillRect(PAD.left, y + 2, barW, rowH - 4);
      ctx.fillStyle = COLORS.ask;
      ctx.textAlign = "right";
      ctx.fillText(asks[i].price.toFixed(0), PAD.left - 4, y + rowH / 2 + 3);
      ctx.textAlign = "left";
      ctx.fillStyle = "#9aa0b0";
      ctx.fillText(`×${asks[i].size}`, PAD.left + barW + 4, y + rowH / 2 + 3);
    }

    // Title
    ctx.fillStyle = "#5c6370";
    ctx.textAlign = "center";
    ctx.fillText(`Order Book @ T${Math.round(ts)}`, width / 2, height - 6);
  }, [logA, product, crosshair, height]);

  useEffect(() => {
    render();
  }, [render]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => render());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [render]);

  return (
    <div ref={containerRef} className="w-full" style={{ height }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
