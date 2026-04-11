"use client";
import React from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useVisualizerStore, selectMetricsA, selectMetricsB, selectProduct } from "@/lib/store/useVisualizerStore";

function StatCard({
  label,
  value,
  sub,
  variant,
}: {
  label: string;
  value: string;
  sub?: string;
  variant?: "bull" | "bear" | "neutral" | "default";
}) {
  const colorMap = {
    bull: "text-bull",
    bear: "text-bear",
    neutral: "text-neutral",
    default: "text-text-primary",
  };
  return (
    <div className="flex flex-col gap-0.5 p-2 rounded bg-surface-3 border border-border/50">
      <span className="text-[9px] font-mono uppercase tracking-wider text-text-muted">{label}</span>
      <span className={`text-base font-mono font-bold tabular-nums ${colorMap[variant ?? "default"]}`}>
        {value}
      </span>
      {sub && <span className="text-[9px] text-text-muted">{sub}</span>}
    </div>
  );
}

export function MetricsPanel() {
  const metricsA = useVisualizerStore(selectMetricsA);
  const metricsB = useVisualizerStore(selectMetricsB);
  const product = useVisualizerStore(selectProduct);

  const prodA = metricsA?.byProduct.get(product);
  const prodB = metricsB?.byProduct.get(product);

  const renderStrategy = (
    label: string,
    color: string,
    metrics: typeof metricsA,
    prodMetrics: typeof prodA
  ) => {
    if (!metrics) return null;
    const pnl = metrics.totalPnL;
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 px-1">
          <div className="h-2 w-2 rounded-full" style={{ background: color }} />
          <span className="text-xs font-mono font-semibold" style={{ color }}>
            {label}
          </span>
          <Badge variant={pnl >= 0 ? "bull" : "bear"}>
            {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <StatCard
            label="Total PnL"
            value={pnl.toFixed(2)}
            variant={pnl >= 0 ? "bull" : "bear"}
          />
          <StatCard
            label="Drawdown"
            value={metrics.maxDrawdown.toFixed(2)}
            variant="bear"
          />
          <StatCard
            label="Win Rate"
            value={(metrics.winRate * 100).toFixed(1) + "%"}
            variant={metrics.winRate >= 0.5 ? "bull" : "bear"}
          />
          <StatCard
            label="Sharpe"
            value={metrics.sharpeRatio.toFixed(3)}
            variant={metrics.sharpeRatio >= 1 ? "bull" : metrics.sharpeRatio < 0 ? "bear" : "neutral"}
          />
          <StatCard
            label="Sortino"
            value={metrics.sortinoRatio.toFixed(3)}
            variant={metrics.sortinoRatio >= 1 ? "bull" : "bear"}
          />
          <StatCard
            label="Profit Factor"
            value={isFinite(metrics.profitFactor) ? metrics.profitFactor.toFixed(2) : "∞"}
            variant={metrics.profitFactor >= 1.5 ? "bull" : "neutral"}
          />
        </div>

        {prodMetrics && (
          <>
            <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted px-1 pt-1 border-t border-border/50">
              {product} Detail
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <StatCard label="Product PnL" value={prodMetrics.pnl.toFixed(2)} variant={prodMetrics.pnl >= 0 ? "bull" : "bear"} />
              <StatCard label="Trades" value={String(prodMetrics.tradeCount)} />
              <StatCard label="Volume" value={String(prodMetrics.volumeTraded)} />
              <StatCard label="Avg Spread" value={prodMetrics.avgSpread.toFixed(2)} />
              <StatCard label="Inv. Min" value={prodMetrics.inventoryRange[0].toFixed(0)} />
              <StatCard label="Inv. Max" value={prodMetrics.inventoryRange[1].toFixed(0)} />
            </div>
          </>
        )}
      </div>
    );
  };

  if (!metricsA && !metricsB) {
    return (
      <div className="text-xs text-text-muted font-mono p-4 text-center">
        No metrics — upload log files
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col gap-3"
    >
      {renderStrategy("Strategy A", "#00d4aa", metricsA, prodA)}
      {metricsB && (
        <>
          <div className="border-t border-border" />
          {renderStrategy("Strategy B", "#7c6af7", metricsB, prodB)}
        </>
      )}
    </motion.div>
  );
}
