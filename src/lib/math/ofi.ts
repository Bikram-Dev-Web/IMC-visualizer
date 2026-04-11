/**
 * Order Flow Imbalance (OFI) and Multi-Level OFI (MLOFI).
 *
 * Reference: Cont, Kukanov & Stoikov (2014)
 * "The Price Impact of Order Book Events"
 *
 * OFI_t = Σ_{i=1}^{N} (e^bid_{i,t} - e^ask_{i,t})
 *
 * where:
 *   e^bid_{i,t} = q^bid_{i,t}     if P^bid_{i,t} >= P^bid_{i,t-1}
 *               = -q^bid_{i,t-1}  if P^bid_{i,t} <  P^bid_{i,t-1}
 *               = q^bid_{i,t} - q^bid_{i,t-1}  if equal prices
 *
 *   e^ask_{i,t} = -q^ask_{i,t}    if P^ask_{i,t} <= P^ask_{i,t-1}
 *               = q^ask_{i,t-1}   if P^ask_{i,t} >  P^ask_{i,t-1}
 *               = q^ask_{i,t} - q^ask_{i,t-1}  if equal prices (negated)
 *
 * MLOFI uses weighted sum across levels: w_l = 1 / l
 */

import type { ColumnarOrderBook, OFIResult } from "@/types";

const LEVELS = 5;

/**
 * Compute single-level OFI (best bid/ask only).
 */
function computeSingleOFI(ob: ColumnarOrderBook): Float64Array {
  const n = ob.length;
  const ofi = new Float64Array(n);

  for (let t = 1; t < n; t++) {
    const bidP_cur = ob.bidPrices[0][t];
    const bidP_prv = ob.bidPrices[0][t - 1];
    const bidQ_cur = ob.bidSizes[0][t];
    const bidQ_prv = ob.bidSizes[0][t - 1];

    const askP_cur = ob.askPrices[0][t];
    const askP_prv = ob.askPrices[0][t - 1];
    const askQ_cur = ob.askSizes[0][t];
    const askQ_prv = ob.askSizes[0][t - 1];

    let eBid: number;
    if (bidP_cur > bidP_prv) eBid = bidQ_cur;
    else if (bidP_cur < bidP_prv) eBid = -bidQ_prv;
    else eBid = bidQ_cur - bidQ_prv;

    let eAsk: number;
    if (askP_cur < askP_prv) eAsk = -askQ_cur;
    else if (askP_cur > askP_prv) eAsk = askQ_prv;
    else eAsk = -(askQ_cur - askQ_prv);

    ofi[t] = eBid - eAsk;
  }

  return ofi;
}

/**
 * Compute Multi-Level OFI across all available levels.
 * w_l = 1/l (inverse level weighting — deeper levels get less weight)
 */
function computeMLOFI(ob: ColumnarOrderBook): Float64Array {
  const n = ob.length;
  const mlofi = new Float64Array(n);

  // Pre-compute weights
  const weights = Array.from({ length: LEVELS }, (_, i) => 1 / (i + 1));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const normWeights = weights.map((w) => w / weightSum);

  for (let t = 1; t < n; t++) {
    let levelSum = 0;

    for (let lvl = 0; lvl < LEVELS; lvl++) {
      // Check if this level exists in the data
      if (ob.bidPrices[lvl] === undefined || ob.askPrices[lvl] === undefined) break;

      const bidP_cur = ob.bidPrices[lvl][t];
      const bidP_prv = ob.bidPrices[lvl][t - 1];
      const bidQ_cur = ob.bidSizes[lvl][t];
      const bidQ_prv = ob.bidSizes[lvl][t - 1];

      const askP_cur = ob.askPrices[lvl][t];
      const askP_prv = ob.askPrices[lvl][t - 1];
      const askQ_cur = ob.askSizes[lvl][t];
      const askQ_prv = ob.askSizes[lvl][t - 1];

      // Skip if NaN/zero (level not present)
      if (
        isNaN(bidP_cur) || isNaN(askP_cur) ||
        isNaN(bidP_prv) || isNaN(askP_prv)
      ) continue;

      let eBid: number;
      if (bidP_cur > bidP_prv) eBid = bidQ_cur;
      else if (bidP_cur < bidP_prv) eBid = -bidQ_prv;
      else eBid = bidQ_cur - bidQ_prv;

      let eAsk: number;
      if (askP_cur < askP_prv) eAsk = -askQ_cur;
      else if (askP_cur > askP_prv) eAsk = askQ_prv;
      else eAsk = -(askQ_cur - askQ_prv);

      levelSum += normWeights[lvl] * (eBid - eAsk);
    }

    mlofi[t] = levelSum;
  }

  return mlofi;
}

export function computeOFI(ob: ColumnarOrderBook): OFIResult {
  return {
    timestamps: ob.timestamps,
    ofi: computeSingleOFI(ob),
    mlofi: computeMLOFI(ob),
  };
}

/**
 * Wall-Mid Price: detect liquidity walls and compute fair-value midpoint.
 *
 * A "wall" is a level where size > threshold * avg_size (across all levels).
 * Fair value mid = (wall_bid + wall_ask) / 2 if both walls present,
 *                 else standard mid.
 */
export function computeWallMid(
  ob: ColumnarOrderBook,
  wallMultiplier = 3.0
): import("@/types").WallMidResult {
  const n = ob.length;
  const wallMid = new Float64Array(n);
  const fairValue = new Float64Array(n);
  const bidWallPrice = new Float64Array(n);
  const askWallPrice = new Float64Array(n);
  const hasWall = new Uint8Array(n);

  for (let t = 0; t < n; t++) {
    // Compute average size across all bid and ask levels
    let totalSize = 0;
    let count = 0;
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      if (ob.bidSizes[lvl]?.[t] > 0) { totalSize += ob.bidSizes[lvl][t]; count++; }
      if (ob.askSizes[lvl]?.[t] > 0) { totalSize += ob.askSizes[lvl][t]; count++; }
    }
    const avgSize = count > 0 ? totalSize / count : 1;
    const wallThreshold = avgSize * wallMultiplier;

    // Find largest bid wall
    let wallBidP = NaN;
    let wallBidSize = 0;
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      if (!ob.bidPrices[lvl] || !ob.bidSizes[lvl]) break;
      const sz = ob.bidSizes[lvl][t];
      if (sz >= wallThreshold && sz > wallBidSize) {
        wallBidSize = sz;
        wallBidP = ob.bidPrices[lvl][t];
      }
    }

    // Find largest ask wall
    let wallAskP = NaN;
    let wallAskSize = 0;
    for (let lvl = 0; lvl < LEVELS; lvl++) {
      if (!ob.askPrices[lvl] || !ob.askSizes[lvl]) break;
      const sz = ob.askSizes[lvl][t];
      if (sz >= wallThreshold && sz > wallAskSize) {
        wallAskSize = sz;
        wallAskP = ob.askPrices[lvl][t];
      }
    }

    const mid = ob.midPrices[t];
    const wallDetected = !isNaN(wallBidP) || !isNaN(wallAskP);

    if (!isNaN(wallBidP) && !isNaN(wallAskP)) {
      wallMid[t] = (wallBidP + wallAskP) / 2;
      fairValue[t] = wallMid[t];
    } else if (!isNaN(wallBidP)) {
      wallMid[t] = wallBidP;
      fairValue[t] = (wallBidP + (ob.askPrices[0]?.[t] ?? mid)) / 2;
    } else if (!isNaN(wallAskP)) {
      wallMid[t] = wallAskP;
      fairValue[t] = ((ob.bidPrices[0]?.[t] ?? mid) + wallAskP) / 2;
    } else {
      wallMid[t] = mid;
      fairValue[t] = mid;
    }

    bidWallPrice[t] = isNaN(wallBidP) ? mid : wallBidP;
    askWallPrice[t] = isNaN(wallAskP) ? mid : wallAskP;
    hasWall[t] = wallDetected ? 1 : 0;
  }

  return {
    timestamps: ob.timestamps,
    wallMid,
    fairValue,
    bidWallPrice,
    askWallPrice,
    hasWall,
  };
}
