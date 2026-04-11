"use client";
/**
 * PnLChart — cumulative PnL comparison between Strategy A and B.
 * Includes delta series on secondary axis.
 */

import React, { useMemo } from "react";
import { CanvasChart, ChartSeries } from "./CanvasChart";
import { useVisualizerStore, selectProduct, selectDeltaMetrics } from "@/lib/store/useVisualizerStore";

export function PnLChart() {
  const logA = useVisualizerStore((s) => s.logA);
  const logB = useVisualizerStore((s) => s.logB);
  const showStratB = useVisualizerStore((s) => s.showStratB);
  const product = useVisualizerStore(selectProduct);
  const delta = useVisualizerStore(selectDeltaMetrics);

  const series = useMemo((): ChartSeries[] => {
    const out: ChartSeries[] = [];
    const obA = logA?.orderBooks.get(product);
    const obB = logB?.orderBooks.get(product);

    if (obA && obA.length > 0) {
      out.push({
        id: "pnl_a",
        label: "PnL A",
        timestamps: obA.timestamps,
        values: obA.pnls,
        color: "#00d4aa",
        type: "area",
        lineWidth: 1.5,
        fillAlpha: 0.12,
      });
    }

    if (obB && obB.length > 0 && showStratB) {
      out.push({
        id: "pnl_b",
        label: "PnL B",
        timestamps: obB.timestamps,
        values: obB.pnls,
        color: "#7c6af7",
        type: "area",
        lineWidth: 1.5,
        fillAlpha: 0.1,
      });
    }

    if (delta && delta.timestamps.length > 0) {
      out.push({
        id: "pnl_delta",
        label: "Δ PnL",
        timestamps: delta.timestamps,
        values: delta.pnlDeltaTimeSeries,
        color: "#ffa726",
        type: "line",
        lineWidth: 1,
        yAxis: "right",
      });
    }

    return out;
  }, [logA, logB, product, showStratB, delta]);

  return (
    <CanvasChart
      series={series}
      height={240}
      yLeftLabel="PnL (Seashells)"
      yRightLabel="Δ PnL"
      showZeroLine={true}
      className="w-full"
    />
  );
}
