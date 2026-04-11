"use client";
/**
 * IVSmile — options implied volatility smile.
 * Fetches option prices from the log at the crosshair timestamp and
 * inverts Black-Scholes to get IV per strike.
 */

import React, { useRef, useEffect, useCallback, useMemo } from "react";
import {
  useVisualizerStore,
  selectCrosshair,
} from "@/lib/store/useVisualizerStore";
import { buildIVSmile } from "@/lib/math/blackScholes";
import { bisectLeft } from "@/lib/math/lttb";

// IMC Prosperity 4 options: VOLCANIC_ROCK vouchers
// Product name pattern: VOLCANIC_ROCK_VOUCHER_XXXXX (strike)
function extractStrike(productName: string): number | null {
  const m = productName.match(/VOUCHER[_\s]*(\d+)/i);
  return m ? parseInt(m[1], 10) : null;
}

function isOptionsProduct(name: string): boolean {
  return name.includes("VOUCHER") || name.includes("OPTION") || name.includes("CALL") || name.includes("PUT");
}

const FONT = "10px 'JetBrains Mono', monospace";

export function IVSmile({ height = 200 }: { height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(true);

  const logA = useVisualizerStore((s) => s.logA);
  const crosshair = useVisualizerStore(selectCrosshair);

  const smileData = useMemo(() => {
    if (!logA) return null;
    const optionProducts = logA.products.filter(isOptionsProduct);
    if (optionProducts.length === 0) return null;

    // Find underlying (VOLCANIC_ROCK)
    const underlying = logA.products.find(
      (p) => p.includes("VOLCANIC_ROCK") && !isOptionsProduct(p)
    );
    const underlyingOb = underlying ? logA.orderBooks.get(underlying) : null;

    const ts = crosshair.timestamp ?? logA.globalTimestamps[logA.globalTimestamps.length - 1];

    const strikes: number[] = [];
    const prices: number[] = [];
    const types: ("call" | "put")[] = [];

    for (const prod of optionProducts) {
      const strike = extractStrike(prod);
      if (!strike) continue;
      const ob = logA.orderBooks.get(prod);
      if (!ob || ob.length === 0) continue;
      const idx = Math.min(bisectLeft(ob.timestamps, ts), ob.length - 1);
      const price = ob.midPrices[idx];
      if (!isNaN(price) && price > 0) {
        strikes.push(strike);
        prices.push(price);
        types.push("call"); // default; can be improved with product name parsing
      }
    }

    if (strikes.length < 2) return null;

    let S = 10000; // default spot
    if (underlyingOb && underlyingOb.length > 0) {
      const idx = Math.min(bisectLeft(underlyingOb.timestamps, ts), underlyingOb.length - 1);
      S = underlyingOb.midPrices[idx];
    }

    // Assume ~7 days to expiry (typical for Prosperity rounds)
    const T = 7 / 365;
    const smile = buildIVSmile(strikes, prices, types, S, T, 0);
    return { smile, S, T };
  }, [logA, crosshair.timestamp]);

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

    if (!smileData || smileData.smile.length === 0) {
      ctx.fillStyle = "#5c6370";
      ctx.font = FONT;
      ctx.textAlign = "center";
      ctx.fillText("No option products found (looking for VOUCHER/OPTION)", w / 2, height / 2);
      return;
    }

    const { smile, S } = smileData;
    const PAD = { top: 16, right: 20, bottom: 30, left: 50 };
    const plotW = w - PAD.left - PAD.right;
    const plotH = height - PAD.top - PAD.bottom;

    const strikes = smile.map((p) => p.strike);
    const ivs = smile.map((p) => p.iv * 100); // convert to %

    const xMin = Math.min(...strikes) * 0.99;
    const xMax = Math.max(...strikes) * 1.01;
    const yMin = 0;
    const yMax = Math.max(...ivs) * 1.1;

    const toX = (k: number) => PAD.left + ((k - xMin) / (xMax - xMin)) * plotW;
    const toY = (iv: number) => PAD.top + plotH - ((iv - yMin) / (yMax - yMin)) * plotH;

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PAD.top + (i / 4) * plotH;
      ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(w - PAD.right, y); ctx.stroke();
    }

    // ATM line
    const xAtm = toX(S);
    ctx.strokeStyle = "rgba(255,167,38,0.3)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(xAtm, PAD.top); ctx.lineTo(xAtm, PAD.top + plotH); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffa726";
    ctx.font = FONT;
    ctx.textAlign = "center";
    ctx.fillText("ATM", xAtm, PAD.top - 3);

    // IV smile curve
    ctx.strokeStyle = "#00d4aa";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    for (let i = 0; i < smile.length; i++) {
      const x = toX(smile[i].strike);
      const y = toY(smile[i].iv * 100);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Dots
    for (const pt of smile) {
      const x = toX(pt.strike);
      const y = toY(pt.iv * 100);
      ctx.fillStyle = "#00d4aa";
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // Strike label
      ctx.fillStyle = "#9aa0b0";
      ctx.font = "9px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText(pt.strike.toString(), x, PAD.top + plotH + 12);
      // IV label
      ctx.fillStyle = "#00d4aa";
      ctx.fillText(`${(pt.iv * 100).toFixed(1)}%`, x, y - 6);
    }

    // Y axis
    ctx.fillStyle = "#9aa0b0";
    ctx.font = FONT;
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (i / 4) * (yMax - yMin);
      ctx.fillText(`${v.toFixed(0)}%`, PAD.left - 4, PAD.top + plotH - (i / 4) * plotH + 3);
    }

    // Title
    ctx.fillStyle = "#5c6370";
    ctx.textAlign = "left";
    ctx.fillText("IV Smile (Black-Scholes)", PAD.left, height - 4);
  }, [smileData, height]);

  useEffect(() => { dirtyRef.current = true; }, [smileData]);

  useEffect(() => {
    let running = true;
    const loop = () => { if (!running) return; render(); requestAnimationFrame(loop); };
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
