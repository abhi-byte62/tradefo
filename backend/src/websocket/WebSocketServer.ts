import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import { HotCache } from '../infrastructure/cache/HotCache.js';
import { EventBus, DomainEvent } from '../infrastructure/events/EventBus.js';
import { MarketSimulator } from '../domain/simulator/MarketSimulator.js';
import { WsMessage, Tick, MarketDepth } from '../types/index.js';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

export class WebSocketService {
  private wss: WSServer;
  private connections: Map<string, { ws: WebSocket; userId?: string; isAlive: boolean }> = new Map();
  private userConnections: Map<string, Set<string>> = new Map(); // userId -> Set<connId>
  private jwtSecret: string;

  constructor(
    server: HttpServer,
    private cache: HotCache,
    private eventBus: EventBus,
    private simulator: MarketSimulator,
    jwtSecret: string = 'tradeforge-dev-secret-key-2026'
  ) {
    this.jwtSecret = jwtSecret;
    this.wss = new WSServer({ server, path: '/ws' });
    this.init();
    this.setupEventListeners();
  }

  private init() {
    this.wss.on('connection', (ws: WebSocket) => {
      const connId = uuidv4();
      this.connections.set(connId, { ws, isAlive: true });

      // Default subscriptions to top indices and stocks
      const defaultSymbols = ['NIFTY50', 'BANKNIFTY', 'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'NVDA', 'BTCUSD'];
      this.cache.subscribe(connId, defaultSymbols);

      // Send initial snapshot of all ticks
      const initialTicks = this.cache.getAllTicks();
      if (initialTicks.length > 0) {
        this.sendToConnection(connId, {
          type: 'TICK',
          data: initialTicks
        });
      }

      ws.on('message', (messageRaw: string) => {
        try {
          const msg: WsMessage = JSON.parse(messageRaw.toString());
          this.handleClientMessage(connId, msg);
        } catch (err) {
          this.sendToConnection(connId, { type: 'ERROR', error: 'Invalid JSON payload' });
        }
      });

      ws.on('pong', () => {
        const conn = this.connections.get(connId);
        if (conn) conn.isAlive = true;
      });

      ws.on('close', () => {
        this.handleDisconnect(connId);
      });

      ws.on('error', () => {
        this.handleDisconnect(connId);
      });
    });

    // Heartbeat interval to drop dead connections
    setInterval(() => {
      for (const [connId, conn] of this.connections.entries()) {
        if (!conn.isAlive) {
          conn.ws.terminate();
          this.handleDisconnect(connId);
          continue;
        }
        conn.isAlive = false;
        conn.ws.ping();
      }
    }, 30000);
  }

  private handleClientMessage(connId: string, msg: WsMessage) {
    const conn = this.connections.get(connId);
    if (!conn) return;

    switch (msg.type) {
      case 'PING':
        this.sendToConnection(connId, { type: 'PONG', timestamp: Date.now() });
        break;

      case 'AUTH':
        if (msg.token) {
          try {
            const decoded = jwt.verify(msg.token, this.jwtSecret) as { id: string };
            conn.userId = decoded.id;

            if (!this.userConnections.has(decoded.id)) {
              this.userConnections.set(decoded.id, new Set());
            }
            this.userConnections.get(decoded.id)!.add(connId);

            this.sendToConnection(connId, {
              type: 'AUTH',
              data: { authenticated: true, userId: decoded.id }
            });
          } catch (err) {
            this.sendToConnection(connId, { type: 'ERROR', error: 'Invalid auth token' });
          }
        }
        break;

      case 'SUBSCRIBE':
        if (msg.symbols && Array.isArray(msg.symbols)) {
          this.cache.subscribe(connId, msg.symbols);
          // Send instant ticks for subscribed symbols
          const ticks = msg.symbols
            .map(s => this.cache.getTick(s))
            .filter((t): t is Tick => !!t);
          if (ticks.length > 0) {
            this.sendToConnection(connId, { type: 'TICK', data: ticks });
          }
        }
        break;

      case 'UNSUBSCRIBE':
        if (msg.symbols && Array.isArray(msg.symbols)) {
          this.cache.unsubscribe(connId, msg.symbols);
        }
        break;
    }
  }

  private handleDisconnect(connId: string) {
    const conn = this.connections.get(connId);
    if (conn && conn.userId) {
      this.userConnections.get(conn.userId)?.delete(connId);
    }
    this.connections.delete(connId);
    this.cache.removeConnection(connId);
  }

  private sendToConnection(connId: string, msg: WsMessage) {
    const conn = this.connections.get(connId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg));
    }
  }

  public sendToUser(userId: string, msg: WsMessage) {
    const userConns = this.userConnections.get(userId);
    if (userConns) {
      for (const connId of userConns) {
        this.sendToConnection(connId, msg);
      }
    }
  }

  private setupEventListeners() {
    // 1. Live Market Simulator Ticks
    this.simulator.on('ticks', (ticks: Tick[]) => {
      // Group ticks by subscribers
      const connTicksMap: Map<string, Tick[]> = new Map();

      for (const tick of ticks) {
        this.cache.setTick(tick);
        const subscribers = this.cache.getSubscribersForSymbol(tick.symbol);

        for (const connId of subscribers) {
          if (!connTicksMap.has(connId)) {
            connTicksMap.set(connId, []);
          }
          connTicksMap.get(connId)!.push(tick);
        }
      }

      // Broadcast batched ticks to each subscribed client
      for (const [connId, clientTicks] of connTicksMap.entries()) {
        this.sendToConnection(connId, {
          type: 'TICK',
          data: clientTicks
        });
      }
    });

    // 2. Domain Events to User Clients
    this.eventBus.subscribe('ORDER_ACCEPTED', (event: DomainEvent) => {
      this.sendToUser(event.payload.order.user_id, {
        type: 'ORDER_UPDATE',
        data: event.payload.order
      });
    });

    this.eventBus.subscribe('ORDER_REJECTED', (event: DomainEvent) => {
      this.sendToUser(event.payload.order.user_id, {
        type: 'ORDER_UPDATE',
        data: event.payload.order
      });
    });

    this.eventBus.subscribe('ORDER_CANCELLED', (event: DomainEvent) => {
      this.sendToUser(event.payload.order.user_id, {
        type: 'ORDER_UPDATE',
        data: event.payload.order
      });
    });

    this.eventBus.subscribe('ORDER_MODIFIED', (event: DomainEvent) => {
      this.sendToUser(event.payload.order.user_id, {
        type: 'ORDER_UPDATE',
        data: event.payload.order
      });
    });

    this.eventBus.subscribe('TRADE_EXECUTED', (event: DomainEvent) => {
      this.sendToUser(event.payload.order.user_id, {
        type: 'TRADE_TAPE',
        data: event.payload
      });
      this.sendToUser(event.payload.order.user_id, {
        type: 'ORDER_UPDATE',
        data: event.payload.order
      });
    });

    this.eventBus.subscribe('POSITION_UPDATED', (event: DomainEvent) => {
      this.sendToUser(event.payload.position.user_id, {
        type: 'POSITION_UPDATE',
        data: event.payload.position
      });
    });

    this.eventBus.subscribe('PORTFOLIO_UPDATED', (event: DomainEvent) => {
      this.sendToUser(event.payload.account.user_id, {
        type: 'PORTFOLIO_UPDATE',
        data: event.payload.account
      });
    });
  }
}
