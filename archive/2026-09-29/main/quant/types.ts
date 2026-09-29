export const SYMBOLS = ["BTCUSDT", "ETHUSDT"] as const;
export type SymbolName = (typeof SYMBOLS)[number];
export type Side = "long" | "short";
export type Level = [number, number];
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface Flow {
  time: number;
  buy: number;
  sell: number;
  trades: number;
}
export interface Frame {
  id: string;
  symbol: SymbolName;
  time: number;
  bookTime: number;
  bids: Level[];
  asks: Level[];
  mark: number;
  oi: number | null;
  fundingRate: number | null;
  nextFundingTime: number | null;
  candles: Candle[];
  perp: Flow[];
  spot: Flow[];
  oiChangePct: number | null;
  coverageStart: number;
  session: string;
  healthy: boolean;
  issues: string[];
  liquidity?: LiquiditySnapshot;
  liquidityError?: string | null;
}
export interface LiquiditySnapshot {
  time: number;
  source: "bybit-full-rest" | "recorded-ws" | "synthetic";
  mid: number;
  low: number;
  high: number;
  bidLevels: number;
  askLevels: number;
  step: number;
  // Absolute price-bin lower edge, bid USDT, ask USDT. Not cumulative depth.
  cells: [number, number, number][];
}
export interface Config {
  version: string;
  initialBalance: number;
  riskFraction: number;
  maxExposure: number;
  dailyLossFraction: number;
  feeBps: number;
  slippageBps: number;
  maxSpreadBps: number;
  perpDelta: number;
  spotDelta: number;
  depthImbalance: number;
  minStopBps: number;
  stopAtr: number;
  rewardRisk: number;
  maxHoldMs: number;
  decisionMs: number;
  latencyMs: number;
  pendingTtlMs: number;
  cooldownMs: number;
}
export const DEFAULT_CONFIG: Config = {
  version: "orderflow-breakout-v1",
  initialBalance: 10000,
  riskFraction: 0.0025,
  maxExposure: 1,
  dailyLossFraction: 0.02,
  feeBps: 5.5,
  slippageBps: 1,
  maxSpreadBps: 3,
  perpDelta: 0.1,
  spotDelta: 0.03,
  depthImbalance: 0.15,
  minStopBps: 20,
  stopAtr: 1.5,
  rewardRisk: 2,
  maxHoldMs: 3600000,
  decisionMs: 300000,
  latencyMs: 500,
  pendingTtlMs: 20000,
  cooldownMs: 300000,
};
export interface Features {
  windowEnd: number;
  close: number | null;
  rangeHigh: number | null;
  rangeLow: number | null;
  atr: number | null;
  perpDelta: number;
  spotDelta: number;
  perpRatio: number | null;
  spotRatio: number | null;
  imbalance: number | null;
  spreadBps: number | null;
  oiChangePct: number | null;
  ready: boolean;
  issues: string[];
  bands: { bps: number; bid: number; ask: number; covered: boolean }[];
}
export interface Decision {
  id: string;
  symbol: SymbolName;
  time: number;
  action: "long" | "short" | "wait" | "hold";
  reasons: string[];
  checks: { label: string; long: boolean; short: boolean; value: string }[];
  features: Features;
  frameId: string;
  model: "rules";
  version: string;
}
export interface Pending {
  decisionId: string;
  symbol: SymbolName;
  side: Side;
  created: number;
  stopDistance: number;
  referencePrice: number;
}
export interface Position {
  id: string;
  symbol: SymbolName;
  side: Side;
  qty: number;
  entry: number;
  stop: number;
  target: number;
  openedAt: number;
  entryFee: number;
  funding: number;
  lastMark: number;
  markTime: number;
  fundingNext: number | null;
  fundingRate: number | null;
  fundingUncertain: boolean;
}
export interface Fill {
  id: string;
  positionId: string;
  symbol: SymbolName;
  time: number;
  kind: "entry" | "exit";
  side: Side;
  qty: number;
  price: number;
  fee: number;
  grossPnl: number;
  netPnl: number | null;
  reason: string;
  decisionId: string | null;
  fundingUncertain: boolean;
}
export interface Event {
  id: string;
  time: number;
  symbol: string;
  kind: string;
  message: string;
  amount?: number;
}
export interface State {
  cash: number;
  positions: Position[];
  pending: Pending[];
  paused: boolean;
  peakEquity: number;
  maxDrawdownPct: number;
  day: string;
  dayStartEquity: number;
  haltedDay: string | null;
  lastDecision: Record<string, number>;
  lastExit: Record<string, number>;
  lastFrame: Record<string, number>;
  completed: number;
  wins: number;
  netProfit: number;
  grossWins: number;
  grossLosses: number;
  totalFees: number;
  totalFunding: number;
}
export interface StepResult {
  state: State;
  decision: Decision | null;
  fills: Fill[];
  events: Event[];
  equity: number;
}
