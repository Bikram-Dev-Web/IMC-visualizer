/**
 * Zustand store — single source of truth for the visualizer.
 *
 * Design principles:
 * - Immutable updates (no direct mutation)
 * - Computed values derived on demand (not stored)
 * - Selector-based subscriptions → components re-render only when their slice changes
 */

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  AppState,
  ParsedLog,
  LoadState,
  StrategyMetrics,
  DeltaMetrics,
  OFIResult,
  WallMidResult,
  VPINResult,
  ETFSpreadResult,
  ViewPort,
  CrosshairState,
  AIChatMessage,
} from "@/types";
import { computeMetrics, computeDeltaMetrics } from "@/lib/parser/logParser";
import { computeOFI, computeWallMid } from "@/lib/math/ofi";
import { computeVPIN } from "@/lib/math/vpin";
import { rollingMean, rollingStdDev } from "@/lib/math/statistics";

// ─── Default viewport ─────────────────────────────────────────────────────────

const DEFAULT_VIEWPORT: ViewPort = { xMin: 0, xMax: 1_000_000 };
const DEFAULT_CROSSHAIR: CrosshairState = { timestamp: null, x: null };

// ─── Store interface ──────────────────────────────────────────────────────────

export interface VisualizerStore extends AppState {
  // Actions
  setLogA: (log: ParsedLog) => void;
  setLogB: (log: ParsedLog) => void;
  setLoadStateA: (state: LoadState) => void;
  setLoadStateB: (state: LoadState) => void;
  setParseProgressA: (p: number) => void;
  setParseProgressB: (p: number) => void;
  setSelectedProduct: (product: string) => void;
  setViewport: (viewport: ViewPort) => void;
  panViewport: (deltaX: number) => void; // pixels → time units
  zoomViewport: (factor: number, centerTs: number) => void;
  resetViewport: () => void;
  setCrosshair: (state: CrosshairState) => void;
  toggleStratB: () => void;
  addAIMessage: (msg: AIChatMessage) => void;
  clearAIHistory: () => void;
  reset: () => void;
  // Derived computation triggers (called after log load)
  _recomputeMetrics: () => void;
  _recomputeMicrostructure: (product: string) => void;
}

// ─── Initial state ────────────────────────────────────────────────────────────

const initialState: AppState = {
  logA: null,
  logB: null,
  loadStateA: "idle",
  loadStateB: "idle",
  parseProgressA: 0,
  parseProgressB: 0,
  selectedProduct: "",
  availableProducts: [],
  viewport: DEFAULT_VIEWPORT,
  crosshair: DEFAULT_CROSSHAIR,
  metricsA: null,
  metricsB: null,
  deltaMetrics: null,
  ofiA: null,
  ofiB: null,
  wallMidA: null,
  wallMidB: null,
  vpin: null,
  etfSpread: null,
  aiChatHistory: [],
  showStratB: true,
  theme: "dark",
};

// ─── Create store ─────────────────────────────────────────────────────────────

export const useVisualizerStore = create<VisualizerStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    setLoadStateA: (state) => set({ loadStateA: state }),
    setLoadStateB: (state) => set({ loadStateB: state }),
    setParseProgressA: (p) => set({ parseProgressA: p }),
    setParseProgressB: (p) => set({ parseProgressB: p }),

    setLogA: (log) => {
      const products = deriveProducts(log, get().logB);
      const selectedProduct = products[0] ?? "";
      set({ logA: log, availableProducts: products, selectedProduct, loadStateA: "ready" });
      get()._recomputeMetrics();
      if (selectedProduct) get()._recomputeMicrostructure(selectedProduct);
      fitViewport(log, set, get);
    },

    setLogB: (log) => {
      const products = deriveProducts(get().logA, log);
      const selectedProduct = get().selectedProduct || products[0] || "";
      set({ logB: log, availableProducts: products, selectedProduct, loadStateB: "ready" });
      get()._recomputeMetrics();
      if (selectedProduct) get()._recomputeMicrostructure(selectedProduct);
    },

    setSelectedProduct: (product) => {
      set({ selectedProduct: product });
      get()._recomputeMicrostructure(product);
    },

    setViewport: (viewport) => set({ viewport }),

    panViewport: (deltaTs) => {
      const { viewport } = get();
      const range = viewport.xMax - viewport.xMin;
      set({
        viewport: {
          xMin: viewport.xMin + deltaTs,
          xMax: viewport.xMax + deltaTs,
        },
      });
    },

    zoomViewport: (factor, centerTs) => {
      const { viewport } = get();
      const leftFrac = (centerTs - viewport.xMin) / (viewport.xMax - viewport.xMin);
      const rightFrac = 1 - leftFrac;
      const newRange = (viewport.xMax - viewport.xMin) * factor;
      const minRange = 100; // min 100 timestamp units
      const clampedRange = Math.max(minRange, newRange);
      set({
        viewport: {
          xMin: centerTs - leftFrac * clampedRange,
          xMax: centerTs + rightFrac * clampedRange,
        },
      });
    },

    resetViewport: () => {
      const { logA, logB } = get();
      const log = logA ?? logB;
      if (log) fitViewport(log, set, get);
      else set({ viewport: DEFAULT_VIEWPORT });
    },

    setCrosshair: (state) => set({ crosshair: state }),

    toggleStratB: () => set((s) => ({ showStratB: !s.showStratB })),

    addAIMessage: (msg) =>
      set((s) => ({ aiChatHistory: [...s.aiChatHistory, msg] })),

    clearAIHistory: () => set({ aiChatHistory: [] }),

    reset: () => set(initialState),

    // ─── Derived computations ───────────────────────────────────────────────

    _recomputeMetrics: () => {
      const { logA, logB } = get();
      let metricsA: StrategyMetrics | null = null;
      let metricsB: StrategyMetrics | null = null;
      let deltaMetrics: DeltaMetrics | null = null;

      if (logA) metricsA = computeMetrics(logA);
      if (logB) metricsB = computeMetrics(logB);
      if (logA && logB && metricsA && metricsB) {
        deltaMetrics = computeDeltaMetrics(logA, logB, metricsA, metricsB);
      }
      set({ metricsA, metricsB, deltaMetrics });
    },

    _recomputeMicrostructure: (product: string) => {
      const { logA, logB } = get();
      let ofiA: OFIResult | null = null;
      let ofiB: OFIResult | null = null;
      let wallMidA: WallMidResult | null = null;
      let wallMidB: WallMidResult | null = null;
      let vpin: VPINResult | null = null;
      let etfSpread: ETFSpreadResult | null = null;

      if (logA) {
        const ob = logA.orderBooks.get(product);
        if (ob) {
          ofiA = computeOFI(ob);
          wallMidA = computeWallMid(ob);
        }
      }
      if (logB) {
        const ob = logB.orderBooks.get(product);
        if (ob) {
          ofiB = computeOFI(ob);
          wallMidB = computeWallMid(ob);
        }
      }

      // VPIN from strategy A trades (or B if A not available)
      const activeLog = logA ?? logB;
      if (activeLog) {
        const ob = activeLog.orderBooks.get(product);
        const tr = activeLog.trades.get(product);
        if (ob && tr && tr.length > 10) {
          vpin = computeVPIN(tr, ob);
        }
      }

      // ETF spread: if product looks like a basket (contains "BASKET")
      // compute spread vs. synthetic NAV from component products
      if (
        activeLog &&
        (product.includes("BASKET") || product.includes("ETF") || product.includes("INDEX"))
      ) {
        etfSpread = computeETFSpread(activeLog, product);
      }

      set({ ofiA, ofiB, wallMidA, wallMidB, vpin, etfSpread });
    },
  }))
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveProducts(logA: ParsedLog | null, logB: ParsedLog | null): string[] {
  const set = new Set<string>();
  if (logA) logA.products.forEach((p) => set.add(p));
  if (logB) logB.products.forEach((p) => set.add(p));
  return Array.from(set).sort();
}

function fitViewport(
  log: ParsedLog,
  set: (s: Partial<AppState>) => void,
  get: () => VisualizerStore
) {
  if (log.globalTimestamps.length === 0) return;
  const xMin = log.globalTimestamps[0];
  const xMax = log.globalTimestamps[log.globalTimestamps.length - 1];
  set({ viewport: { xMin, xMax } });
}

function computeETFSpread(
  log: ParsedLog,
  basketProduct: string
): ETFSpreadResult | null {
  const basketOb = log.orderBooks.get(basketProduct);
  if (!basketOb) return null;

  // Find component products (heuristic: all non-basket products)
  const components = log.products.filter(
    (p) => !p.includes("BASKET") && !p.includes("ETF") && !p.includes("INDEX")
  );
  if (components.length === 0) return null;

  const n = basketOb.length;
  const spread = new Float64Array(n);
  const nav = new Float64Array(n);

  // Simple NAV: equal-weight sum of component mid prices
  for (let t = 0; t < n; t++) {
    const ts = basketOb.timestamps[t];
    let navAtT = 0;
    let compCount = 0;

    for (const comp of components) {
      const compOb = log.orderBooks.get(comp);
      if (!compOb) continue;
      // Find nearest timestamp in component
      let idx = bisect(compOb.timestamps, ts);
      if (idx >= compOb.length) idx = compOb.length - 1;
      navAtT += compOb.midPrices[idx];
      compCount++;
    }

    if (compCount > 0) nav[t] = navAtT / compCount;
    spread[t] = basketOb.midPrices[t] - nav[t];
  }

  const WINDOW = 50;
  const rm = rollingMean(spread, WINDOW);
  const rs = rollingStdDev(spread, WINDOW);
  const zScore = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    zScore[i] = rs[i] > 0 ? (spread[i] - rm[i]) / rs[i] : 0;
  }

  return { timestamps: basketOb.timestamps, spread, zScore, nav };
}

function bisect(arr: Float64Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ─── Selector hooks (memoized slices) ────────────────────────────────────────

export const selectLogA = (s: VisualizerStore) => s.logA;
export const selectLogB = (s: VisualizerStore) => s.logB;
export const selectMetricsA = (s: VisualizerStore) => s.metricsA;
export const selectMetricsB = (s: VisualizerStore) => s.metricsB;
export const selectDeltaMetrics = (s: VisualizerStore) => s.deltaMetrics;
export const selectViewport = (s: VisualizerStore) => s.viewport;
export const selectCrosshair = (s: VisualizerStore) => s.crosshair;
export const selectProduct = (s: VisualizerStore) => s.selectedProduct;
export const selectProducts = (s: VisualizerStore) => s.availableProducts;
export const selectOFI = (s: VisualizerStore) => ({ ofiA: s.ofiA, ofiB: s.ofiB });
export const selectWallMid = (s: VisualizerStore) => ({ wallMidA: s.wallMidA, wallMidB: s.wallMidB });
export const selectVPIN = (s: VisualizerStore) => s.vpin;
export const selectETFSpread = (s: VisualizerStore) => s.etfSpread;
