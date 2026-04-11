/**
 * Black-Scholes option pricing + Implied Volatility inversion.
 *
 * References:
 *  - Black & Scholes (1973)
 *  - Hart approximation for initial IV guess (Brenner & Subrahmanyam 1988)
 *  - Newton-Raphson iteration for IV convergence
 */

// ─── Normal Distribution ──────────────────────────────────────────────────────

/** Abramowitz & Stegun approximation (max error 7.5e-8) */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const a1 = 0.319381530;
  const a2 = -0.356563782;
  const a3 = 1.781477937;
  const a4 = -1.821255978;
  const a5 = 1.330274429;
  const p = 0.2316419;
  const t = 1 / (1 + p * Math.abs(x));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const base = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x) * poly;
  return x >= 0 ? base : 1 - base;
}

/** Standard normal PDF */
function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

// ─── Black-Scholes Pricing ────────────────────────────────────────────────────

export interface BSInput {
  S: number;   // spot price
  K: number;   // strike
  T: number;   // time to expiry in years (> 0)
  r: number;   // risk-free rate (continuous, decimal)
  sigma: number; // annualized volatility (decimal)
  q?: number;  // dividend / carry rate (default 0)
}

export interface BSOutput {
  call: number;
  put: number;
  delta_call: number;
  delta_put: number;
  gamma: number;
  vega: number;   // per 1% vol change → divide by 100 for per-unit
  theta_call: number;
  theta_put: number;
  rho_call: number;
  rho_put: number;
  d1: number;
  d2: number;
}

export function blackScholes(input: BSInput): BSOutput {
  const { S, K, T, r, sigma } = input;
  const q = input.q ?? 0;

  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) {
    const intrinsicCall = Math.max(0, S - K);
    const intrinsicPut = Math.max(0, K - S);
    return {
      call: intrinsicCall,
      put: intrinsicPut,
      delta_call: S > K ? 1 : 0,
      delta_put: S > K ? 0 : -1,
      gamma: 0,
      vega: 0,
      theta_call: 0,
      theta_put: 0,
      rho_call: 0,
      rho_put: 0,
      d1: 0,
      d2: 0,
    };
  }

  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const Nnd1 = normalCDF(-d1);
  const Nnd2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  const ert = Math.exp(-r * T);
  const eqt = Math.exp(-q * T);

  const call = S * eqt * Nd1 - K * ert * Nd2;
  const put = K * ert * Nnd2 - S * eqt * Nnd1;

  const gamma = (nd1 * eqt) / (S * sigma * sqrtT);
  const vega = S * eqt * nd1 * sqrtT; // per unit sigma

  const theta_call =
    -(S * eqt * nd1 * sigma) / (2 * sqrtT) -
    r * K * ert * Nd2 +
    q * S * eqt * Nd1;

  const theta_put =
    -(S * eqt * nd1 * sigma) / (2 * sqrtT) +
    r * K * ert * Nnd2 -
    q * S * eqt * Nnd1;

  const rho_call = K * T * ert * Nd2;
  const rho_put = -K * T * ert * Nnd2;

  return {
    call,
    put,
    delta_call: eqt * Nd1,
    delta_put: eqt * (Nd1 - 1),
    gamma,
    vega,
    theta_call: theta_call / 365, // per calendar day
    theta_put: theta_put / 365,
    rho_call,
    rho_put,
    d1,
    d2,
  };
}

// ─── Implied Volatility via Newton-Raphson ────────────────────────────────────

/**
 * Compute implied volatility given a market option price.
 *
 * @param marketPrice  Observed option price
 * @param optionType   "call" or "put"
 * @param input        BSInput with sigma = initial guess (or 0 for auto-guess)
 * @param maxIter      Newton-Raphson max iterations (default 100)
 * @param tol          Convergence tolerance (default 1e-6)
 * @returns IV in decimal (e.g. 0.25 = 25%), or NaN if not converged
 */
export function impliedVolatility(
  marketPrice: number,
  optionType: "call" | "put",
  input: Omit<BSInput, "sigma">,
  maxIter = 100,
  tol = 1e-6
): number {
  const { S, K, T, r } = input;

  if (T <= 0 || marketPrice <= 0 || S <= 0) return NaN;

  // Intrinsic value check
  const intrinsic = optionType === "call"
    ? Math.max(0, S - K * Math.exp(-r * T))
    : Math.max(0, K * Math.exp(-r * T) - S);

  if (marketPrice < intrinsic - 1e-6) return NaN; // below intrinsic, no solution

  // Initial guess: Brenner-Subrahmanyam (1988) approximation
  // Works well when S ≈ K (ATM). For skewed strikes, Corrado-Miller is better.
  let sigma = Math.sqrt(2 * Math.PI / T) * (marketPrice / S);
  // Clamp to reasonable range
  sigma = Math.max(0.01, Math.min(sigma, 10.0));

  for (let i = 0; i < maxIter; i++) {
    const bs = blackScholes({ ...input, sigma });
    const price = optionType === "call" ? bs.call : bs.put;
    const vega = bs.vega; // ∂price/∂sigma

    if (Math.abs(vega) < 1e-12) break; // near-zero vega: cannot invert

    const diff = price - marketPrice;
    const step = diff / vega;
    sigma -= step;

    // Keep sigma positive
    if (sigma <= 0) sigma = 1e-6;

    if (Math.abs(diff) < tol) return sigma;
  }

  // Final check
  const bs = blackScholes({ ...input, sigma });
  const finalPrice = optionType === "call" ? bs.call : bs.put;
  return Math.abs(finalPrice - marketPrice) < 0.01 ? sigma : NaN;
}

/**
 * Build IV smile from a set of strikes and market prices.
 */
export interface SmilePoint {
  strike: number;
  iv: number;
  delta: number;
  optionType: "call" | "put";
}

export function buildIVSmile(
  strikes: number[],
  marketPrices: number[],
  optionTypes: ("call" | "put")[],
  S: number,
  T: number,
  r = 0
): SmilePoint[] {
  const result: SmilePoint[] = [];
  for (let i = 0; i < strikes.length; i++) {
    const K = strikes[i];
    const price = marketPrices[i];
    const type = optionTypes[i];
    const iv = impliedVolatility(price, type, { S, K, T, r });
    if (!isNaN(iv)) {
      const bs = blackScholes({ S, K, T, r, sigma: iv });
      result.push({
        strike: K,
        iv,
        delta: type === "call" ? bs.delta_call : bs.delta_put,
        optionType: type,
      });
    }
  }
  result.sort((a, b) => a.strike - b.strike);
  return result;
}
