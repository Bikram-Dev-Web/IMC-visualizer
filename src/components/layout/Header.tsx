"use client";
import React from "react";
import { motion } from "framer-motion";
import { Activity, BarChart2, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { useVisualizerStore, selectProducts, selectProduct } from "@/lib/store/useVisualizerStore";

export function Header() {
  const products = useVisualizerStore(selectProducts);
  const selectedProduct = useVisualizerStore(selectProduct);
  const showStratB = useVisualizerStore((s) => s.showStratB);
  const { setSelectedProduct, toggleStratB, resetViewport } = useVisualizerStore();

  const hasData = useVisualizerStore((s) => s.logA !== null || s.logB !== null);

  return (
    <header className="h-12 border-b border-border bg-surface-1 flex items-center px-4 gap-4 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <motion.div
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
        >
          <Activity className="h-4 w-4 text-strat-a" />
        </motion.div>
        <span className="text-sm font-mono font-bold text-text-primary hidden sm:block">
          IMC<span className="text-strat-a">·</span>Prosperity<span className="text-strat-a">·</span>Pro
        </span>
        <Badge variant="neutral">v4</Badge>
      </div>

      <div className="h-5 w-px bg-border hidden md:block" />

      {/* Product selector */}
      {hasData && products.length > 0 && (
        <Select
          value={selectedProduct}
          onValueChange={setSelectedProduct}
          options={products.map((p) => ({ value: p, label: p }))}
          placeholder="Select product"
          className="min-w-[160px]"
        />
      )}

      <div className="flex-1" />

      {/* Controls */}
      <div className="flex items-center gap-2">
        {hasData && (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={toggleStratB}
              title={showStratB ? "Hide Strategy B" : "Show Strategy B"}
            >
              {showStratB
                ? <Eye className="h-3.5 w-3.5 text-strat-b" />
                : <EyeOff className="h-3.5 w-3.5 text-text-muted" />}
              <span className="hidden sm:inline ml-1">Strat B</span>
            </Button>
            <Button size="sm" variant="ghost" onClick={resetViewport} title="Reset viewport">
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-strat-a" /> A
          <span className="h-1.5 w-1.5 rounded-full bg-strat-b ml-1" /> B
        </div>
      </div>
    </header>
  );
}
