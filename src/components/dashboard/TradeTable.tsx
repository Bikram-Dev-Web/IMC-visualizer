"use client";
import React, { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUp, ArrowDown, Bot, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useVisualizerStore,
  selectProduct,
  selectViewport,
} from "@/lib/store/useVisualizerStore";
import { bisectLeft, bisectRight } from "@/lib/math/lttb";

const PAGE_SIZE = 50;

export function TradeTable() {
  const logA = useVisualizerStore((s) => s.logA);
  const product = useVisualizerStore(selectProduct);
  const viewport = useVisualizerStore(selectViewport);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<"all" | "own" | "bot">("all");

  const trades = useMemo(() => {
    const tr = logA?.trades.get(product);
    if (!tr || tr.length === 0) return [];

    const lo = bisectLeft(tr.timestamps, viewport.xMin);
    const hi = bisectRight(tr.timestamps, viewport.xMax);

    const result: {
      ts: number;
      price: number;
      qty: number;
      side: "BUY" | "SELL" | "UNKNOWN";
      isOwn: boolean;
      isBot: boolean;
    }[] = [];

    for (let i = lo; i < hi; i++) {
      const side =
        tr.aggressors[i] === 1 ? "BUY" : tr.aggressors[i] === -1 ? "SELL" : "UNKNOWN";
      const isOwn = tr.isOwn[i] === 1;
      const isBot = tr.isBot[i] === 1;

      if (filter === "own" && !isOwn) continue;
      if (filter === "bot" && !isBot) continue;

      result.push({
        ts: tr.timestamps[i],
        price: tr.prices[i],
        qty: tr.quantities[i],
        side,
        isOwn,
        isBot,
      });
    }
    return result;
  }, [logA, product, viewport, filter]);

  const totalPages = Math.ceil(trades.length / PAGE_SIZE);
  const visible = trades.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-2">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["all", "own", "bot"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "ghost"}
              onClick={() => { setFilter(f); setPage(0); }}
            >
              {f.toUpperCase()}
            </Button>
          ))}
        </div>
        <span className="text-[10px] text-text-muted font-mono">
          {trades.length} trades in viewport
        </span>
      </div>

      {/* Header */}
      <div className="grid grid-cols-5 text-[10px] font-mono uppercase tracking-wider text-text-muted px-2 py-1 border-b border-border">
        <span>Time</span>
        <span className="text-right">Price</span>
        <span className="text-right">Qty</span>
        <span className="text-center">Side</span>
        <span className="text-center">Who</span>
      </div>

      {/* Rows */}
      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        <AnimatePresence mode="popLayout">
          {visible.map((t, i) => (
            <motion.div
              key={`${t.ts}-${i}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.1 }}
              className="grid grid-cols-5 items-center px-2 py-1 border-b border-border/30 hover:bg-surface-3/50 text-xs font-mono"
            >
              <span className="text-text-muted">T{Math.round(t.ts)}</span>
              <span className="text-right text-text-primary tabular-nums">{t.price.toFixed(2)}</span>
              <span className="text-right text-text-secondary">{t.qty}</span>
              <div className="flex justify-center">
                {t.side === "BUY" ? (
                  <span className="flex items-center gap-0.5 text-bull">
                    <ArrowUp className="h-3 w-3" /> BUY
                  </span>
                ) : t.side === "SELL" ? (
                  <span className="flex items-center gap-0.5 text-bear">
                    <ArrowDown className="h-3 w-3" /> SELL
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                )}
              </div>
              <div className="flex justify-center">
                {t.isOwn ? (
                  <Badge variant="stratA"><User className="h-2.5 w-2.5 mr-0.5" />OWN</Badge>
                ) : (
                  <Badge variant="outline"><Bot className="h-2.5 w-2.5 mr-0.5" />BOT</Badge>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {visible.length === 0 && (
          <div className="text-xs text-text-muted font-mono p-4 text-center">
            No trades in current viewport
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            ←
          </Button>
          <span className="text-[10px] text-text-muted font-mono">
            {page + 1} / {totalPages}
          </span>
          <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            →
          </Button>
        </div>
      )}
    </div>
  );
}
