/**
 * Core statistical functions for trading analytics.
 * All functions operate on Float64Array for performance.
 */

/** Simple mean */
export function mean(arr: Float64Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) sum += arr[i];
  return sum / arr.length;
}

/** Population standard deviation */
export function stdDev(arr: Float64Array): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let variance = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - m;
    variance += d * d;
  }
  return Math.sqrt(variance / arr.length);
}

/** Rolling mean using circular buffer — O(N) total */
export function rollingMean(arr: Float64Array, window: number): Float64Array {
  const out = new Float64Array(arr.length);
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i];
    if (i >= window) sum -= arr[i - window];
    const count = Math.min(i + 1, window);
    out[i] = sum / count;
  }
  return out;
}

/** Rolling standard deviation (Welford's online algorithm) */
export function rollingStdDev(arr: Float64Array, window: number): Float64Array {
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = arr.subarray(start, i + 1);
    out[i] = stdDev(slice);
  }
  return out;
}

/** Rolling z-score: (x - rolling_mean) / rolling_std */
export function rollingZScore(arr: Float64Array, window: number): Float64Array {
  const rm = rollingMean(arr, window);
  const rs = rollingStdDev(arr, window);
  const out = new Float64Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    out[i] = rs[i] === 0 ? 0 : (arr[i] - rm[i]) / rs[i];
  }
  return out;
}

/**
 * Maximum drawdown: returns { maxDrawdown, peakIdx, troughIdx }
 * Input: cumulative PnL series.
 */
export function maxDrawdown(pnl: Float64Array): {
  maxDrawdown: number;
  peakIdx: number;
  troughIdx: number;
} {
  let maxDD = 0;
  let peak = pnl[0] ?? 0;
  let peakIdx = 0;
  let bestPeak = 0;
  let bestTrough = 0;

  for (let i = 1; i < pnl.length; i++) {
    if (pnl[i] > peak) {
      peak = pnl[i];
      peakIdx = i;
    }
    const dd = peak - pnl[i];
    if (dd > maxDD) {
      maxDD = dd;
      bestPeak = peakIdx;
      bestTrough = i;
    }
  }
  return { maxDrawdown: maxDD, peakIdx: bestPeak, troughIdx: bestTrough };
}

/**
 * Sharpe Ratio: mean(returns) / std(returns) * sqrt(annualization_factor)
 * For tick-level data, annualization_factor is typically 1 (no annualization).
 */
export function sharpeRatio(returns: Float64Array, annualizationFactor = 1): number {
  const m = mean(returns);
  const s = stdDev(returns);
  if (s === 0) return 0;
  return (m / s) * Math.sqrt(annualizationFactor);
}

/**
 * Sortino Ratio: mean(returns) / downside_deviation
 */
export function sortinoRatio(returns: Float64Array, targetReturn = 0): number {
  const m = mean(returns);
  let downsideVar = 0;
  let count = 0;
  for (let i = 0; i < returns.length; i++) {
    const diff = Math.min(returns[i] - targetReturn, 0);
    downsideVar += diff * diff;
    count++;
  }
  const dd = count > 0 ? Math.sqrt(downsideVar / count) : 0;
  if (dd === 0) return 0;
  return m / dd;
}

/**
 * Profit Factor: sum(positive_returns) / |sum(negative_returns)|
 */
export function profitFactor(pnlChanges: Float64Array): number {
  let grossProfit = 0;
  let grossLoss = 0;
  for (let i = 0; i < pnlChanges.length; i++) {
    if (pnlChanges[i] > 0) grossProfit += pnlChanges[i];
    else grossLoss += Math.abs(pnlChanges[i]);
  }
  return grossLoss === 0 ? Infinity : grossProfit / grossLoss;
}

/** First-difference of a Float64Array */
export function diff(arr: Float64Array): Float64Array {
  if (arr.length < 2) return new Float64Array(0);
  const out = new Float64Array(arr.length - 1);
  for (let i = 0; i < out.length; i++) out[i] = arr[i + 1] - arr[i];
  return out;
}

/** Cumulative sum */
export function cumsum(arr: Float64Array): Float64Array {
  const out = new Float64Array(arr.length);
  let s = 0;
  for (let i = 0; i < arr.length; i++) {
    s += arr[i];
    out[i] = s;
  }
  return out;
}

/** Exponential moving average */
export function ema(arr: Float64Array, alpha: number): Float64Array {
  const out = new Float64Array(arr.length);
  if (arr.length === 0) return out;
  out[0] = arr[0];
  for (let i = 1; i < arr.length; i++) {
    out[i] = alpha * arr[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

/** Percentile (linear interpolation) */
export function percentile(arr: Float64Array, p: number): number {
  if (arr.length === 0) return 0;
  const sorted = arr.slice().sort();
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
