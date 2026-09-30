import { User, Instrument, Order, Position, Holding, Account, Watchlist, Candle, MarketDepth, OrderAuditLog } from '../types';

const API_BASE = '/api';

export class ApiClient {
  private static getToken(): string | null {
    return localStorage.getItem('tradeforge_token');
  }

  private static getHeaders(idempotencyKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }
    return headers;
  }

  // --- Auth ---
  public static async login(email: string, password: string): Promise<{ user: User; token: string; account: Account }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Login failed');
    }
    return res.json();
  }

  public static async register(email: string, name: string, password: string): Promise<{ user: User; token: string; account: Account }> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password })
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.message || 'Registration failed');
    }
    return res.json();
  }

  public static async getMe(): Promise<{ user: User; account: Account }> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: this.getHeaders()
    });
    if (!res.ok) throw new Error('Failed to authenticate');
    return res.json();
  }

  // --- Market Data ---
  public static async getInstruments(): Promise<Instrument[]> {
    const res = await fetch(`${API_BASE}/instruments`);
    if (!res.ok) throw new Error('Failed to fetch instruments');
    return res.json();
  }

  public static async getMarketDepth(symbol: string): Promise<MarketDepth> {
    const res = await fetch(`${API_BASE}/instruments/${symbol}/depth`);
    if (!res.ok) throw new Error('Failed to fetch market depth');
    return res.json();
  }

  public static async getHistoricalCandles(symbol: string, timeframe: string = '1m'): Promise<Candle[]> {
    const res = await fetch(`${API_BASE}/instruments/${symbol}/candles?timeframe=${timeframe}`);
    if (!res.ok) throw new Error('Failed to fetch candles');
    return res.json();
  }

  // --- Orders ---
  public static async getOrders(): Promise<Order[]> {
    const res = await fetch(`${API_BASE}/orders`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch orders');
    return res.json();
  }

  public static async submitOrder(orderPayload: any, idempotencyKey?: string): Promise<{ success: boolean; order: Order; message?: string }> {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: this.getHeaders(idempotencyKey),
      body: JSON.stringify(orderPayload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Order rejected');
    }
    return data;
  }

  public static async cancelOrder(orderId: string): Promise<{ success: boolean; order?: Order; message?: string }> {
    const res = await fetch(`${API_BASE}/orders/${orderId}`, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Cancellation failed');
    }
    return data;
  }

  public static async modifyOrder(orderId: string, price: number, quantity: number): Promise<{ success: boolean; order?: Order; message?: string }> {
    const res = await fetch(`${API_BASE}/orders/${orderId}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({ price, quantity })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Modification failed');
    }
    return data;
  }

  public static async getOrderAuditLogs(orderId: string): Promise<OrderAuditLog[]> {
    const res = await fetch(`${API_BASE}/orders/${orderId}/logs`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  // --- Portfolio & Account ---
  public static async getPositions(): Promise<Position[]> {
    const res = await fetch(`${API_BASE}/positions`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  public static async squareOffPosition(symbol: string, productType: string): Promise<any> {
    const res = await fetch(`${API_BASE}/positions/square-off`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ symbol, product_type: productType })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Square off failed');
    return data;
  }

  public static async getHoldings(): Promise<Holding[]> {
    const res = await fetch(`${API_BASE}/holdings`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  public static async getAccount(): Promise<Account> {
    const res = await fetch(`${API_BASE}/account`, { headers: this.getHeaders() });
    if (!res.ok) throw new Error('Failed to fetch account');
    return res.json();
  }

  public static async resetAccountBalance(): Promise<any> {
    const res = await fetch(`${API_BASE}/account/reset-balance`, {
      method: 'POST',
      headers: this.getHeaders()
    });
    return res.json();
  }

  // --- Watchlists ---
  public static async getWatchlists(): Promise<Watchlist[]> {
    const res = await fetch(`${API_BASE}/watchlists`, { headers: this.getHeaders() });
    if (!res.ok) return [];
    return res.json();
  }

  public static async updateWatchlist(id: string, symbols: string[]): Promise<Watchlist> {
    const res = await fetch(`${API_BASE}/watchlists/${id}`, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({ symbols })
    });
    return res.json();
  }
}
