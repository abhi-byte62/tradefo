import { Tick, MarketDepth } from '../../types/index.js';

export class HotCache {
  private ticks: Map<string, Tick> = new Map();
  private depths: Map<string, MarketDepth> = new Map();
  // symbol -> Set of connection IDs
  private symbolSubscriptions: Map<string, Set<string>> = new Map();
  // connection ID -> Set of symbols
  private connectionSubscriptions: Map<string, Set<string>> = new Map();
  // Idempotency: key -> { timestamp, response }
  private idempotencyKeys: Map<string, { timestamp: number; response: any }> = new Map();
  // Rate limiting: key -> timestamp[]
  private rateLimitWindows: Map<string, number[]> = new Map();

  // --- Ticks & Depth ---
  public setTick(tick: Tick) {
    this.ticks.set(tick.symbol, tick);
  }

  public getTick(symbol: string): Tick | undefined {
    return this.ticks.get(symbol);
  }

  public getAllTicks(): Tick[] {
    return Array.from(this.ticks.values());
  }

  public setDepth(depth: MarketDepth) {
    this.depths.set(depth.symbol, depth);
  }

  public getDepth(symbol: string): MarketDepth | undefined {
    return this.depths.get(symbol);
  }

  // --- Subscriptions ---
  public subscribe(connId: string, symbols: string[]) {
    if (!this.connectionSubscriptions.has(connId)) {
      this.connectionSubscriptions.set(connId, new Set());
    }
    const connSet = this.connectionSubscriptions.get(connId)!;

    for (const sym of symbols) {
      connSet.add(sym);
      if (!this.symbolSubscriptions.has(sym)) {
        this.symbolSubscriptions.set(sym, new Set());
      }
      this.symbolSubscriptions.get(sym)!.add(connId);
    }
  }

  public unsubscribe(connId: string, symbols: string[]) {
    const connSet = this.connectionSubscriptions.get(connId);
    if (!connSet) return;

    for (const sym of symbols) {
      connSet.delete(sym);
      const symSet = this.symbolSubscriptions.get(sym);
      if (symSet) {
        symSet.delete(connId);
      }
    }
  }

  public removeConnection(connId: string) {
    const symbols = this.connectionSubscriptions.get(connId);
    if (symbols) {
      for (const sym of symbols) {
        this.symbolSubscriptions.get(sym)?.delete(connId);
      }
      this.connectionSubscriptions.delete(connId);
    }
  }

  public getSubscribersForSymbol(symbol: string): string[] {
    const set = this.symbolSubscriptions.get(symbol);
    return set ? Array.from(set) : [];
  }

  // --- Idempotency ---
  public getIdempotency(key: string): any | null {
    const entry = this.idempotencyKeys.get(key);
    if (!entry) return null;
    // TTL 10 minutes
    if (Date.now() - entry.timestamp > 10 * 60 * 1000) {
      this.idempotencyKeys.delete(key);
      return null;
    }
    return entry.response;
  }

  public setIdempotency(key: string, response: any) {
    this.idempotencyKeys.set(key, {
      timestamp: Date.now(),
      response
    });
  }

  // --- Rate Limiting (Sliding Window) ---
  public checkRateLimit(key: string, maxRequests: number = 30, windowMs: number = 1000): boolean {
    const now = Date.now();
    const timestamps = this.rateLimitWindows.get(key) || [];
    const windowStart = now - windowMs;

    const filtered = timestamps.filter(t => t > windowStart);
    if (filtered.length >= maxRequests) {
      this.rateLimitWindows.set(key, filtered);
      return false; // Rate limit exceeded
    }

    filtered.push(now);
    this.rateLimitWindows.set(key, filtered);
    return true; // Allowed
  }
}
