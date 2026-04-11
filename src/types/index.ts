// ─── Core Trading Types ───────────────────────────────────────────────────────

export interface OrderLevel {
  price: number;
  size: number;
}

export interface OrderBook {
  timestamp: number;
  product: string;
  bids: OrderLevel[]; // up to 5 levels, descending price
  asks: OrderLevel[]; // up to 5 levels, ascending price
  midPrice: number;
  pnl: number;
}

export interface Trade {
  timestamp: number;
  product: string;
  price: number;
  quantity: number;
  buyer: string;
  seller: string;
  aggressor: "BUY" | "SELL" | "UNKNOWN"; // Lee-Ready classification
  isBotTrade: boolean;
  isOwnTrade: boolean; // involves SUBMISSION
}

export interface PositionSnapshot {
  timestamp: number;
  product: string;
  position: number;
  positionLimit: number;
  cashFlow: number; // cumulative realized PnL
}

export interface SandboxLog {
  timestamp: number;
  product: string;
  message: string;
  level: "INFO" | "WARN" | "ERROR";
}

// ─── Columnar Data Representation ────────────────────────────────────────────
// Uses TypedArrays for O(1) indexed access and cache-friendly iteration.

export interface ColumnarOrderBook {
  timestamps: Float64Array;
  midPrices: Float64Array;
  pnls: Float64Array;
  // Bid levels [0..4]
  bidPrices: Float64Array[]; // bidPrices[level][tick]
  bidSizes: Float64Array[];
  // Ask levels [0..4]
  askPrices: Float64Array[];
  askSizes: Float64Array[];
  length: number;
}

export interface ColumnarTrades {
  timestamps: Float64Array;
  prices: Float64Array;
  quantities: Float64Array;
  aggressors: Int8Array; // 1=BUY, -1=SELL, 0=UNKNOWN
  isBot: Uint8Array;
  isOwn: Uint8Array;
  length: number;
}

// ─── Parsed Log ───────────────────────────────────────────────────────────────

export interface ParsedLog {
  strategyId: "A" | "B";
  fileName: string;
  products: string[];
  days: number[];
  // per-product columnar data
  orderBooks: Map<string, ColumnarOrderBook>;
  trades: Map<string, ColumnarTrades>;
  sandboxLogs: SandboxLog[];
  // global timeline (union of all product timestamps)
  globalTimestamps: Float64Array;
  parseTime: number; // ms
  rowCount: number;
}

// ─── Computed Metrics ─────────────────────────────────────────────────────────

export interface StrategyMetrics {
  totalPnL: number;
  maxDrawdown: number;
  maxDrawdownStart: number; // timestamp
  maxDrawdownEnd: number;
  winRate: number; // fraction of profitable trades
  totalTrades: number;
  avgTradeSize: number;
  participationRate: number; // trades / total_market_volume
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number; // gross_profit / gross_loss
  avgHoldingTime: number; // ms
  // per-product
  byProduct: Map<string, ProductMetrics>;
}

export interface ProductMetrics {
  product: string;
  pnl: number;
  tradeCount: number;
  volumeTraded: number;
  avgSpread: number;
  inventoryRange: [number, number];
  turnover: number;
}

export interface DeltaMetrics {
  pnlDelta: number; // A - B
  drawdownDiff: number;
  winRateDiff: number;
  participationDelta: number;
  sharpeDiff: number;
  pnlDeltaTimeSeries: Float64Array; // A_pnl[t] - B_pnl[t]
  timestamps: Float64Array;
}

// ─── Microstructure Indicators ────────────────────────────────────────────────

export interface OFIResult {
  timestamps: Float64Array;
  ofi: Float64Array;      // single-level OFI
  mlofi: Float64Array;    // multi-level OFI (top 5)
}

export interface WallMidResult {
  timestamps: Float64Array;
  wallMid: Float64Array;
  fairValue: Float64Array;
  bidWallPrice: Float64Array;
  askWallPrice: Float64Array;
  hasWall: Uint8Array;
}

export interface VPINResult {
  bucketEndTimes: Float64Array;
  vpin: Float64Array;
  buyVolFrac: Float64Array;
  sellVolFrac: Float64Array;
}

export interface ETFSpreadResult {
  timestamps: Float64Array;
  spread: Float64Array;
  zScore: Float64Array;
  nav: Float64Array;
}

export interface IVSmileResult {
  strikes: number[];
  ivs: number[];
  timestamp: number;
  underlying: number;
  expiry: number; // years to expiry
}

export interface AlphaDecayResult {
  timestamps: Float64Array;
  alpha: Float64Array;
  halfLife: number; // ticks
}

// ─── Chart / Visualizer State ─────────────────────────────────────────────────

export interface ViewPort {
  xMin: number; // timestamp
  xMax: number;
  // Y auto-scales per chart
}

export interface CrosshairState {
  timestamp: number | null;
  x: number | null; // pixel coordinate
}

export interface ChartAnnotation {
  timestamp: number;
  label: string;
  color: string;
  type: "vertical" | "point";
  y?: number;
}

// ─── App State ────────────────────────────────────────────────────────────────

export type LoadState = "idle" | "loading" | "ready" | "error";

export interface AppState {
  logA: ParsedLog | null;
  logB: ParsedLog | null;
  loadStateA: LoadState;
  loadStateB: LoadState;
  parseProgressA: number; // 0-1
  parseProgressB: number;
  selectedProduct: string;
  availableProducts: string[];
  viewport: ViewPort;
  crosshair: CrosshairState;
  metricsA: StrategyMetrics | null;
  metricsB: StrategyMetrics | null;
  deltaMetrics: DeltaMetrics | null;
  ofiA: OFIResult | null;
  ofiB: OFIResult | null;
  wallMidA: WallMidResult | null;
  wallMidB: WallMidResult | null;
  vpin: VPINResult | null;
  etfSpread: ETFSpreadResult | null;
  aiChatHistory: AIChatMessage[];
  showStratB: boolean;
  theme: "dark"; // only dark supported
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

// ─── Worker Message Types ─────────────────────────────────────────────────────

export type WorkerRequest =
  | { type: "PARSE"; payload: { text: string; strategyId: "A" | "B"; fileName: string } };

export type WorkerResponse =
  | { type: "PROGRESS"; payload: { progress: number } }
  | { type: "DONE"; payload: ParsedLog }
  | { type: "ERROR"; payload: { message: string } };
