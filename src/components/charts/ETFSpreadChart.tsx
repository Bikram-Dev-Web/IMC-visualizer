"use client";
import React, { useMemo } from "react";
import { CanvasChart, ChartSeries } from "./CanvasChart";
import { useVisualizerStore, selectETFSpread } from "@/lib/store/useVisualizerStore";

export function ETFSpreadChart() {
  const etf = useVisualizerStore(selectETFSpread);

  const series = useMemo((): ChartSeries[] => {
    if (!etf) return [];
    return [
      {
        id: "spread",
        label: "Spread",
        timestamps: etf.timestamps,
        values: etf.spread,
        color: "#00d4aa",
        type: "area",
        fillAlpha: 0.1,
        lineWidth: 1.5,
      },
      {
        id: "zscore",
        label: "Z-Score",
        timestamps: etf.timestamps,
        values: etf.zScore,
        color: "#ffa726",
        type: "line",
        lineWidth: 1.2,
        yAxis: "right",
      },
    ];
  }, [etf]);

  if (!etf) {
    return (
      <div className="flex items-center justify-center h-24 text-text-muted text-xs font-mono">
        Select a basket product to see ETF spread
      </div>
    );
  }

  return (
    <CanvasChart
      series={series}
      height={180}
      yLeftLabel="Spread"
      yRightLabel="Z-Score"
      showZeroLine={true}
      className="w-full"
    />
  );
}
