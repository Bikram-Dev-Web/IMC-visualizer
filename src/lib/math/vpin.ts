/**
 * VPIN — Volume-Synchronized Probability of Informed Trading
 *
 * Reference: Easley, López de Prado & O'Hara (2012)
 * "Flow Toxicity and Liquidity in a High-Frequency World"
 *
 * Algorithm:
 *  1. Classify each trade as buy (aggressor=BUY) or sell (aggressor=SELL).
 *     Unclassified trades use Lee-Ready rule: compare trade price to midpoint.
 *  2. Aggregate trades into volume buckets of size V = total_volume / n_buckets.
 *  3. VPIN = (1/n) * Σ |V^B_τ - V^S_τ| / V
 *
 * Also computes alpha decay: exponential decay of IC signal using EMA.
 */

import type { ColumnarTrades, ColumnarOrderBook, VPINResult, AlphaDecayResult } from "@/types";
import { ema } from "./statistics";

/**
 * Lee-Ready trade classification:
 *  - If trade price > midpoint → BUY (aggressor is buyer)
 *  - If trade price < midpoint → SELL
 *  - If equal → tick rule (compare to previous trade price)
 *
 * Returns Int8Array: 1=BUY, -1=SELL
 */
export function leeReadyClassify(
  trades: ColumnarTrades,
  ob: ColumnarOrderBook
): Int8Array {
  const n = trades.length;
  const classified = new Int8Array(n);

  // Binary search helper: find OB index at or before a given timestamp
  function obIdxAt(ts: number): number {
    let lo = 0;
    let hi = ob.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (ob.timestamps[mid] <= ts) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  let prevPrice = trades.prices[0];

  for (let i = 0; i < n; i++) {
    // Use existing aggressor if available
    if (trades.aggressors[i] !== 0) {
      classified[i] = trades.aggressors[i];
      prevPrice = trades.prices[i];
      continue;
    }

    const tradePrice = trades.prices[i];
    const obIdx = obIdxAt(trades.timestamps[i]);
    const mid = ob.midPrices[obIdx];

    if (tradePrice > mid) {
      classified[i] = 1; // BUY
    } else if (tradePrice < mid) {
      classified[i] = -1; // SELL
    } else {
      // Tick rule: compare to previous trade
      if (tradePrice > prevPrice) classified[i] = 1;
      else if (tradePrice < prevPrice) classified[i] = -1;
      else classified[i] = classified[i - 1] ?? 0; // carry forward
    }

    prevPrice = tradePrice;
  }

  return classified;
}

/**
 * Compute VPIN.
 *
 * @param buckets  Number of volume buckets (default 50)
 * @param window   Number of buckets for rolling VPIN (default 50)
 */
export function computeVPIN(
  trades: ColumnarTrades,
  ob: ColumnarOrderBook,
  buckets = 50,
  window = 50
): VPINResult {
  if (trades.length === 0) {
    return {
      bucketEndTimes: new Float64Array(0),
      vpin: new Float64Array(0),
      buyVolFrac: new Float64Array(0),
      sellVolFrac: new Float64Array(0),
    };
  }

  const classified = leeReadyClassify(trades, ob);

  // Total volume
  let totalVol = 0;
  for (let i = 0; i < trades.length; i++) totalVol += trades.quantities[i];

  const V = totalVol / buckets; // volume per bucket

  // Build buckets
  interface Bucket {
    endTime: number;
    buyVol: number;
    sellVol: number;
  }
  const bucketList: Bucket[] = [];

  let bucketBuy = 0;
  let bucketSell = 0;
  let accumulated = 0;

  for (let i = 0; i < trades.length; i++) {
    const qty = trades.quantities[i];
    const side = classified[i];
    if (side === 1) bucketBuy += qty;
    else if (side === -1) bucketSell += qty;
    accumulated += qty;

    while (accumulated >= V) {
      const excess = accumulated - V;
      // Proportionally allocate the excess to next bucket
      const fraction = (accumulated - excess) / qty;
      bucketList.push({
        endTime: trades.timestamps[i],
        buyVol: bucketBuy - (side === 1 ? excess : 0),
        sellVol: bucketSell - (side === -1 ? excess : 0),
      });
      accumulated = excess;
      bucketBuy = side === 1 ? excess : 0;
      bucketSell = side === -1 ? excess : 0;
    }
  }

  // Flush last partial bucket
  if (accumulated > 0 && trades.length > 0) {
    bucketList.push({
      endTime: trades.timestamps[trades.length - 1],
      buyVol: bucketBuy,
      sellVol: bucketSell,
    });
  }

  const m = bucketList.length;
  if (m === 0) {
    return {
      bucketEndTimes: new Float64Array(0),
      vpin: new Float64Array(0),
      buyVolFrac: new Float64Array(0),
      sellVolFrac: new Float64Array(0),
    };
  }

  const bucketEndTimes = new Float64Array(m);
  const buyVolFrac = new Float64Array(m);
  const sellVolFrac = new Float64Array(m);
  const vpin = new Float64Array(m);

  // Compute VPIN as rolling average of |V^B - V^S| / V
  let runningSum = 0;
  for (let i = 0; i < m; i++) {
    const bv = bucketList[i].buyVol;
    const sv = bucketList[i].sellVol;
    const total = bv + sv;
    bucketEndTimes[i] = bucketList[i].endTime;
    buyVolFrac[i] = total > 0 ? bv / total : 0.5;
    sellVolFrac[i] = total > 0 ? sv / total : 0.5;

    const imbalance = Math.abs(bv - sv) / (total > 0 ? total : 1);
    runningSum += imbalance;
    if (i >= window) runningSum -= Math.abs(bucketList[i - window].buyVol - bucketList[i - window].sellVol)
      / (bucketList[i - window].buyVol + bucketList[i - window].sellVol || 1);

    vpin[i] = runningSum / Math.min(i + 1, window);
  }

  return { bucketEndTimes, vpin, buyVolFrac, sellVolFrac };
}

/**
 * Alpha Decay: measures how quickly a price-predictive signal decays.
 *
 * Uses exponential decay fit: IC(t) ≈ IC_0 * exp(-λ * t)
 * where IC is the Information Coefficient (correlation of signal with next return).
 *
 * Here we approximate by correlating OFI with forward returns at different lags.
 * The lag where correlation drops to 50% of its peak = half-life.
 */
export function computeAlphaDecay(
  ofiValues: Float64Array,
  midPrices: Float64Array,
  maxLagTicks = 50
): AlphaDecayResult {
  if (ofiValues.length < maxLagTicks + 2) {
    return {
      timestamps: new Float64Array(0),
      alpha: new Float64Array(0),
      halfLife: 0,
    };
  }

  const n = ofiValues.length;
  const lags = Math.min(maxLagTicks, n - 2);

  // Compute forward returns at each lag
  const correlations = new Float64Array(lags);
  for (let lag = 1; lag <= lags; lag++) {
    // Pearson correlation between ofi[t] and (mid[t+lag] - mid[t])
    const pairs: [number, number][] = [];
    for (let t = 0; t + lag < n; t++) {
      const x = ofiValues[t];
      const y = midPrices[t + lag] - midPrices[t];
      if (!isNaN(x) && !isNaN(y) && isFinite(x) && isFinite(y)) {
        pairs.push([x, y]);
      }
    }

    if (pairs.length < 10) continue;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;
    for (const [x, y] of pairs) {
      sumX += x; sumY += y; sumXY += x * y;
      sumX2 += x * x; sumY2 += y * y;
    }
    const np = pairs.length;
    const num = np * sumXY - sumX * sumY;
    const den = Math.sqrt((np * sumX2 - sumX * sumX) * (np * sumY2 - sumY * sumY));
    correlations[lag - 1] = den > 0 ? num / den : 0;
  }

  // Find peak IC
  let peakIC = 0;
  for (let i = 0; i < lags; i++) {
    if (Math.abs(correlations[i]) > Math.abs(peakIC)) peakIC = correlations[i];
  }

  // Fit exponential decay: find half-life
  const halfTarget = Math.abs(peakIC) * 0.5;
  let halfLife = lags; // default to max
  for (let i = 0; i < lags; i++) {
    if (Math.abs(correlations[i]) <= halfTarget) {
      halfLife = i + 1;
      break;
    }
  }

  // Smooth with EMA for display
  const smoothed = ema(correlations, 0.3);

  return {
    timestamps: new Float64Array(Array.from({ length: lags }, (_, i) => i + 1)),
    alpha: smoothed,
    halfLife,
  };
}
