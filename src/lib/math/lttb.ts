/**
 * LTTB — Largest-Triangle-Three-Buckets downsampling algorithm.
 * Reference: Sveinn Steinarsson (2013) "Downsampling Time Series for Visual Representation"
 *
 * Reduces N data points to `threshold` points while maximally preserving
 * visual shape. O(N) time, O(threshold) space.
 */

export interface Point {
  x: number; // timestamp
  y: number; // value
}

/**
 * Downsample an array of Points using LTTB.
 * @param data   Input data — must be sorted by x ascending.
 * @param threshold  Target number of output points (≥ 2).
 */
export function lttb(data: Point[], threshold: number): Point[] {
  const n = data.length;
  if (threshold >= n || threshold < 2) return data.slice();

  const sampled: Point[] = [];
  // Always keep first and last points
  sampled.push(data[0]);

  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0; // index of last selected point

  for (let i = 0; i < threshold - 2; i++) {
    // Range for current bucket
    const rangeStart = Math.floor((i + 0) * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);

    // Range for next bucket (used to compute average)
    const nextRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    // Average point of the next bucket
    let avgX = 0;
    let avgY = 0;
    const nextCount = nextRangeEnd - nextRangeStart;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) {
      avgX += data[j].x;
      avgY += data[j].y;
    }
    avgX /= nextCount;
    avgY /= nextCount;

    // Point A (last selected)
    const ax = data[a].x;
    const ay = data[a].y;

    // Find point in current range that forms the largest triangle
    let maxArea = -1;
    let maxIdx = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      // Triangle area * 2 (sign doesn't matter, we want magnitude)
      const area = Math.abs(
        (ax - avgX) * (data[j].y - ay) - (ax - data[j].x) * (avgY - ay)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    sampled.push(data[maxIdx]);
    a = maxIdx;
  }

  sampled.push(data[n - 1]);
  return sampled;
}

/**
 * Typed-array variant — faster for large Float64 data.
 * timestamps and values must be same length and timestamps sorted ascending.
 */
export function lttbTyped(
  timestamps: Float64Array,
  values: Float64Array,
  threshold: number
): { timestamps: Float64Array; values: Float64Array } {
  const n = timestamps.length;
  if (threshold >= n || threshold < 2) {
    return { timestamps: timestamps.slice(), values: values.slice() };
  }

  const outTs = new Float64Array(threshold);
  const outVals = new Float64Array(threshold);

  outTs[0] = timestamps[0];
  outVals[0] = values[0];
  outTs[threshold - 1] = timestamps[n - 1];
  outVals[threshold - 1] = values[n - 1];

  const bucketSize = (n - 2) / (threshold - 2);
  let a = 0;

  for (let i = 0; i < threshold - 2; i++) {
    const rangeStart = Math.floor(i * bucketSize) + 1;
    const rangeEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, n);
    const nextRangeStart = Math.floor((i + 1) * bucketSize) + 1;
    const nextRangeEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, n);

    let avgX = 0;
    let avgY = 0;
    const nextCount = nextRangeEnd - nextRangeStart;
    for (let j = nextRangeStart; j < nextRangeEnd; j++) {
      avgX += timestamps[j];
      avgY += values[j];
    }
    avgX /= nextCount;
    avgY /= nextCount;

    const ax = timestamps[a];
    const ay = values[a];

    let maxArea = -1;
    let maxIdx = rangeStart;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const area = Math.abs(
        (ax - avgX) * (values[j] - ay) - (ax - timestamps[j]) * (avgY - ay)
      );
      if (area > maxArea) {
        maxArea = area;
        maxIdx = j;
      }
    }

    outTs[i + 1] = timestamps[maxIdx];
    outVals[i + 1] = values[maxIdx];
    a = maxIdx;
  }

  return { timestamps: outTs, values: outVals };
}

/**
 * Binary search: find the index of the first element >= target.
 * O(log n), used for viewport windowing before downsampling.
 */
export function bisectLeft(arr: Float64Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function bisectRight(arr: Float64Array, target: number): number {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] <= target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Get windowed + downsampled slice.
 * Returns indices [iStart, iEnd) of original array that fall within [xMin, xMax],
 * expanded by one on each side for visual continuity.
 */
export function windowedLTTB(
  timestamps: Float64Array,
  values: Float64Array,
  xMin: number,
  xMax: number,
  maxPoints: number
): { timestamps: Float64Array; values: Float64Array } {
  const iStart = Math.max(0, bisectLeft(timestamps, xMin) - 1);
  const iEnd = Math.min(timestamps.length, bisectRight(timestamps, xMax) + 1);

  if (iEnd <= iStart) {
    return { timestamps: new Float64Array(0), values: new Float64Array(0) };
  }

  const windowTs = timestamps.subarray(iStart, iEnd);
  const windowVals = values.subarray(iStart, iEnd);

  return lttbTyped(windowTs, windowVals, maxPoints);
}
