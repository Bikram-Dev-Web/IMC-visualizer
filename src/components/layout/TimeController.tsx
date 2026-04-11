"use client";
import React, { useMemo } from "react";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useVisualizerStore, selectViewport } from "@/lib/store/useVisualizerStore";

function formatTs(ts: number): string {
  if (ts > 1_000_000_000) return new Date(ts).toLocaleTimeString("en-US", { hour12: false });
  return `T${Math.round(ts).toLocaleString()}`;
}

export function TimeController() {
  const viewport = useVisualizerStore(selectViewport);
  const logA = useVisualizerStore((s) => s.logA);
  const { setViewport, zoomViewport, resetViewport } = useVisualizerStore();

  const globalMin = useMemo(() => {
    if (!logA || logA.globalTimestamps.length === 0) return 0;
    return logA.globalTimestamps[0];
  }, [logA]);

  const globalMax = useMemo(() => {
    if (!logA || logA.globalTimestamps.length === 0) return 1_000_000;
    return logA.globalTimestamps[logA.globalTimestamps.length - 1];
  }, [logA]);

  const handleStartChange = (v: number) => {
    if (v < viewport.xMax - 100) {
      setViewport({ xMin: v, xMax: viewport.xMax });
    }
  };

  const handleEndChange = (v: number) => {
    if (v > viewport.xMin + 100) {
      setViewport({ xMin: viewport.xMin, xMax: v });
    }
  };

  const center = (viewport.xMin + viewport.xMax) / 2;

  return (
    <div className="border-t border-border bg-surface-1 px-4 py-2 flex items-center gap-4 shrink-0">
      {/* Time range labels */}
      <div className="flex flex-col text-[10px] font-mono text-text-muted w-20">
        <span>{formatTs(viewport.xMin)}</span>
        <span className="text-text-primary">{formatTs(center)}</span>
      </div>

      {/* Range sliders */}
      <div className="flex-1 flex flex-col gap-1.5">
        <Slider
          min={globalMin}
          max={globalMax}
          step={(globalMax - globalMin) / 10000}
          value={viewport.xMin}
          onChange={handleStartChange}
          label="Start"
          formatValue={formatTs}
        />
        <Slider
          min={globalMin}
          max={globalMax}
          step={(globalMax - globalMin) / 10000}
          value={viewport.xMax}
          onChange={handleEndChange}
          label="End"
          formatValue={formatTs}
        />
      </div>

      {/* Time range labels (end) */}
      <div className="flex flex-col text-[10px] font-mono text-text-muted w-20 text-right">
        <span>{formatTs(viewport.xMax)}</span>
        <span className="text-strat-a">
          Δ {Math.round(viewport.xMax - viewport.xMin).toLocaleString()}
        </span>
      </div>

      {/* Zoom controls */}
      <div className="flex gap-1">
        <Button size="icon" variant="ghost" onClick={() => zoomViewport(0.5, center)} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => zoomViewport(2, center)} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" onClick={resetViewport} title="Fit all">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
