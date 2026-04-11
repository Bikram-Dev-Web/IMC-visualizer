"use client";
/**
 * Main page — full-screen trading visualizer dashboard.
 *
 * Layout:
 *   [Header]
 *   [Sidebar | Main Charts Area]
 *   [TimeController]
 *
 * Main area uses tabs:
 *   - Overview: Price + PnL + Inventory Heatmap
 *   - Microstructure: OFI + Depth + Wall-Mid
 *   - Advanced: ETF Spread + VPIN + IV Smile + Alpha Decay
 *   - Delta: Full comparison dashboard
 *   - AI: Natural language analysis
 */

import React, { Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { TimeController } from "@/components/layout/TimeController";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DualLogUploader } from "@/components/upload/LogUploader";
import { PriceChart } from "@/components/charts/PriceChart";
import { PnLChart } from "@/components/charts/PnLChart";
import { InventoryHeatmap } from "@/components/charts/InventoryHeatmap";
import { DepthChart } from "@/components/charts/DepthChart";
import { OFIChart } from "@/components/charts/OFIChart";
import { ETFSpreadChart } from "@/components/charts/ETFSpreadChart";
import { VPINChart } from "@/components/charts/VPINChart";
import { IVSmile } from "@/components/charts/IVSmile";
import { DeltaDashboard } from "@/components/dashboard/DeltaDashboard";
import { TradeTable } from "@/components/dashboard/TradeTable";
import { AIAnalysis } from "@/components/dashboard/AIAnalysis";
import { useVisualizerStore } from "@/lib/store/useVisualizerStore";

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-mono uppercase tracking-widest text-text-muted px-1 mb-1">
      {children}
    </div>
  );
}

function ChartSection({
  title,
  children,
  collapsible = false,
}: {
  title: string;
  children: React.ReactNode;
  collapsible?: boolean;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        className="flex items-center gap-2 text-left px-0.5 group"
        onClick={() => collapsible && setCollapsed((c) => !c)}
      >
        <span className="text-[9px] font-mono uppercase tracking-widest text-text-muted group-hover:text-text-secondary transition-colors">
          {title}
        </span>
        {collapsible && (
          <span className="text-[9px] text-text-muted">{collapsed ? "▶" : "▼"}</span>
        )}
      </button>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function VisualizerPage() {
  const hasAnyData = useVisualizerStore(
    (s) => s.logA !== null || s.logB !== null
  );
  const loadStateA = useVisualizerStore((s) => s.loadStateA);
  const loadStateB = useVisualizerStore((s) => s.loadStateB);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-surface-0">
      <Header />

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <Sidebar />

        {/* Main content */}
        <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {!hasAnyData ? (
            /* Landing / upload state */
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <h1 className="text-2xl font-mono font-bold text-text-primary mb-2">
                  IMC Prosperity 4 <span className="text-strat-a">Pro</span> Visualizer
                </h1>
                <p className="text-sm text-text-muted font-mono max-w-lg">
                  Upload one or two strategy log files to begin analysis.
                  Supports 100k+ timestamps with ~60fps rendering via LTTB downsampling.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="w-full max-w-2xl"
              >
                <DualLogUploader />
              </motion.div>

              {/* Feature grid */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-2 md:grid-cols-4 gap-3 w-full max-w-2xl"
              >
                {[
                  ["OFI + MLOFI", "Order flow imbalance across 5 levels"],
                  ["Wall-Mid Price", "Liquidity wall detection & fair value"],
                  ["VPIN", "Flow toxicity via Lee-Ready classification"],
                  ["IV Smile", "Black-Scholes inversion with Newton-Raphson"],
                  ["LTTB", "100k→2k downsampling at 60fps"],
                  ["Alpha Decay", "IC half-life estimation"],
                  ["ETF Spread", "Basket vs NAV with z-score"],
                  ["AI Analysis", "Natural language log insights"],
                ].map(([name, desc]) => (
                  <div
                    key={name}
                    className="rounded border border-border bg-surface-2 p-3 flex flex-col gap-1"
                  >
                    <span className="text-[10px] font-mono font-semibold text-strat-a">{name}</span>
                    <span className="text-[9px] text-text-muted">{desc}</span>
                  </div>
                ))}
              </motion.div>
            </div>
          ) : (
            /* Full dashboard */
            <Tabs defaultValue="overview" className="flex-1 min-h-0 flex flex-col">
              <div className="border-b border-border px-3 py-1.5 bg-surface-1">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="microstructure">Microstructure</TabsTrigger>
                  <TabsTrigger value="advanced">Advanced</TabsTrigger>
                  <TabsTrigger value="delta">Delta</TabsTrigger>
                  <TabsTrigger value="trades">Trades</TabsTrigger>
                  <TabsTrigger value="ai">AI Analysis</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
                <TabsContent value="overview" className="mt-0 space-y-3">
                  <ChartSection title="Mid Price + Trades">
                    <PriceChart />
                  </ChartSection>
                  <ChartSection title="Cumulative PnL">
                    <PnLChart />
                  </ChartSection>
                  <ChartSection title="Inventory Heatmap" collapsible>
                    <InventoryHeatmap height={90} />
                  </ChartSection>
                </TabsContent>

                <TabsContent value="microstructure" className="mt-0 space-y-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>Order Book Depth</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <DepthChart height={200} />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>Order Flow Imbalance (OFI / MLOFI)</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <OFIChart />
                      </CardContent>
                    </Card>
                  </div>
                  <ChartSection title="PnL — for cross-reference">
                    <PnLChart />
                  </ChartSection>
                </TabsContent>

                <TabsContent value="advanced" className="mt-0 space-y-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Card>
                      <CardHeader>
                        <CardTitle>ETF / Basket Spread + Z-Score</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <ETFSpreadChart />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>VPIN — Flow Toxicity</CardTitle>
                      </CardHeader>
                      <CardContent className="p-2">
                        <VPINChart />
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader>
                      <CardTitle>IV Smile (Black-Scholes Inversion)</CardTitle>
                    </CardHeader>
                    <CardContent className="p-2">
                      <IVSmile height={220} />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="delta" className="mt-0">
                  <DeltaDashboard />
                </TabsContent>

                <TabsContent value="trades" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Trade History (viewport)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <TradeTable />
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="ai" className="mt-0">
                  <Card className="h-[600px] flex flex-col">
                    <CardHeader>
                      <CardTitle>AI Log Analysis — Natural Language Queries</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 min-h-0 overflow-hidden">
                      <AIAnalysis />
                    </CardContent>
                  </Card>
                </TabsContent>
              </div>
            </Tabs>
          )}

          <TimeController />
        </main>
      </div>
    </div>
  );
}
