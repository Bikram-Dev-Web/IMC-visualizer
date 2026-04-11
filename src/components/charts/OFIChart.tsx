"use client";
import React, { useMemo } from "react";
import { CanvasChart, ChartSeries } from "./CanvasChart";
import { useVisualizerStore, selectOFI } from "@/lib/store/useVisualizerStore";

export function OFIChart() {
  const { ofiA, ofiB } = useVisualizerStore(selectOFI);
  const showStratB = useVisualizerStore((s) => s.showStratB);

  const series = useMemo((): ChartSeries[] => {
    const out: ChartSeries[] = [];
    if (ofiA) {
      out.push({
        id: "ofi_a",
        label: "OFI A",
        timestamps: ofiA.timestamps,
        values: ofiA.ofi,
        color: "#00d4aa",
        type: "bar",
        lineWidth: 1,
      });
      out.push({
        id: "mlofi_a",
        label: "MLOFI A",
        timestamps: ofiA.timestamps,
        values: ofiA.mlofi,
        color: "#ffa726",
        type: "line",
        lineWidth: 1,
        yAxis: "right",
      });
    }
    if (ofiB && showStratB) {
      out.push({
        id: "ofi_b",
        label: "OFI B",
        timestamps: ofiB.timestamps,
        values: ofiB.ofi,
        color: "#7c6af7",
        type: "line",
        lineWidth: 1,
      });
    }
    return out;
  }, [ofiA, ofiB, showStratB]);

  return (
    <CanvasChart
      series={series}
      height={180}
      yLeftLabel="OFI"
      yRightLabel="MLOFI"
      showZeroLine={true}
      className="w-full"
    />
  );
}
