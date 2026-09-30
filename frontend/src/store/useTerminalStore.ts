import { create } from 'zustand';
import { User, Instrument, Order, Position, Holding, Account, Watchlist, Candle, MarketDepth, Tick, OrderSide, OrderType, ProductType, OrderAuditLog } from '../types';
import { ApiClient } from '../services/api';
import { wsClient, WsStatus } from '../services/websocket';

export interface SystemLog {
  id: string;
  time: string;
  level: 'INFO' | 'EXEC' | 'WARN' | 'RISK';
  text: string;
}

interface TerminalState {
  user: User | null;
  token: string | null;
  account: Account | null;
  instruments: Instrument[];
  selectedSymbol: string;
  timeframe: string;
  ticks: Record<string, Tick>;
  marketDepth: MarketDepth | null;
  candles: Candle[];
  watchlists: Watchlist[];
  activeWatchlistId: string | null;
  orders: Order[];
  positions: Position[];
  holdings: Holding[];
  trades: any[];
  activeBottomTab: 'ORDERS' | 'POSITIONS' | 'HOLDINGS' | 'TRADES' | 'ANALYTICS' | 'LOGS';
  wsStatus: WsStatus;
  systemLogs: SystemLog[];

  // Order Entry State
  orderSide: OrderSide;
  productType: ProductType;
  orderType: OrderType;
  orderQuantity: number;
  orderPrice: number;
  orderTriggerPrice: number;

  // Modals & Active Selections
  isSearchOpen: boolean;
  isShortcutsOpen: boolean;
  isModifyOpen: boolean;
  isLogsOpen: boolean;
  isAuthModalOpen: boolean;
  selectedOrderForLogs: OrderAuditLog[] | null;
  selectedOrderForModify: Order | null;
  orderSubmitting: boolean;

  // Actions
  setAuth: (user: User, token: string, account: Account) => void;
  logout: () => void;
  initSession: () => Promise<void>;
  setSelectedSymbol: (symbol: string) => Promise<void>;
  setTimeframe: (tf: string) => Promise<void>;
  setOrderSide: (side: OrderSide) => void;
  setProductType: (pt: ProductType) => void;
  setOrderType: (ot: OrderType) => void;
  setOrderQuantity: (qty: number) => void;
  setOrderPrice: (price: number) => void;
  setOrderTriggerPrice: (price: number) => void;
  setActiveBottomTab: (tab: 'ORDERS' | 'POSITIONS' | 'HOLDINGS' | 'TRADES' | 'ANALYTICS' | 'LOGS') => void;
  
  // Modals
  setSearchOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  setModifyOpen: (open: boolean, order?: Order) => void;
  setLogsOpen: (open: boolean, logs?: OrderAuditLog[]) => void;
  setAuthModalOpen: (open: boolean) => void;

  // Trading Actions
  submitOrder: () => Promise<void>;
  cancelOrder: (orderId: string) => Promise<void>;
  modifyOrder: (orderId: string, price: number, qty: number) => Promise<void>;
  squareOffPosition: (symbol: string, productType: ProductType) => Promise<void>;
  resetBalance: () => Promise<void>;
  fetchDepth: (symbol?: string) => Promise<void>;
  fetchCandles: (symbol?: string, tf?: string) => Promise<void>;
  refreshUserData: () => Promise<void>;
  addLog: (level: 'INFO' | 'EXEC' | 'WARN' | 'RISK', text: string) => void;
  toggleWatchlistSymbol: (symbol: string) => Promise<void>;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  user: null,
  token: localStorage.getItem('tradeforge_token'),
  account: null,
  instruments: [],
  selectedSymbol: 'NIFTY50',
  timeframe: '1m',
  ticks: {},
  marketDepth: null,
  candles: [],
  watchlists: [],
  activeWatchlistId: null,
  orders: [],
  positions: [],
  holdings: [],
  trades: [],
  activeBottomTab: 'ORDERS',
  wsStatus: 'DISCONNECTED',
  systemLogs: [],

  orderSide: 'BUY',
  productType: 'INTRADAY',
  orderType: 'MARKET',
  orderQuantity: 25,
  orderPrice: 25800,
  orderTriggerPrice: 25700,

  isSearchOpen: false,
  isShortcutsOpen: false,
  isModifyOpen: false,
  isLogsOpen: false,
  isAuthModalOpen: false,
  selectedOrderForLogs: null,
  selectedOrderForModify: null,
  orderSubmitting: false,

  setAuth: (user, token, account) => {
    localStorage.setItem('tradeforge_token', token);
    set({ user, token, account, isAuthModalOpen: false });
    wsClient.authenticate(token);
    get().refreshUserData();
  },

  logout: () => {
    localStorage.removeItem('tradeforge_token');
    set({ user: null, token: null, account: null, orders: [], positions: [], holdings: [], trades: [] });
  },

  addLog: (level, text) => {
    const newLog: SystemLog = {
      id: Math.random().toString(36).substring(2, 9),
      time: new Date().toLocaleTimeString(),
      level,
      text
    };
    set(state => ({ systemLogs: [newLog, ...state.systemLogs.slice(0, 80)] }));
  },

  initSession: async () => {
    try {
      // 1. Fetch Instruments
      const instruments = await ApiClient.getInstruments();
      set({ instruments });

      // 2. Fetch User or Auto-login Demo Account
      const token = get().token;
      if (token) {
        try {
          const authData = await ApiClient.getMe();
          set({ user: authData.user, account: authData.account });
          await get().refreshUserData();
        } catch (e) {
          console.warn('Token expired or invalid, auto-logging into demo account');
          try {
            const demoAuth = await ApiClient.login('trader@tradeforge.io', 'password123');
            get().setAuth(demoAuth.user, demoAuth.token, demoAuth.account);
          } catch (loginErr) {
            get().logout();
          }
        }
      } else {
        // Auto-login to Demo Account out-of-the-box
        try {
          const demoAuth = await ApiClient.login('trader@tradeforge.io', 'password123');
          get().setAuth(demoAuth.user, demoAuth.token, demoAuth.account);
        } catch (loginErr) {
          console.warn('Could not auto-login demo account', loginErr);
        }
      }

      // 3. Connect WebSocket
      wsClient.connect(token || undefined);
      wsClient.onStatusChange(status => set({ wsStatus: status }));

      // Listen for Market Ticks
      wsClient.on('TICK', (data: Tick | Tick[]) => {
        const tickList = Array.isArray(data) ? data : [data];
        set(state => {
          const updated = { ...state.ticks };
          for (const t of tickList) {
            const prev = updated[t.symbol];
            let flashDirection: 'up' | 'down' | undefined = undefined;
            if (prev) {
              if (t.ltp > prev.ltp) flashDirection = 'up';
              else if (t.ltp < prev.ltp) flashDirection = 'down';
            }
            updated[t.symbol] = { ...t, flashDirection };
          }
          return { ticks: updated };
        });
      });

      // Listen for User Order Events
      wsClient.on('ORDER_UPDATE', (order: Order) => {
        get().addLog('INFO', `Order ${order.id.slice(0, 8)} status updated: ${order.status}`);
        set(state => {
          const existing = state.orders.findIndex(o => o.id === order.id);
          const newOrders = [...state.orders];
          if (existing !== -1) {
            newOrders[existing] = order;
          } else {
            newOrders.unshift(order);
          }
          return { orders: newOrders };
        });
        get().refreshUserData();
      });

      wsClient.on('TRADE_TAPE', (data: any) => {
        get().addLog('EXEC', `Trade Executed: ${data.order.side} ${data.execution.quantity} ${data.execution.symbol} @ ₹${data.execution.price}`);
      });

      wsClient.on('POSITION_UPDATE', (pos: Position) => {
        set(state => {
          const idx = state.positions.findIndex(p => p.symbol === pos.symbol && p.product_type === pos.product_type);
          const newPos = [...state.positions];
          if (idx !== -1) {
            newPos[idx] = pos;
          } else {
            newPos.push(pos);
          }
          return { positions: newPos.filter(p => p.quantity !== 0) };
        });
      });

      wsClient.on('PORTFOLIO_UPDATE', (acc: Account) => {
        set({ account: acc });
      });

      // 4. Load initial candles and depth
      await get().setSelectedSymbol('NIFTY50');
      get().addLog('INFO', 'TradeForge Terminal Initialized successfully.');
    } catch (err) {
      console.error('Failed to init session', err);
    }
  },

  setSelectedSymbol: async (symbol: string) => {
    const inst = get().instruments.find(i => i.symbol === symbol);
    const tick = get().ticks[symbol];
    const initialPrice = tick ? tick.ltp : (inst ? inst.base_price : 100);

    set({
      selectedSymbol: symbol,
      orderPrice: initialPrice,
      orderTriggerPrice: Math.round(initialPrice * 0.99 * 20) / 20,
      orderQuantity: inst ? inst.lot_size : 1
    });

    wsClient.subscribeSymbols([symbol]);
    await Promise.all([get().fetchCandles(symbol, get().timeframe), get().fetchDepth(symbol)]);
  },

  setTimeframe: async (tf: string) => {
    set({ timeframe: tf });
    await get().fetchCandles(get().selectedSymbol, tf);
  },

  setOrderSide: (side) => set({ orderSide: side }),
  setProductType: (pt) => set({ productType: pt }),
  setOrderType: (ot) => set({ orderType: ot }),
  setOrderQuantity: (qty) => set({ orderQuantity: qty }),
  setOrderPrice: (price) => set({ orderPrice: price }),
  setOrderTriggerPrice: (price) => set({ orderTriggerPrice: price }),
  setActiveBottomTab: (tab) => set({ activeBottomTab: tab }),

  setSearchOpen: (open) => set({ isSearchOpen: open }),
  setShortcutsOpen: (open) => set({ isShortcutsOpen: open }),
  setModifyOpen: (open, order) => set({ isModifyOpen: open, selectedOrderForModify: order || null }),
  setLogsOpen: (open, logs) => set({ isLogsOpen: open, selectedOrderForLogs: logs || null }),
  setAuthModalOpen: (open) => set({ isAuthModalOpen: open }),

  fetchDepth: async (symbol) => {
    const sym = symbol || get().selectedSymbol;
    try {
      const depth = await ApiClient.getMarketDepth(sym);
      set({ marketDepth: depth });
    } catch (e) {
      console.error('Failed to fetch depth', e);
    }
  },

  fetchCandles: async (symbol, tf) => {
    const sym = symbol || get().selectedSymbol;
    const timeframe = tf || get().timeframe;
    try {
      const candles = await ApiClient.getHistoricalCandles(sym, timeframe);
      set({ candles });
    } catch (e) {
      console.error('Failed to fetch candles', e);
    }
  },

  refreshUserData: async () => {
    if (!get().token) return;
    try {
      const [orders, positions, holdings, account, watchlists] = await Promise.all([
        ApiClient.getOrders(),
        ApiClient.getPositions(),
        ApiClient.getHoldings(),
        ApiClient.getAccount(),
        ApiClient.getWatchlists()
      ]);
      set({
        orders,
        positions,
        holdings,
        account,
        watchlists,
        activeWatchlistId: watchlists.length > 0 ? watchlists[0].id : null
      });
    } catch (e) {
      console.error('Failed to refresh user data', e);
    }
  },

  submitOrder: async () => {
    let token = get().token;
    if (!token || !get().user || !get().account) {
      try {
        const demoAuth = await ApiClient.login('trader@tradeforge.io', 'password123');
        get().setAuth(demoAuth.user, demoAuth.token, demoAuth.account);
        token = demoAuth.token;
      } catch (err) {
        set({ isAuthModalOpen: true });
        return;
      }
    }

    set({ orderSubmitting: true });
    const { selectedSymbol, orderSide, orderType, productType, orderQuantity, orderPrice, orderTriggerPrice } = get();

    try {
      const payload = {
        symbol: selectedSymbol,
        side: orderSide,
        order_type: orderType,
        product_type: productType,
        quantity: orderQuantity,
        price: orderType === 'LIMIT' || orderType === 'STOP_LOSS_LIMIT' ? orderPrice : undefined,
        trigger_price: orderType === 'STOP_LOSS' || orderType === 'STOP_LOSS_LIMIT' ? orderTriggerPrice : undefined,
        client_order_id: `cl-${Date.now()}`
      };

      const res = await ApiClient.submitOrder(payload);
      set(state => {
        const existing = state.orders.findIndex(o => o.id === res.order.id);
        const newOrders = [...state.orders];
        if (existing !== -1) {
          newOrders[existing] = res.order;
        } else {
          newOrders.unshift(res.order);
        }
        return { orders: newOrders };
      });
      get().addLog('INFO', `Order placed successfully: ${res.order.side} ${res.order.quantity} ${res.order.symbol} (${res.order.status})`);
      await get().refreshUserData();
    } catch (err: any) {
      get().addLog('RISK', `Order Rejected: ${err.message}`);
      alert(`Order Failed: ${err.message}`);
    } finally {
      set({ orderSubmitting: false });
    }
  },

  cancelOrder: async (orderId: string) => {
    try {
      await ApiClient.cancelOrder(orderId);
      get().addLog('INFO', `Cancelled order ${orderId.slice(0, 8)}`);
      await get().refreshUserData();
    } catch (e: any) {
      alert(`Cancel failed: ${e.message}`);
    }
  },

  modifyOrder: async (orderId: string, price: number, qty: number) => {
    try {
      await ApiClient.modifyOrder(orderId, price, qty);
      get().addLog('INFO', `Modified order ${orderId.slice(0, 8)} (Qty: ${qty}, Price: ₹${price})`);
      set({ isModifyOpen: false, selectedOrderForModify: null });
      await get().refreshUserData();
    } catch (e: any) {
      alert(`Modify failed: ${e.message}`);
    }
  },

  squareOffPosition: async (symbol: string, productType: ProductType) => {
    try {
      await ApiClient.squareOffPosition(symbol, productType);
      get().addLog('EXEC', `Squared off position for ${symbol} (${productType})`);
      await get().refreshUserData();
    } catch (e: any) {
      alert(`Square off failed: ${e.message}`);
    }
  },

  resetBalance: async () => {
    try {
      await ApiClient.resetAccountBalance();
      get().addLog('INFO', 'Reset virtual paper capital to ₹10,00,000');
      await get().refreshUserData();
    } catch (e: any) {
      alert(`Reset balance failed: ${e.message}`);
    }
  },

  toggleWatchlistSymbol: async (symbol: string) => {
    const { watchlists, activeWatchlistId } = get();
    if (!activeWatchlistId) return;
    const wl = watchlists.find(w => w.id === activeWatchlistId);
    if (!wl) return;

    let newSymbols: string[];
    if (wl.symbols.includes(symbol)) {
      newSymbols = wl.symbols.filter(s => s !== symbol);
    } else {
      newSymbols = [...wl.symbols, symbol];
    }

    try {
      const updated = await ApiClient.updateWatchlist(wl.id, newSymbols);
      set(state => ({
        watchlists: state.watchlists.map(w => w.id === updated.id ? updated : w)
      }));
    } catch (e) {
      console.error('Failed to toggle watchlist symbol', e);
    }
  }
}));
