"use client";
import React, { useMemo } from "react";
import { CanvasChart, ChartSeries } from "./CanvasChart";
import { useVisualizerStore, selectVPIN } from "@/lib/store/useVisualizerStore";

export function VPINChart() {
  const vpin = useVisualizerStore(selectVPIN);

  const series = useMemo((): ChartSeries[] => {
    if (!vpin || vpin.vpin.length === 0) return [];
    return [
      {
        id: "vpin",
        label: "VPIN",
        timestamps: vpin.bucketEndTimes,
        values: vpin.vpin,
        color: "#ef5350",
        type: "area",
        fillAlpha: 0.15,
        lineWidth: 1.5,
      },
      {
        id: "buy_frac",
        label: "Buy%",
        timestamps: vpin.bucketEndTimes,
        values: vpin.buyVolFrac,
        color: "#26a69a",
        type: "line",
        lineWidth: 1,
        yAxis: "right",
      },
    ];
  }, [vpin]);

  if (!vpin || vpin.vpin.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-text-muted text-xs font-mono">
        Insufficient trade data for VPIN (need &gt;10 trades)
      </div>
    );
  }

  return (
    <CanvasChart
      series={series}
      height={160}
      yLeftLabel="VPIN"
      yRightLabel="Buy Frac"
      showZeroLine={false}
      className="w-full"
    />
  );
}
