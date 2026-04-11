"use client";
import React, { useState } from "react";
import { ChevronLeft, ChevronRight, BarChart2, TrendingUp, Activity, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { MetricsPanel } from "@/components/dashboard/MetricsPanel";
import { LogUploader } from "@/components/upload/LogUploader";

const SIDEBAR_W = 280;

export function Sidebar() {
  const [open, setOpen] = useState(true);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.aside
          key="open"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: SIDEBAR_W, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="shrink-0 border-r border-border bg-surface-1 flex flex-col overflow-hidden"
          style={{ width: SIDEBAR_W }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Config & Metrics
            </span>
            <Button size="icon" variant="ghost" onClick={() => setOpen(false)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
            {/* Upload */}
            <section>
              <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Log Files
              </div>
              <div className="flex flex-col gap-2">
                <LogUploader strategyId="A" />
                <LogUploader strategyId="B" />
              </div>
            </section>

            {/* Metrics */}
            <section>
              <div className="text-[9px] font-mono uppercase tracking-wider text-text-muted mb-2">
                Performance
              </div>
              <MetricsPanel />
            </section>
          </div>
        </motion.aside>
      ) : (
        <motion.div
          key="closed"
          initial={{ width: 0 }}
          animate={{ width: 32 }}
          exit={{ width: 0 }}
          className="shrink-0 border-r border-border bg-surface-1 flex flex-col items-center py-3 gap-3"
        >
          <Button size="icon" variant="ghost" onClick={() => setOpen(true)} title="Expand sidebar">
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
          <BarChart2 className="h-3.5 w-3.5 text-text-muted" />
          <TrendingUp className="h-3.5 w-3.5 text-text-muted" />
          <Activity className="h-3.5 w-3.5 text-text-muted" />
          <Layers className="h-3.5 w-3.5 text-text-muted" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
