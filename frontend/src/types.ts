export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT';
export type ProductType = 'INTRADAY' | 'DELIVERY';

export type OrderStatus =
  | 'NEW'
  | 'PENDING'
  | 'OPEN'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'CANCELLED'
  | 'REJECTED'
  | 'EXPIRED';

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE' | 'NFO' | 'CRYPTO';
  instrument_type: 'EQUITY' | 'INDEX' | 'FUTURE' | 'CRYPTO';
  tick_size: number;
  lot_size: number;
  base_price: number;
  lower_circuit: number;
  upper_circuit: number;
  segment: string;
}

export interface Order {
  id: string;
  client_order_id?: string;
  user_id: string;
  symbol: string;
  side: OrderSide;
  order_type: OrderType;
  product_type: ProductType;
  quantity: number;
  filled_quantity: number;
  remaining_quantity: number;
  price?: number;
  trigger_price?: number;
  average_price?: number;
  status: OrderStatus;
  reject_reason?: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface Execution {
  id: string;
  order_id: string;
  user_id: string;
  symbol: string;
  side: OrderSide;
  price: number;
  quantity: number;
  timestamp: string;
  maker_order_id?: string;
  taker_order_id?: string;
}

export interface Position {
  id: string;
  user_id: string;
  symbol: string;
  product_type: ProductType;
  quantity: number;
  buy_quantity: number;
  sell_quantity: number;
  buy_value: number;
  sell_value: number;
  average_price: number;
  realized_pnl: number;
  unrealized_pnl: number;
  last_price: number;
  updated_at: string;
}

export interface Holding {
  id: string;
  user_id: string;
  symbol: string;
  quantity: number;
  average_price: number;
  invested_value: number;
  current_value: number;
  pnl: number;
  pnl_percentage: number;
  updated_at: string;
}

export interface Account {
  user_id: string;
  cash_balance: number;
  available_margin: number;
  used_margin: number;
  realized_pnl: number;
  unrealized_pnl: number;
  initial_balance: number;
  holdings_value?: number;
  total_portfolio_value?: number;
  currency: string;
  updated_at: string;
}

export interface DepthLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface MarketDepth {
  symbol: string;
  bids: DepthLevel[];
  asks: DepthLevel[];
  timestamp: number;
  total_bid_qty: number;
  total_ask_qty: number;
}

export interface Tick {
  symbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  change: number;
  change_percent: number;
  bid: number;
  ask: number;
  bid_qty: number;
  ask_qty: number;
  timestamp: number;
  flashDirection?: 'up' | 'down';
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Watchlist {
  id: string;
  user_id: string;
  name: string;
  symbols: string[];
  created_at: string;
}

export interface OrderAuditLog {
  id: string;
  order_id: string;
  event: string;
  details: Record<string, any>;
  timestamp: string;
}
