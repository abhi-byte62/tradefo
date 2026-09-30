import express from 'express';
import http from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { Database } from './infrastructure/database/Database.js';
import { HotCache } from './infrastructure/cache/HotCache.js';
import { EventBus } from './infrastructure/events/EventBus.js';
import { MarketSimulator } from './domain/simulator/MarketSimulator.js';
import { MatchingEngine } from './domain/matching/MatchingEngine.js';
import { RiskEngine } from './domain/risk/RiskEngine.js';
import { PortfolioEngine } from './domain/portfolio/PortfolioEngine.js';
import { OrderService } from './domain/OrderService.js';
import { WebSocketService } from './websocket/WebSocketServer.js';
import { createApiRouter } from './api/routes.js';

dotenv.config();

const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.JWT_SECRET || 'tradeforge-dev-secret-key-2026';
const DATABASE_URL = process.env.DATABASE_URL;

async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // Middlewares
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());

  // Request correlation & logging
  app.use((req, _res, next) => {
    if (!req.path.startsWith('/health') && !req.path.includes('/candles')) {
      console.log(`[API] ${req.method} ${req.path}`);
    }
    next();
  });

  // Core Subsystems
  const db = new Database(DATABASE_URL);
  await db.init();

  const cache = new HotCache();
  const eventBus = new EventBus();
  const simulator = new MarketSimulator();
  const matchingEngine = new MatchingEngine();
  const riskEngine = new RiskEngine();
  const portfolioEngine = new PortfolioEngine();

  const orderService = new OrderService(
    db,
    cache,
    eventBus,
    matchingEngine,
    riskEngine,
    portfolioEngine,
    simulator
  );

  // Initialize Default Seed User
  const defaultEmail = 'trader@tradeforge.io';
  const existingUser = await db.getUserByEmail(defaultEmail);
  if (!existingUser) {
    const passwordHash = await bcrypt.hash('password123', 10);
    const seedUser = await db.createUser(defaultEmail, 'Alpha Trader', passwordHash, 'usr_demo_alpha_trader');
    console.log(`[Seed] Created default user: ${seedUser.email} / password123 (ID: ${seedUser.id})`);
  }

  // Initialize WebSocket Layer
  const wsService = new WebSocketService(server, cache, eventBus, simulator, JWT_SECRET);

  // Mount API
  const apiRouter = createApiRouter(
    db,
    cache,
    simulator,
    matchingEngine,
    orderService,
    portfolioEngine,
    JWT_SECRET
  );
  app.use('/api', apiRouter);

  // Start Real-Time Stochastic Market Simulation
  simulator.start(350); // Emit market ticks every 350ms

  server.listen(PORT, () => {
    console.log(`\n========================================================`);
    console.log(`🚀 TradeForge Engine Server listening on port ${PORT}`);
    console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(`🌐 REST API base: http://localhost:${PORT}/api`);
    console.log(`💼 Seed User: trader@tradeforge.io (password: password123)`);
    console.log(`========================================================\n`);
  });
}

bootstrap().catch(err => {
  console.error('[Fatal Error] Failed to bootstrap TradeForge server:', err);
  process.exit(1);
});
