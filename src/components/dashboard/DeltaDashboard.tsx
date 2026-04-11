"use client";
/**
 * DeltaDashboard — side-by-side strategy comparison with delta metrics.
 */

import React from "react";
import { TrendingUp, TrendingDown, Minus, ArrowUp, ArrowDown } from "lucide-react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useVisualizerStore,
  selectMetricsA,
  selectMetricsB,
  selectDeltaMetrics,
} from "@/lib/store/useVisualizerStore";

function fmt(n: number, decimals = 2): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  return n.toFixed(decimals);
}

function fmtPct(n: number): string {
  if (!isFinite(n) || isNaN(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  if (!isFinite(value) || value === 0) return <Badge variant="neutral">0.00</Badge>;
  const positive = invert ? value < 0 : value > 0;
  return (
    <Badge variant={positive ? "bull" : "bear"}>
      {positive ? <ArrowUp className="h-2.5 w-2.5 mr-0.5" /> : <ArrowDown className="h-2.5 w-2.5 mr-0.5" />}
      {Math.abs(value).toFixed(2)}
    </Badge>
  );
}

interface MetricRowProps {
  label: string;
  a: string;
  b: string | null;
  delta?: number;
  invertDelta?: boolean;
  highlight?: boolean;
}

function MetricRow({ label, a, b, delta, invertDelta, highlight }: MetricRowProps) {
  return (
    <div
      className={`grid grid-cols-4 items-center px-3 py-1.5 border-b border-border/50 text-xs font-mono
        ${highlight ? "bg-surface-3/50" : ""}`}
    >
      <span className="text-text-muted col-span-1">{label}</span>
      <span className="text-strat-a text-right">{a}</span>
      <span className="text-strat-b text-right">{b ?? "—"}</span>
      <div className="flex justify-end">
        {delta !== undefined ? (
          <DeltaBadge value={delta} invert={invertDelta} />
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </div>
    </div>
  );
}

export function DeltaDashboard() {
  const metricsA = useVisualizerStore(selectMetricsA);
  const metricsB = useVisualizerStore(selectMetricsB);
  const delta = useVisualizerStore(selectDeltaMetrics);

  const hasData = metricsA || metricsB;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center h-32 text-text-muted text-xs font-mono">
        Upload log files to see strategy comparison
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Strategy Delta Analysis</CardTitle>
            <div className="flex gap-2">
              <Badge variant="stratA">Strategy A</Badge>
              {metricsB && <Badge variant="stratB">Strategy B</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {/* Header row */}
          <div className="grid grid-cols-4 items-center px-3 py-1.5 bg-surface-1 text-[10px] font-mono uppercase tracking-wider text-text-muted border-b border-border">
            <span>Metric</span>
            <span className="text-right text-strat-a">A</span>
            <span className="text-right text-strat-b">B</span>
            <span className="text-right">Delta (A−B)</span>
          </div>

          {/* PnL section */}
          <MetricRow
            label="Total PnL"
            a={fmt(metricsA?.totalPnL ?? 0)}
            b={metricsB ? fmt(metricsB.totalPnL) : null}
            delta={delta?.pnlDelta}
            highlight
          />
          <MetricRow
            label="Max Drawdown"
            a={fmt(metricsA?.maxDrawdown ?? 0)}
            b={metricsB ? fmt(metricsB.maxDrawdown) : null}
            delta={delta?.drawdownDiff}
            invertDelta
          />
          <MetricRow
            label="Win Rate"
            a={fmtPct(metricsA?.winRate ?? 0)}
            b={metricsB ? fmtPct(metricsB.winRate) : null}
            delta={delta ? delta.winRateDiff * 100 : undefined}
          />

          {/* Risk section */}
          <MetricRow
            label="Sharpe Ratio"
            a={fmt(metricsA?.sharpeRatio ?? 0)}
            b={metricsB ? fmt(metricsB.sharpeRatio) : null}
            delta={delta?.sharpeDiff}
          />
          <MetricRow
            label="Sortino Ratio"
            a={fmt(metricsA?.sortinoRatio ?? 0)}
            b={metricsB ? fmt(metricsB.sortinoRatio) : null}
            delta={metricsA && metricsB ? metricsA.sortinoRatio - metricsB.sortinoRatio : undefined}
          />
          <MetricRow
            label="Profit Factor"
            a={isFinite(metricsA?.profitFactor ?? 0) ? fmt(metricsA?.profitFactor ?? 0) : "∞"}
            b={metricsB ? (isFinite(metricsB.profitFactor) ? fmt(metricsB.profitFactor) : "∞") : null}
            delta={metricsA && metricsB && isFinite(metricsA.profitFactor) && isFinite(metricsB.profitFactor)
              ? metricsA.profitFactor - metricsB.profitFactor : undefined}
          />

          {/* Activity section */}
          <MetricRow
            label="Total Trades"
            a={String(metricsA?.totalTrades ?? 0)}
            b={metricsB ? String(metricsB.totalTrades) : null}
            delta={metricsA && metricsB ? metricsA.totalTrades - metricsB.totalTrades : undefined}
            highlight
          />
          <MetricRow
            label="Avg Trade Size"
            a={fmt(metricsA?.avgTradeSize ?? 0, 1)}
            b={metricsB ? fmt(metricsB.avgTradeSize, 1) : null}
            delta={metricsA && metricsB ? metricsA.avgTradeSize - metricsB.avgTradeSize : undefined}
          />
          <MetricRow
            label="Participation"
            a={fmtPct(metricsA?.participationRate ?? 0)}
            b={metricsB ? fmtPct(metricsB.participationRate) : null}
            delta={delta ? delta.participationDelta * 100 : undefined}
          />
        </CardContent>
      </Card>
    </motion.div>
  );
}
