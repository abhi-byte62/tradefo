import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Database } from '../infrastructure/database/Database.js';
import { HotCache } from '../infrastructure/cache/HotCache.js';
import { MarketSimulator } from '../domain/simulator/MarketSimulator.js';
import { MatchingEngine } from '../domain/matching/MatchingEngine.js';
import { OrderService } from '../domain/OrderService.js';
import { PortfolioEngine } from '../domain/portfolio/PortfolioEngine.js';
import { AuthenticatedRequest, createAuthMiddleware } from './auth.js';

export function createApiRouter(
  db: Database,
  cache: HotCache,
  simulator: MarketSimulator,
  matchingEngine: MatchingEngine,
  orderService: OrderService,
  portfolioEngine: PortfolioEngine,
  jwtSecret: string = 'tradeforge-dev-secret-key-2026'
): Router {
  const router = Router();
  const auth = createAuthMiddleware(jwtSecret);

  // --- 1. Authentication ---
  router.post('/auth/register', async (req, res) => {
    try {
      const { email, name, password } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'Email, name, and password are required' });
      }

      const existing = await db.getUserByEmail(email);
      if (existing) {
        return res.status(400).json({ error: 'User already exists with this email' });
      }

      const hash = await bcrypt.hash(password, 10);
      const user = await db.createUser(email, name, hash);
      const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
      const account = await db.getAccount(user.id);

      return res.status(201).json({
        user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
        token,
        account
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Registration failed', message: err.message });
    }
  });

  router.post('/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await db.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      }

      const match = await bcrypt.compare(password, user.password_hash);
      if (!match) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
      }

      const token = jwt.sign({ id: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
      const account = await db.getAccount(user.id);

      return res.json({
        user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
        token,
        account
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Login failed', message: err.message });
    }
  });

  router.get('/auth/me', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      let user = await db.getUserById(req.userId!);
      if (!user) {
        // If server was restarted with in-memory mode, auto-heal session
        if (req.userEmail === 'trader@tradeforge.io' || req.userId === 'usr_demo_alpha_trader') {
          const hash = await bcrypt.hash('password123', 10);
          user = await db.createUser('trader@tradeforge.io', 'Alpha Trader', hash, 'usr_demo_alpha_trader');
        } else if (req.userEmail) {
          const hash = await bcrypt.hash('password123', 10);
          user = await db.createUser(req.userEmail, 'Alpha Trader', hash, req.userId);
        }
      }

      if (!user) return res.status(401).json({ error: 'User not found, please log in again' });
      const account = await db.getAccount(user.id);
      return res.json({
        user: { id: user.id, email: user.email, name: user.name, created_at: user.created_at },
        account
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch user', message: err.message });
    }
  });

  // --- 2. Market Data Endpoints ---
  router.get('/instruments', (_req, res) => {
    const instruments = simulator.getInstruments();
    return res.json(instruments);
  });

  router.get('/instruments/:symbol', (req, res) => {
    const inst = simulator.getInstrument(req.params.symbol.toUpperCase());
    if (!inst) return res.status(404).json({ error: 'Instrument not found' });
    const tick = simulator.getCurrentTick(inst.symbol);
    return res.json({ instrument: inst, tick });
  });

  router.get('/instruments/:symbol/depth', (req, res) => {
    const depth = simulator.getMarketDepth(req.params.symbol.toUpperCase());
    return res.json(depth);
  });

  router.get('/instruments/:symbol/candles', (req, res) => {
    const symbol = req.params.symbol.toUpperCase();
    const timeframe = (req.query.timeframe as string) || '1m';
    const candles = simulator.getHistoricalCandles(symbol, timeframe);
    return res.json(candles);
  });

  router.get('/ticks', (_req, res) => {
    const ticks = simulator.getAllTicks();
    return res.json(ticks);
  });

  // --- 3. Orders Endpoints ---
  router.get('/orders', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const orders = await db.getUserOrders(req.userId!);
      return res.json(orders);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch orders', message: err.message });
    }
  });

  router.post('/orders', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idempotencyKey = (req.headers['x-idempotency-key'] as string) || req.body.client_order_id;
      const result = await orderService.submitOrder(req.userId!, req.body, idempotencyKey);

      if (!result.success) {
        return res.status(400).json({
          error: result.rejectReason,
          message: result.message,
          order: result.order
        });
      }

      return res.status(201).json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Order submission failed', message: err.message });
    }
  });

  router.delete('/orders/:id', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = await orderService.cancelOrder(req.userId!, req.params.id);
      if (!result.success) {
        return res.status(400).json({ error: 'CANCEL_FAILED', message: result.message });
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Cancellation failed', message: err.message });
    }
  });

  router.patch('/orders/:id', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { price, quantity } = req.body;
      if (!price || !quantity) {
        return res.status(400).json({ error: 'Price and quantity required for modification' });
      }
      const result = await orderService.modifyOrder(req.userId!, req.params.id, Number(price), Number(quantity));
      if (!result.success) {
        return res.status(400).json({ error: 'MODIFY_FAILED', message: result.message });
      }
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Modification failed', message: err.message });
    }
  });

  router.get('/orders/:id/logs', auth, (req: AuthenticatedRequest, res: Response) => {
    const logs = db.getOrderAuditLogs(req.params.id);
    return res.json(logs);
  });

  // --- 4. Portfolio & Trades ---
  router.get('/positions', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const positions = await db.getPositions(req.userId!);
      const ticks = new Map(simulator.getAllTicks().map(t => [t.symbol, t]));
      const holdings = await db.getHoldings(req.userId!);
      const mtm = portfolioEngine.markToMarket(positions, holdings, ticks);
      return res.json(mtm.updatedPositions);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch positions', message: err.message });
    }
  });

  router.post('/positions/square-off', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { symbol, product_type } = req.body;
      if (!symbol) return res.status(400).json({ error: 'Symbol is required' });
      const result = await orderService.squareOffPosition(req.userId!, symbol.toUpperCase(), product_type || 'INTRADAY');
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: 'Square off failed', message: err.message });
    }
  });

  router.get('/holdings', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const holdings = await db.getHoldings(req.userId!);
      const ticks = new Map(simulator.getAllTicks().map(t => [t.symbol, t]));
      const positions = await db.getPositions(req.userId!);
      const mtm = portfolioEngine.markToMarket(positions, holdings, ticks);
      return res.json(mtm.updatedHoldings);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch holdings', message: err.message });
    }
  });

  router.get('/trades', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const trades = await db.getUserExecutions(req.userId!);
      return res.json(trades);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch trades', message: err.message });
    }
  });

  router.get('/account', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await db.getAccount(req.userId!);
      if (!account) return res.status(404).json({ error: 'Account not found' });

      const positions = await db.getPositions(req.userId!);
      const holdings = await db.getHoldings(req.userId!);
      const ticks = new Map(simulator.getAllTicks().map(t => [t.symbol, t]));
      const mtm = portfolioEngine.markToMarket(positions, holdings, ticks);

      return res.json({
        ...account,
        unrealized_pnl: mtm.totalUnrealizedPnl,
        holdings_value: mtm.totalPortfolioValue,
        total_portfolio_value: Number((account.cash_balance + account.realized_pnl + mtm.totalUnrealizedPnl + mtm.totalPortfolioValue).toFixed(2))
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch account', message: err.message });
    }
  });

  router.post('/account/reset-balance', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const account = await db.resetAccountBalance(req.userId!, 1000000.0);
      return res.json({ message: 'Account balance reset to ₹10,00,000 Paper Capital', account });
    } catch (err: any) {
      return res.status(500).json({ error: 'Reset failed', message: err.message });
    }
  });

  // --- 5. Watchlists ---
  router.get('/watchlists', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const lists = await db.getUserWatchlists(req.userId!);
      return res.json(lists);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to fetch watchlists', message: err.message });
    }
  });

  router.post('/watchlists', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, symbols } = req.body;
      const wl = await db.createWatchlist(req.userId!, name || 'New Watchlist', symbols || []);
      return res.status(201).json(wl);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to create watchlist', message: err.message });
    }
  });

  router.put('/watchlists/:id', auth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { symbols } = req.body;
      const updated = await db.updateWatchlistSymbols(req.params.id, symbols);
      if (!updated) return res.status(404).json({ error: 'Watchlist not found' });
      return res.json(updated);
    } catch (err: any) {
      return res.status(500).json({ error: 'Failed to update watchlist', message: err.message });
    }
  });

  // --- 6. Health & Metrics ---
  router.get('/health', (_req, res) => {
    return res.json({
      status: 'HEALTHY',
      service: 'TradeForge Engine',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  router.get('/metrics', (_req, res) => {
    const mem = process.memoryUsage();
    return res.json({
      memory: {
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
        rssMb: Math.round(mem.rss / 1024 / 1024)
      },
      instrumentsCount: simulator.getInstruments().length,
      ordersTotal: db.orders.size,
      executionsTotal: db.executions.size,
      uptimeSeconds: Math.floor(process.uptime())
    });
  });

  return router;
}
