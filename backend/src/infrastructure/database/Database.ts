import { User, Instrument, Order, Execution, Position, Holding, Account, Watchlist, OrderAuditLog } from '../../types/index.js';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

const { Pool } = pg;

export class Database {
  private pool: pg.Pool | null = null;
  private isPostgresConnected: boolean = false;

  // In-memory relational store fallback (for immediate zero-dependency run & tests)
  public users: Map<string, User> = new Map();
  public accounts: Map<string, Account> = new Map(); // userId -> Account
  public orders: Map<string, Order> = new Map(); // orderId -> Order
  public executions: Map<string, Execution> = new Map(); // executionId -> Execution
  public positions: Map<string, Map<string, Position>> = new Map(); // userId -> (symbol_product -> Position)
  public holdings: Map<string, Map<string, Holding>> = new Map(); // userId -> (symbol -> Holding)
  public watchlists: Map<string, Watchlist> = new Map(); // watchlistId -> Watchlist
  public auditLogs: OrderAuditLog[] = [];

  constructor(connectionString?: string) {
    if (connectionString) {
      try {
        this.pool = new Pool({
          connectionString,
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000
        });
      } catch (err) {
        console.warn('[Database] Could not create Postgres pool, using memory store:', err);
      }
    }
  }

  public async init(): Promise<void> {
    if (this.pool) {
      try {
        const client = await this.pool.connect();
        this.isPostgresConnected = true;
        console.log('[Database] Connected to PostgreSQL successfully.');
        client.release();
      } catch (err: any) {
        console.warn(`[Database] PostgreSQL unavailable (${err.message}). Defaulting to High-Performance In-Memory Relational Store.`);
        this.isPostgresConnected = false;
      }
    } else {
      console.log('[Database] Running in In-Memory Mode.');
    }
  }

  // --- Users & Accounts ---
  public async createUser(email: string, name: string, passwordHash: string, idOverride?: string): Promise<User> {
    const user: User = {
      id: idOverride || uuidv4(),
      email: email.toLowerCase().trim(),
      name,
      password_hash: passwordHash,
      created_at: new Date().toISOString()
    };

    const initialAccount: Account = {
      user_id: user.id,
      cash_balance: 1000000.0, // ₹10,00,000 Paper Trading Starting Capital
      available_margin: 1000000.0,
      used_margin: 0.0,
      realized_pnl: 0.0,
      unrealized_pnl: 0.0,
      initial_balance: 1000000.0,
      currency: 'INR',
      updated_at: new Date().toISOString()
    };

    this.users.set(user.id, user);
    this.accounts.set(user.id, initialAccount);

    // Create default watchlist
    const defaultWatchlist: Watchlist = {
      id: uuidv4(),
      user_id: user.id,
      name: 'Default Watchlist',
      symbols: ['NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'TATAMOTORS', 'NVDA', 'BTCUSD'],
      created_at: new Date().toISOString()
    };
    this.watchlists.set(defaultWatchlist.id, defaultWatchlist);

    return user;
  }

  public async getUserByEmail(email: string): Promise<User | undefined> {
    const cleanEmail = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email === cleanEmail) return u;
    }
    return undefined;
  }

  public async getUserById(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  public async getAccount(userId: string): Promise<Account | undefined> {
    let acc = this.accounts.get(userId);
    if (!acc) {
      // Auto-initialize account with ₹10,00,000 Paper Balance if user exists
      const user = this.users.get(userId);
      if (user || userId === 'usr_demo_alpha_trader') {
        acc = {
          user_id: userId,
          cash_balance: 1000000.0,
          available_margin: 1000000.0,
          used_margin: 0.0,
          realized_pnl: 0.0,
          unrealized_pnl: 0.0,
          initial_balance: 1000000.0,
          currency: 'INR',
          updated_at: new Date().toISOString()
        };
        this.accounts.set(userId, acc);
      }
    }
    return acc;
  }

  public async updateAccount(account: Account): Promise<void> {
    this.accounts.set(account.user_id, { ...account, updated_at: new Date().toISOString() });
  }

  public async resetAccountBalance(userId: string, initialBalance: number = 1000000.0): Promise<Account> {
    const acc: Account = {
      user_id: userId,
      cash_balance: initialBalance,
      available_margin: initialBalance,
      used_margin: 0.0,
      realized_pnl: 0.0,
      unrealized_pnl: 0.0,
      initial_balance: initialBalance,
      currency: 'INR',
      updated_at: new Date().toISOString()
    };
    this.accounts.set(userId, acc);
    // Clear user positions & holdings
    this.positions.delete(userId);
    this.holdings.delete(userId);
    return acc;
  }

  // --- Orders & Executions ---
  public async saveOrder(order: Order): Promise<Order> {
    this.orders.set(order.id, { ...order });
    return order;
  }

  public async getOrder(orderId: string): Promise<Order | undefined> {
    return this.orders.get(orderId);
  }

  public async getOrderByClientId(userId: string, clientOrderId: string): Promise<Order | undefined> {
    for (const ord of this.orders.values()) {
      if (ord.user_id === userId && ord.client_order_id === clientOrderId) {
        return ord;
      }
    }
    return undefined;
  }

  public async getUserOrders(userId: string): Promise<Order[]> {
    const userOrders: Order[] = [];
    for (const ord of this.orders.values()) {
      if (ord.user_id === userId) {
        userOrders.push(ord);
      }
    }
    return userOrders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public async saveExecution(execution: Execution): Promise<Execution> {
    this.executions.set(execution.id, execution);
    return execution;
  }

  public async getUserExecutions(userId: string): Promise<Execution[]> {
    const userExecs: Execution[] = [];
    for (const exec of this.executions.values()) {
      if (exec.user_id === userId) {
        userExecs.push(exec);
      }
    }
    return userExecs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  // --- Positions ---
  public async getPositions(userId: string): Promise<Position[]> {
    const userPosMap = this.positions.get(userId);
    if (!userPosMap) return [];
    return Array.from(userPosMap.values());
  }

  public async getPosition(userId: string, symbol: string, productType: string): Promise<Position | undefined> {
    const userPosMap = this.positions.get(userId);
    if (!userPosMap) return undefined;
    return userPosMap.get(`${symbol}_${productType}`);
  }

  public async savePosition(position: Position): Promise<Position> {
    if (!this.positions.has(position.user_id)) {
      this.positions.set(position.user_id, new Map());
    }
    const key = `${position.symbol}_${position.product_type}`;
    this.positions.get(position.user_id)!.set(key, position);
    return position;
  }

  // --- Holdings ---
  public async getHoldings(userId: string): Promise<Holding[]> {
    const userHoldings = this.holdings.get(userId);
    if (!userHoldings) return [];
    return Array.from(userHoldings.values()).filter(h => h.quantity > 0);
  }

  public async getHolding(userId: string, symbol: string): Promise<Holding | undefined> {
    const userHoldings = this.holdings.get(userId);
    if (!userHoldings) return undefined;
    return userHoldings.get(symbol);
  }

  public async saveHolding(holding: Holding): Promise<Holding> {
    if (!this.holdings.has(holding.user_id)) {
      this.holdings.set(holding.user_id, new Map());
    }
    this.holdings.get(holding.user_id)!.set(holding.symbol, holding);
    return holding;
  }

  // --- Watchlists ---
  public async getUserWatchlists(userId: string): Promise<Watchlist[]> {
    const list: Watchlist[] = [];
    for (const wl of this.watchlists.values()) {
      if (wl.user_id === userId) {
        list.push(wl);
      }
    }
    return list;
  }

  public async createWatchlist(userId: string, name: string, symbols: string[] = []): Promise<Watchlist> {
    const wl: Watchlist = {
      id: uuidv4(),
      user_id: userId,
      name,
      symbols,
      created_at: new Date().toISOString()
    };
    this.watchlists.set(wl.id, wl);
    return wl;
  }

  public async updateWatchlistSymbols(watchlistId: string, symbols: string[]): Promise<Watchlist | undefined> {
    const wl = this.watchlists.get(watchlistId);
    if (!wl) return undefined;
    wl.symbols = symbols;
    return wl;
  }

  // --- Audit Logs ---
  public logOrderEvent(orderId: string, event: string, details: Record<string, any>) {
    const log: OrderAuditLog = {
      id: uuidv4(),
      order_id: orderId,
      event,
      details,
      timestamp: new Date().toISOString()
    };
    this.auditLogs.push(log);
  }

  public getOrderAuditLogs(orderId: string): OrderAuditLog[] {
    return this.auditLogs.filter(l => l.order_id === orderId);
  }
}
