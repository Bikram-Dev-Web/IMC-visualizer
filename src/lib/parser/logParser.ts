/**
 * IMC Prosperity 4 Log Parser
 *
 * Handles the standard Prosperity log format:
 *
 *   Sandbox logs:
 *   SUBMISSION
 *   [timestamp] [product]: [message]
 *   ...
 *
 *   Activities log:
 *   day;timestamp;product;bid_price_1;bid_volume_1;...;ask_price_1;ask_volume_1;...;mid_price;profit_and_loss
 *
 *   Trade History:
 *   [JSON array of trade objects]
 *
 * Outputs columnar TypedArrays for O(1) indexed access.
 */

import type {
  ParsedLog,
  ColumnarOrderBook,
  ColumnarTrades,
  SandboxLog,
  Trade,
} from "@/types";

// ─── Activity row columns ─────────────────────────────────────────────────────
// day;timestamp;product;
// bid_price_1;bid_volume_1;bid_price_2;bid_volume_2;bid_price_3;bid_volume_3;
// ask_price_1;ask_volume_1;ask_price_2;ask_volume_2;ask_price_3;ask_volume_3;
// mid_price;profit_and_loss
const ACT_COL = {
  DAY: 0,
  TIMESTAMP: 1,
  PRODUCT: 2,
  BID_P1: 3, BID_V1: 4,
  BID_P2: 5, BID_V2: 6,
  BID_P3: 7, BID_V3: 8,
  ASK_P1: 9, ASK_V1: 10,
  ASK_P2: 11, ASK_V2: 12,
  ASK_P3: 13, ASK_V3: 14,
  MID: 15,
  PNL: 16,
} as const;

const LEVELS = 3; // Prosperity provides up to 3 levels

interface RawActivityRow {
  day: number;
  timestamp: number;
  product: string;
  bidPrices: number[];
  bidSizes: number[];
  askPrices: number[];
  askSizes: number[];
  mid: number;
  pnl: number;
}

interface RawTrade {
  timestamp: number;
  buyer: string;
  seller: string;
  symbol: string;
  currency: string;
  price: number;
  quantity: number;
}

// ─── Section detector ─────────────────────────────────────────────────────────

function detectSections(text: string): {
  sandboxStart: number;
  activitiesStart: number;
  tradeHistStart: number;
} {
  const lower = text.toLowerCase();
  return {
    sandboxStart: lower.indexOf("sandbox logs:"),
    activitiesStart: lower.indexOf("activities log:"),
    tradeHistStart: lower.indexOf("trade history:"),
  };
}

// ─── Sandbox log parser ───────────────────────────────────────────────────────

function parseSandboxSection(text: string): SandboxLog[] {
  const logs: SandboxLog[] = [];
  const lines = text.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.toUpperCase() === "SUBMISSION") continue;
    // Format: "timestamp product: message" or just message
    const tsMatch = trimmed.match(/^(\d+)\s+(\S+):\s*(.*)$/);
    if (tsMatch) {
      const [, ts, product, message] = tsMatch;
      const level =
        message.toLowerCase().includes("error") ? "ERROR" :
        message.toLowerCase().includes("warn") ? "WARN" : "INFO";
      logs.push({ timestamp: parseInt(ts, 10), product, message, level });
    }
  }
  return logs;
}

// ─── Activities log parser ────────────────────────────────────────────────────

function parseActivitiesSection(
  text: string,
  onProgress?: (p: number) => void
): Map<string, RawActivityRow[]> {
  const byProduct = new Map<string, RawActivityRow[]>();
  const lines = text.split("\n");
  const total = lines.length;

  for (let li = 0; li < lines.length; li++) {
    if (li % 5000 === 0 && onProgress) {
      onProgress(li / total);
    }

    const line = lines[li].trim();
    if (!line || line.startsWith("day")) continue; // skip header

    const parts = line.split(";");
    if (parts.length < 17) continue;

    const product = parts[ACT_COL.PRODUCT].trim();
    if (!product) continue;

    const row: RawActivityRow = {
      day: parseFloat(parts[ACT_COL.DAY]) || 0,
      timestamp: parseFloat(parts[ACT_COL.TIMESTAMP]) || 0,
      product,
      bidPrices: [],
      bidSizes: [],
      askPrices: [],
      askSizes: [],
      mid: parseFloat(parts[ACT_COL.MID]) || 0,
      pnl: parseFloat(parts[ACT_COL.PNL]) || 0,
    };

    // Parse bid levels
    const bidPairs: [number, number][] = [
      [ACT_COL.BID_P1, ACT_COL.BID_V1],
      [ACT_COL.BID_P2, ACT_COL.BID_V2],
      [ACT_COL.BID_P3, ACT_COL.BID_V3],
    ];
    for (const [pi, vi] of bidPairs) {
      const p = parseFloat(parts[pi]);
      const v = parseFloat(parts[vi]);
      if (!isNaN(p) && !isNaN(v) && v > 0) {
        row.bidPrices.push(p);
        row.bidSizes.push(v);
      }
    }

    // Parse ask levels
    const askPairs: [number, number][] = [
      [ACT_COL.ASK_P1, ACT_COL.ASK_V1],
      [ACT_COL.ASK_P2, ACT_COL.ASK_V2],
      [ACT_COL.ASK_P3, ACT_COL.ASK_V3],
    ];
    for (const [pi, vi] of askPairs) {
      const p = parseFloat(parts[pi]);
      const v = parseFloat(parts[vi]);
      if (!isNaN(p) && !isNaN(v) && v > 0) {
        row.askPrices.push(p);
        row.askSizes.push(v);
      }
    }

    if (!byProduct.has(product)) byProduct.set(product, []);
    byProduct.get(product)!.push(row);
  }

  return byProduct;
}

// ─── Trade history parser ─────────────────────────────────────────────────────

function parseTradeHistory(text: string): RawTrade[] {
  const trimmed = text.trim();
  if (!trimmed || trimmed === "[]") return [];

  try {
    // Handle both JSON array and newline-separated JSON arrays
    let jsonText = trimmed;
    // Sometimes multiple JSON arrays are concatenated, one per day
    if (!jsonText.startsWith("[")) {
      // Find first [
      const idx = jsonText.indexOf("[");
      if (idx === -1) return [];
      jsonText = jsonText.slice(idx);
    }

    // Handle concatenated arrays: ][
    jsonText = jsonText.replace(/\]\s*\[/g, ",");

    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (t) =>
        typeof t === "object" &&
        t !== null &&
        typeof t.timestamp === "number" &&
        typeof t.price === "number"
    ) as RawTrade[];
  } catch {
    // Fallback: try line-by-line JSON objects
    const trades: RawTrade[] = [];
    const lines = trimmed.split("\n");
    for (const line of lines) {
      const l = line.trim().replace(/^,/, "").replace(/,$/, "");
      if (!l || l === "[" || l === "]") continue;
      try {
        const t = JSON.parse(l);
        if (t && typeof t.price === "number") trades.push(t);
      } catch {}
    }
    return trades;
  }
}

// ─── Columnarize ──────────────────────────────────────────────────────────────

function toColumnarOrderBook(rows: RawActivityRow[]): ColumnarOrderBook {
  const n = rows.length;
  const timestamps = new Float64Array(n);
  const midPrices = new Float64Array(n);
  const pnls = new Float64Array(n);

  const bidPrices: Float64Array[] = Array.from({ length: LEVELS }, () => new Float64Array(n).fill(NaN));
  const bidSizes: Float64Array[] = Array.from({ length: LEVELS }, () => new Float64Array(n));
  const askPrices: Float64Array[] = Array.from({ length: LEVELS }, () => new Float64Array(n).fill(NaN));
  const askSizes: Float64Array[] = Array.from({ length: LEVELS }, () => new Float64Array(n));

  for (let i = 0; i < n; i++) {
    const row = rows[i];
    timestamps[i] = row.timestamp;
    midPrices[i] = row.mid;
    pnls[i] = row.pnl;

    for (let lvl = 0; lvl < LEVELS; lvl++) {
      if (lvl < row.bidPrices.length) {
        bidPrices[lvl][i] = row.bidPrices[lvl];
        bidSizes[lvl][i] = row.bidSizes[lvl];
      }
      if (lvl < row.askPrices.length) {
        askPrices[lvl][i] = row.askPrices[lvl];
        askSizes[lvl][i] = row.askSizes[lvl];
      }
    }
  }

  return { timestamps, midPrices, pnls, bidPrices, bidSizes, askPrices, askSizes, length: n };
}

function toColumnarTrades(
  rawTrades: RawTrade[],
  product: string
): ColumnarTrades {
  const filtered = rawTrades.filter((t) => t.symbol === product);
  const n = filtered.length;
  const timestamps = new Float64Array(n);
  const prices = new Float64Array(n);
  const quantities = new Float64Array(n);
  const aggressors = new Int8Array(n);
  const isBot = new Uint8Array(n);
  const isOwn = new Uint8Array(n);

  for (let i = 0; i < n; i++) {
    const t = filtered[i];
    timestamps[i] = t.timestamp;
    prices[i] = t.price;
    quantities[i] = t.quantity;

    const buyer = (t.buyer || "").toUpperCase();
    const seller = (t.seller || "").toUpperCase();
    const isSubmissionBuyer = buyer === "SUBMISSION";
    const isSubmissionSeller = seller === "SUBMISSION";

    // Aggressor: the one who "took" liquidity
    // In Prosperity, if SUBMISSION is buyer, we bought (aggressor=BUY)
    if (isSubmissionBuyer) aggressors[i] = 1;
    else if (isSubmissionSeller) aggressors[i] = -1;
    else aggressors[i] = 0;

    isOwn[i] = isSubmissionBuyer || isSubmissionSeller ? 1 : 0;
    isBot[i] = !isSubmissionBuyer && !isSubmissionSeller ? 1 : 0;
  }

  return { timestamps, prices, quantities, aggressors, isBot, isOwn, length: n };
}

// ─── Global timestamp union ───────────────────────────────────────────────────

function buildGlobalTimestamps(orderBooks: Map<string, ColumnarOrderBook>): Float64Array {
  const allTs = new Set<number>();
  for (const ob of orderBooks.values()) {
    for (let i = 0; i < ob.length; i++) allTs.add(ob.timestamps[i]);
  }
  const sorted = Array.from(allTs).sort((a, b) => a - b);
  return new Float64Array(sorted);
}

// ─── Main parse function ──────────────────────────────────────────────────────

export function parseLog(
  text: string,
  strategyId: "A" | "B",
  fileName: string,
  onProgress?: (p: number) => void
): ParsedLog {
  const start = Date.now();
  const { sandboxStart, activitiesStart, tradeHistStart } = detectSections(text);

  // Extract section text
  const sandboxText = sandboxStart >= 0
    ? text.slice(
        sandboxStart + "sandbox logs:".length,
        activitiesStart > sandboxStart ? activitiesStart : undefined
      )
    : "";

  const activitiesText = activitiesStart >= 0
    ? text.slice(
        activitiesStart + "activities log:".length,
        tradeHistStart > activitiesStart ? tradeHistStart : undefined
      )
    : "";

  const tradeText = tradeHistStart >= 0
    ? text.slice(tradeHistStart + "trade history:".length)
    : "";

  // Parse sections
  onProgress?.(0.05);
  const sandboxLogs = parseSandboxSection(sandboxText);

  onProgress?.(0.1);
  const rawByProduct = parseActivitiesSection(activitiesText, (p) =>
    onProgress?.(0.1 + p * 0.6)
  );

  onProgress?.(0.7);
  const rawTrades = parseTradeHistory(tradeText);

  onProgress?.(0.8);

  // Build columnar structures
  const orderBooks = new Map<string, ColumnarOrderBook>();
  const trades = new Map<string, ColumnarTrades>();
  const products: string[] = [];
  const daySet = new Set<number>();

  for (const [product, rows] of rawByProduct.entries()) {
    // Sort by timestamp
    rows.sort((a, b) => a.timestamp - b.timestamp);
    orderBooks.set(product, toColumnarOrderBook(rows));
    trades.set(product, toColumnarTrades(rawTrades, product));
    products.push(product);
    for (const r of rows) daySet.add(r.day);
  }

  // If no order book but trades exist, infer products from trades
  const tradeProducts = new Set(rawTrades.map((t) => t.symbol));
  for (const p of tradeProducts) {
    if (!trades.has(p)) {
      trades.set(p, toColumnarTrades(rawTrades, p));
    }
    if (!products.includes(p)) products.push(p);
  }

  products.sort();
  onProgress?.(0.9);

  const globalTimestamps = buildGlobalTimestamps(orderBooks);

  // Count rows
  let rowCount = 0;
  for (const ob of orderBooks.values()) rowCount += ob.length;

  onProgress?.(1.0);

  return {
    strategyId,
    fileName,
    products,
    days: Array.from(daySet).sort((a, b) => a - b),
    orderBooks,
    trades,
    sandboxLogs,
    globalTimestamps,
    parseTime: Date.now() - start,
    rowCount,
  };
}

// ─── Metrics computation ──────────────────────────────────────────────────────

import type { StrategyMetrics, ProductMetrics } from "@/types";
import { maxDrawdown, sharpeRatio, sortinoRatio, profitFactor, diff } from "@/lib/math/statistics";

export function computeMetrics(log: ParsedLog): StrategyMetrics {
  const byProduct = new Map<string, ProductMetrics>();
  let totalPnL = 0;
  let totalTrades = 0;
  let totalBuyTrades = 0;
  let totalVolume = 0;

  // Collect all PnL values for global metrics
  const allPnLArrays: Float64Array[] = [];

  for (const product of log.products) {
    const ob = log.orderBooks.get(product);
    const tr = log.trades.get(product);

    if (!ob) continue;

    const productPnL = ob.pnls[ob.length - 1] ?? 0;
    totalPnL += productPnL;
    allPnLArrays.push(ob.pnls);

    let tradeCount = 0;
    let tradeVol = 0;
    let buys = 0;

    if (tr && tr.length > 0) {
      tradeCount = tr.length;
      for (let i = 0; i < tr.length; i++) {
        if (tr.isOwn[i]) {
          tradeVol += tr.quantities[i];
          if (tr.aggressors[i] === 1) buys++;
        }
      }
      totalTrades += tradeCount;
      totalBuyTrades += buys;
      totalVolume += tradeVol;
    }

    // Spread
    let spreadSum = 0;
    let spreadCount = 0;
    for (let i = 0; i < ob.length; i++) {
      const bid = ob.bidPrices[0]?.[i];
      const ask = ob.askPrices[0]?.[i];
      if (!isNaN(bid) && !isNaN(ask) && ask > bid) {
        spreadSum += ask - bid;
        spreadCount++;
      }
    }

    // Inventory range from position data (proxy: use signed vol from trades)
    let minPos = 0, maxPos = 0, pos = 0;
    if (tr) {
      for (let i = 0; i < tr.length; i++) {
        if (tr.isOwn[i]) {
          pos += tr.aggressors[i] === 1 ? tr.quantities[i] : -tr.quantities[i];
          if (pos < minPos) minPos = pos;
          if (pos > maxPos) maxPos = pos;
        }
      }
    }

    byProduct.set(product, {
      product,
      pnl: productPnL,
      tradeCount,
      volumeTraded: tradeVol,
      avgSpread: spreadCount > 0 ? spreadSum / spreadCount : 0,
      inventoryRange: [minPos, maxPos],
      turnover: tradeVol,
    });
  }

  // Global PnL series: use first product's PnL or aggregate
  // For multi-product: pick the product with most rows
  let bestOb: ColumnarOrderBook | null = null;
  let bestLen = 0;
  for (const ob of log.orderBooks.values()) {
    if (ob.length > bestLen) { bestLen = ob.length; bestOb = ob; }
  }

  let mdd = { maxDrawdown: 0, peakIdx: 0, troughIdx: 0 };
  let sharpe = 0;
  let sortino = 0;
  let pf = 1;
  let winRate = 0;
  let avgTradeSize = 0;
  let participationRate = 0;

  if (bestOb && bestOb.length > 1) {
    const pnlDiffs = diff(bestOb.pnls);
    mdd = maxDrawdown(bestOb.pnls);
    sharpe = sharpeRatio(pnlDiffs);
    sortino = sortinoRatio(pnlDiffs);
    pf = profitFactor(pnlDiffs);

    let wins = 0;
    for (let i = 0; i < pnlDiffs.length; i++) {
      if (pnlDiffs[i] > 0) wins++;
    }
    winRate = pnlDiffs.length > 0 ? wins / pnlDiffs.length : 0;
  }

  if (totalTrades > 0) {
    avgTradeSize = totalVolume / totalTrades;
  }

  // Participation rate: own trades / total trades recorded
  const totalRecordedTrades = Array.from(log.trades.values()).reduce((s, t) => s + t.length, 0);
  participationRate = totalRecordedTrades > 0 ? totalTrades / totalRecordedTrades : 0;

  const ddStartTs = bestOb ? bestOb.timestamps[mdd.peakIdx] : 0;
  const ddEndTs = bestOb ? bestOb.timestamps[mdd.troughIdx] : 0;

  return {
    totalPnL,
    maxDrawdown: mdd.maxDrawdown,
    maxDrawdownStart: ddStartTs,
    maxDrawdownEnd: ddEndTs,
    winRate,
    totalTrades,
    avgTradeSize,
    participationRate,
    sharpeRatio: sharpe,
    sortinoRatio: sortino,
    profitFactor: pf,
    avgHoldingTime: 0, // requires position tracking
    byProduct,
  };
}

// ─── Delta metrics ────────────────────────────────────────────────────────────

import type { DeltaMetrics } from "@/types";

export function computeDeltaMetrics(
  logA: ParsedLog,
  logB: ParsedLog,
  metricsA: StrategyMetrics,
  metricsB: StrategyMetrics
): DeltaMetrics {
  // Build aligned PnL time series: find common product (first one both have)
  const commonProducts = logA.products.filter((p) => logB.products.includes(p));
  const product = commonProducts[0];

  let timestamps = new Float64Array(0);
  let pnlDeltaTimeSeries = new Float64Array(0);

  if (product) {
    const obA = logA.orderBooks.get(product);
    const obB = logB.orderBooks.get(product);

    if (obA && obB) {
      // Align by timestamp using linear interpolation
      const allTs = new Float64Array(
        Array.from(new Set([...Array.from(obA.timestamps), ...Array.from(obB.timestamps)])).sort(
          (a, b) => a - b
        )
      );

      const pnlA = interpolatePnL(allTs, obA.timestamps, obA.pnls);
      const pnlB = interpolatePnL(allTs, obB.timestamps, obB.pnls);

      timestamps = allTs;
      pnlDeltaTimeSeries = new Float64Array(allTs.length);
      for (let i = 0; i < allTs.length; i++) {
        pnlDeltaTimeSeries[i] = pnlA[i] - pnlB[i];
      }
    }
  }

  return {
    pnlDelta: metricsA.totalPnL - metricsB.totalPnL,
    drawdownDiff: metricsA.maxDrawdown - metricsB.maxDrawdown,
    winRateDiff: metricsA.winRate - metricsB.winRate,
    participationDelta: metricsA.participationRate - metricsB.participationRate,
    sharpeDiff: metricsA.sharpeRatio - metricsB.sharpeRatio,
    pnlDeltaTimeSeries,
    timestamps,
  };
}

function interpolatePnL(
  targetTs: Float64Array,
  srcTs: Float64Array,
  srcVals: Float64Array
): Float64Array {
  const out = new Float64Array(targetTs.length);
  let j = 0;
  for (let i = 0; i < targetTs.length; i++) {
    const t = targetTs[i];
    while (j < srcTs.length - 1 && srcTs[j + 1] <= t) j++;
    if (j >= srcTs.length - 1) {
      out[i] = srcVals[srcTs.length - 1];
    } else if (srcTs[j] === t) {
      out[i] = srcVals[j];
    } else {
      // Linear interpolation
      const alpha = (t - srcTs[j]) / (srcTs[j + 1] - srcTs[j]);
      out[i] = srcVals[j] + alpha * (srcVals[j + 1] - srcVals[j]);
    }
  }
  return out;
}
