"use client";
/**
 * PriceChart — mid price overlay with trade markers, wall-mid, and fair value.
 * Combines: mid price (A), mid price (B), wall-mid, fair value, trade dots.
 */

import React, { useMemo } from "react";
import { CanvasChart, ChartSeries } from "./CanvasChart";
import { useVisualizerStore, selectProduct, selectWallMid } from "@/lib/store/useVisualizerStore";
import type { ChartAnnotation } from "@/types";

export function PriceChart() {
  const logA = useVisualizerStore((s) => s.logA);
  const logB = useVisualizerStore((s) => s.logB);
  const showStratB = useVisualizerStore((s) => s.showStratB);
  const product = useVisualizerStore(selectProduct);
  const { wallMidA, wallMidB } = useVisualizerStore(selectWallMid);

  const series = useMemo((): ChartSeries[] => {
    const out: ChartSeries[] = [];

    const obA = logA?.orderBooks.get(product);
    const obB = logB?.orderBooks.get(product);

    if (obA && obA.length > 0) {
      out.push({
        id: "mid_a",
        label: "Mid A",
        timestamps: obA.timestamps,
        values: obA.midPrices,
        color: "#00d4aa",
        type: "line",
        lineWidth: 1.5,
      });

      // Best bid / ask as area
      if (obA.bidPrices[0] && obA.askPrices[0]) {
        out.push({
          id: "bid_a",
          label: "Bid A",
          timestamps: obA.timestamps,
          values: obA.bidPrices[0],
          color: "#26a69a",
          type: "line",
          lineWidth: 0.8,
          fillAlpha: 0,
        });
        out.push({
          id: "ask_a",
          label: "Ask A",
          timestamps: obA.timestamps,
          values: obA.askPrices[0],
          color: "#ef5350",
          type: "line",
          lineWidth: 0.8,
        });
      }

      if (wallMidA) {
        out.push({
          id: "wall_mid_a",
          label: "Wall-Mid A",
          timestamps: wallMidA.timestamps,
          values: wallMidA.fairValue,
          color: "#ffa726",
          type: "line",
          lineWidth: 1,
        });
      }
    }

    if (obB && obB.length > 0 && showStratB) {
      out.push({
        id: "mid_b",
        label: "Mid B",
        timestamps: obB.timestamps,
        values: obB.midPrices,
        color: "#7c6af7",
        type: "line",
        lineWidth: 1.5,
      });
    }

    // Trade markers (own trades as scatter)
    const trA = logA?.trades.get(product);
    if (trA && trA.length > 0) {
      const buyTs: number[] = [], buyV: number[] = [];
      const sellTs: number[] = [], sellV: number[] = [];
      for (let i = 0; i < trA.length; i++) {
        if (!trA.isOwn[i]) continue;
        if (trA.aggressors[i] === 1) {
          buyTs.push(trA.timestamps[i]);
          buyV.push(trA.prices[i]);
        } else if (trA.aggressors[i] === -1) {
          sellTs.push(trA.timestamps[i]);
          sellV.push(trA.prices[i]);
        }
      }
      if (buyTs.length > 0) {
        out.push({
          id: "buy_trades_a",
          label: "Buy A",
          timestamps: new Float64Array(buyTs),
          values: new Float64Array(buyV),
          color: "#26a69a",
          type: "scatter",
          dotRadius: 4,
        });
      }
      if (sellTs.length > 0) {
        out.push({
          id: "sell_trades_a",
          label: "Sell A",
          timestamps: new Float64Array(sellTs),
          values: new Float64Array(sellV),
          color: "#ef5350",
          type: "scatter",
          dotRadius: 4,
        });
      }
    }

    return out;
  }, [logA, logB, product, wallMidA, wallMidB, showStratB]);

  // Drawdown annotations
  const annotations = useMemo((): ChartAnnotation[] => {
    const ann: ChartAnnotation[] = [];
    const metricsA = useVisualizerStore.getState().metricsA;
    if (metricsA && metricsA.maxDrawdownStart) {
      ann.push({
        timestamp: metricsA.maxDrawdownStart,
        label: "DD Start",
        color: "#ef5350",
        type: "vertical",
      });
      ann.push({
        timestamp: metricsA.maxDrawdownEnd,
        label: "DD End",
        color: "#ef535088",
        type: "vertical",
      });
    }
    return ann;
  }, []);

  return (
    <CanvasChart
      series={series}
      height={300}
      annotations={annotations}
      yLeftLabel="Price"
      showZeroLine={false}
      className="w-full"
    />
  );
}
