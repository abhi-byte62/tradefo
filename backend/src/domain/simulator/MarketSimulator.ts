import { Instrument, Tick, Candle, MarketDepth, DepthLevel } from '../../types/index.js';
import { EventEmitter } from 'events';

export interface SimulatorConfig {
  symbol: string;
  initialPrice: number;
  volatility: number; // e.g. 0.015 for 1.5% daily vol
  drift: number; // e.g. 0.0001
  meanReversionSpeed: number; // e.g. 0.05
  meanTarget: number;
  spreadBps: number; // basis points, e.g. 5 bps = 0.05%
  tickSize: number;
  lotSize: number;
  seed?: number;
}

export class MarketSimulator extends EventEmitter {
  private instruments: Map<string, Instrument> = new Map();
  private configs: Map<string, SimulatorConfig> = new Map();
  private currentPrices: Map<string, number> = new Map();
  private currentTicks: Map<string, Tick> = new Map();
  private historicalCandles: Map<string, Map<string, Candle[]>> = new Map(); // symbol -> timeframe -> candles
  private current1mCandles: Map<string, Candle> = new Map();
  private intervalTimer: NodeJS.Timeout | null = null;
  private prngSeed: number = 42;

  constructor() {
    super();
    this.initDefaultInstruments();
  }

  // Pseudo-random number generator for deterministic simulations if seed provided
  private random(seedOverride?: number): number {
    if (seedOverride !== undefined) {
      this.prngSeed = seedOverride;
    }
    // Mulberry32 algorithm
    let t = (this.prngSeed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Box-Muller transform for standard normal distribution N(0, 1)
  private gaussianRandom(): number {
    let u = 0;
    let v = 0;
    while (u === 0) u = this.random();
    while (v === 0) v = this.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  public setDeterministicSeed(seed: number) {
    this.prngSeed = seed;
  }

  private initDefaultInstruments() {
    const defaultConfigs: (Instrument & SimulatorConfig)[] = [
      {
        symbol: 'NIFTY50',
        name: 'NIFTY 50 Index',
        exchange: 'NSE',
        instrument_type: 'INDEX',
        tick_size: 0.05,
        lot_size: 25,
        base_price: 25800.0,
        lower_circuit: 23220.0,
        upper_circuit: 28380.0,
        segment: 'INDICES',
        initialPrice: 25800.0,
        volatility: 0.008,
        drift: 0.00005,
        meanReversionSpeed: 0.02,
        meanTarget: 25850.0,
        spreadBps: 2.5,
        tickSize: 0.05,
        lotSize: 25
      },
      {
        symbol: 'BANKNIFTY',
        name: 'NIFTY Bank Index',
        exchange: 'NSE',
        instrument_type: 'INDEX',
        tick_size: 0.05,
        lot_size: 15,
        base_price: 53600.0,
        lower_circuit: 48240.0,
        upper_circuit: 58960.0,
        segment: 'INDICES',
        initialPrice: 53600.0,
        volatility: 0.012,
        drift: 0.00008,
        meanReversionSpeed: 0.03,
        meanTarget: 53750.0,
        spreadBps: 3.0,
        tickSize: 0.05,
        lotSize: 15
      },
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries Ltd.',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 2980.5,
        lower_circuit: 2682.45,
        upper_circuit: 3278.55,
        segment: 'ENERGY',
        initialPrice: 2980.5,
        volatility: 0.014,
        drift: 0.00004,
        meanReversionSpeed: 0.04,
        meanTarget: 2995.0,
        spreadBps: 3.5,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'TCS',
        name: 'Tata Consultancy Services',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 4250.0,
        lower_circuit: 3825.0,
        upper_circuit: 4675.0,
        segment: 'IT',
        initialPrice: 4250.0,
        volatility: 0.011,
        drift: 0.00003,
        meanReversionSpeed: 0.02,
        meanTarget: 4265.0,
        spreadBps: 3.0,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'HDFCBANK',
        name: 'HDFC Bank Ltd.',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 1680.0,
        lower_circuit: 1512.0,
        upper_circuit: 1848.0,
        segment: 'BANKING',
        initialPrice: 1680.0,
        volatility: 0.013,
        drift: 0.00005,
        meanReversionSpeed: 0.03,
        meanTarget: 1690.0,
        spreadBps: 3.0,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'INFY',
        name: 'Infosys Ltd.',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 1910.0,
        lower_circuit: 1719.0,
        upper_circuit: 2101.0,
        segment: 'IT',
        initialPrice: 1910.0,
        volatility: 0.016,
        drift: 0.00006,
        meanReversionSpeed: 0.03,
        meanTarget: 1925.0,
        spreadBps: 4.0,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'TATAMOTORS',
        name: 'Tata Motors Ltd.',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 975.0,
        lower_circuit: 877.5,
        upper_circuit: 1072.5,
        segment: 'AUTO',
        initialPrice: 975.0,
        volatility: 0.022,
        drift: 0.0001,
        meanReversionSpeed: 0.04,
        meanTarget: 982.0,
        spreadBps: 4.5,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'ICICIBANK',
        name: 'ICICI Bank Ltd.',
        exchange: 'NSE',
        instrument_type: 'EQUITY',
        tick_size: 0.05,
        lot_size: 1,
        base_price: 1265.0,
        lower_circuit: 1138.5,
        upper_circuit: 1391.5,
        segment: 'BANKING',
        initialPrice: 1265.0,
        volatility: 0.015,
        drift: 0.00004,
        meanReversionSpeed: 0.03,
        meanTarget: 1272.0,
        spreadBps: 3.5,
        tickSize: 0.05,
        lotSize: 1
      },
      {
        symbol: 'NVDA',
        name: 'NVIDIA Corporation',
        exchange: 'CRYPTO',
        instrument_type: 'EQUITY',
        tick_size: 0.01,
        lot_size: 1,
        base_price: 124.5,
        lower_circuit: 99.6,
        upper_circuit: 149.4,
        segment: 'TECH',
        initialPrice: 124.5,
        volatility: 0.028,
        drift: 0.00015,
        meanReversionSpeed: 0.02,
        meanTarget: 128.0,
        spreadBps: 4.0,
        tickSize: 0.01,
        lotSize: 1
      },
      {
        symbol: 'BTCUSD',
        name: 'Bitcoin / USD Spot',
        exchange: 'CRYPTO',
        instrument_type: 'CRYPTO',
        tick_size: 0.5,
        lot_size: 1,
        base_price: 64200.0,
        lower_circuit: 51360.0,
        upper_circuit: 77040.0,
        segment: 'CRYPTO',
        initialPrice: 64200.0,
        volatility: 0.035,
        drift: 0.0001,
        meanReversionSpeed: 0.01,
        meanTarget: 64800.0,
        spreadBps: 3.0,
        tickSize: 0.5,
        lotSize: 1
      }
    ];

    for (const item of defaultConfigs) {
      const { initialPrice, volatility, drift, meanReversionSpeed, meanTarget, spreadBps, tickSize, lotSize, ...inst } = item;
      this.instruments.set(inst.symbol, inst);
      this.configs.set(inst.symbol, {
        symbol: inst.symbol,
        initialPrice,
        volatility,
        drift,
        meanReversionSpeed,
        meanTarget,
        spreadBps,
        tickSize,
        lotSize
      });
      this.currentPrices.set(inst.symbol, initialPrice);
      this.generateInitialCandles(inst.symbol, initialPrice);
      this.currentTicks.set(inst.symbol, this.generateTickForSymbol(inst.symbol));
    }
  }

  // Pre-generate historical candles so TradingView chart loads beautiful history
  private generateInitialCandles(symbol: string, currentPrice: number) {
    const config = this.configs.get(symbol)!;
    const now = Math.floor(Date.now() / 1000);
    const minute = 60;
    const totalBars = 300;

    const candles1m: Candle[] = [];
    let price = config.initialPrice * 0.985; // start slight discount

    for (let i = totalBars; i >= 0; i--) {
      const time = now - i * minute;
      const z = this.gaussianRandom();
      const dt = 1 / (6.5 * 60); // 1 minute in trading day
      const meanRev = config.meanReversionSpeed * (config.meanTarget - price) * dt;
      const diffusion = price * config.volatility * Math.sqrt(dt) * z;
      const closePrice = this.roundToTick(price + meanRev + diffusion, config.tickSize);

      const highSpread = Math.abs(this.gaussianRandom()) * config.tickSize * 8;
      const lowSpread = Math.abs(this.gaussianRandom()) * config.tickSize * 8;

      const open = price;
      const close = closePrice;
      const high = this.roundToTick(Math.max(open, close) + highSpread, config.tickSize);
      const low = this.roundToTick(Math.min(open, close) - lowSpread, config.tickSize);
      const volume = Math.floor(Math.abs(this.gaussianRandom() * 800) + 100) * config.lotSize;

      candles1m.push({
        time,
        open,
        high,
        low,
        close,
        volume
      });

      price = close;
    }

    if (!this.historicalCandles.has(symbol)) {
      this.historicalCandles.set(symbol, new Map());
    }
    this.historicalCandles.get(symbol)!.set('1m', candles1m);

    // Initial current 1m candle
    const lastCandle = candles1m[candles1m.length - 1];
    this.current1mCandles.set(symbol, { ...lastCandle });
    this.currentPrices.set(symbol, lastCandle.close);
  }

  public getInstruments(): Instrument[] {
    return Array.from(this.instruments.values());
  }

  public getInstrument(symbol: string): Instrument | undefined {
    return this.instruments.get(symbol);
  }

  public getHistoricalCandles(symbol: string, timeframe: string = '1m'): Candle[] {
    const symbolCandles = this.historicalCandles.get(symbol);
    if (!symbolCandles) return [];
    return symbolCandles.get(timeframe) || [];
  }

  public getCurrentTick(symbol: string): Tick | undefined {
    return this.currentTicks.get(symbol);
  }

  public getAllTicks(): Tick[] {
    return Array.from(this.currentTicks.values());
  }

  public getMarketDepth(symbol: string): MarketDepth {
    const tick = this.currentTicks.get(symbol);
    const config = this.configs.get(symbol);
    if (!tick || !config) {
      return { symbol, bids: [], asks: [], timestamp: Date.now(), total_bid_qty: 0, total_ask_qty: 0 };
    }

    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];
    let totalBidQty = 0;
    let totalAskQty = 0;

    const baseSpread = config.tickSize;

    for (let i = 0; i < 5; i++) {
      const bidPrice = this.roundToTick(tick.bid - i * baseSpread, config.tickSize);
      const askPrice = this.roundToTick(tick.ask + i * baseSpread, config.tickSize);

      // Quantities with realistic depth clustering (more quantity at key levels)
      const bidQty = Math.floor((120 + i * 85 + Math.abs(this.gaussianRandom() * 60)) * config.lotSize);
      const askQty = Math.floor((110 + i * 90 + Math.abs(this.gaussianRandom() * 60)) * config.lotSize);
      const orders = Math.floor(2 + i * 2 + Math.abs(this.gaussianRandom() * 3));

      bids.push({ price: bidPrice, quantity: bidQty, orders });
      asks.push({ price: askPrice, quantity: askQty, orders });

      totalBidQty += bidQty;
      totalAskQty += askQty;
    }

    return {
      symbol,
      bids,
      asks,
      timestamp: Date.now(),
      total_bid_qty: totalBidQty,
      total_ask_qty: totalAskQty
    };
  }

  // Stochastic step computation
  public step(symbol?: string): Tick[] {
    const symbolsToUpdate = symbol ? [symbol] : Array.from(this.instruments.keys());
    const updatedTicks: Tick[] = [];

    const now = Math.floor(Date.now() / 1000);

    for (const sym of symbolsToUpdate) {
      const config = this.configs.get(sym);
      const inst = this.instruments.get(sym);
      if (!config || !inst) continue;

      const currentPrice = this.currentPrices.get(sym) || config.initialPrice;
      const z = this.gaussianRandom();

      // Ornstein-Uhlenbeck drift + GBM volatility
      const dt = 1 / 3000; // time step
      const driftTerm = config.meanReversionSpeed * (config.meanTarget - currentPrice) * dt;
      const volTerm = currentPrice * config.volatility * Math.sqrt(dt) * z;

      // Rare jump diffusion (0.5% probability)
      let jump = 0;
      if (this.random() < 0.005) {
        jump = (this.random() - 0.5) * config.tickSize * 20;
      }

      let newPrice = currentPrice + driftTerm + volTerm + jump;

      // Circuit limit bounds
      if (newPrice < inst.lower_circuit) newPrice = inst.lower_circuit;
      if (newPrice > inst.upper_circuit) newPrice = inst.upper_circuit;

      newPrice = this.roundToTick(newPrice, config.tickSize);
      this.currentPrices.set(sym, newPrice);

      // Generate tick
      const tick = this.generateTickForSymbol(sym, newPrice);
      this.currentTicks.set(sym, tick);
      updatedTicks.push(tick);

      // Update 1m candle
      this.updateCandleStream(sym, newPrice, now);
    }

    this.emit('ticks', updatedTicks);
    return updatedTicks;
  }

  private updateCandleStream(symbol: string, price: number, nowSeconds: number) {
    const candle1m = this.current1mCandles.get(symbol);
    const minuteWindow = Math.floor(nowSeconds / 60) * 60;

    if (!candle1m || candle1m.time < minuteWindow) {
      // Create new 1m candle
      const newCandle: Candle = {
        time: minuteWindow,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: Math.floor(Math.abs(this.gaussianRandom() * 50) + 10)
      };
      this.current1mCandles.set(symbol, newCandle);

      const candles = this.historicalCandles.get(symbol)?.get('1m');
      if (candles) {
        candles.push(newCandle);
        if (candles.length > 500) candles.shift();
      }
      this.emit('candle', { symbol, candle: newCandle, isNew: true });
    } else {
      // Update running candle
      candle1m.high = Math.max(candle1m.high, price);
      candle1m.low = Math.min(candle1m.low, price);
      candle1m.close = price;
      candle1m.volume += Math.floor(Math.abs(this.gaussianRandom() * 15) + 2);
      this.emit('candle', { symbol, candle: candle1m, isNew: false });
    }
  }

  private generateTickForSymbol(symbol: string, priceOverride?: number): Tick {
    const config = this.configs.get(symbol)!;
    const inst = this.instruments.get(symbol)!;
    const ltp = priceOverride ?? this.currentPrices.get(symbol) ?? config.initialPrice;

    const halfSpread = (ltp * (config.spreadBps / 10000)) / 2;
    const bid = this.roundToTick(ltp - Math.max(config.tickSize, halfSpread), config.tickSize);
    const ask = this.roundToTick(ltp + Math.max(config.tickSize, halfSpread), config.tickSize);

    const change = this.roundToTick(ltp - inst.base_price, config.tickSize);
    const changePercent = Number(((change / inst.base_price) * 100).toFixed(2));

    const candles = this.historicalCandles.get(symbol)?.get('1m') || [];
    const open = candles.length > 0 ? candles[0].open : inst.base_price;
    const high = candles.length > 0 ? Math.max(...candles.map(c => c.high), ltp) : ltp;
    const low = candles.length > 0 ? Math.min(...candles.map(c => c.low), ltp) : ltp;
    const volume = candles.reduce((sum, c) => sum + c.volume, 0);

    return {
      symbol,
      ltp,
      open,
      high,
      low,
      close: inst.base_price,
      volume,
      change,
      change_percent: changePercent,
      bid,
      ask,
      bid_qty: Math.floor((80 + Math.abs(this.gaussianRandom() * 40)) * config.lotSize),
      ask_qty: Math.floor((85 + Math.abs(this.gaussianRandom() * 40)) * config.lotSize),
      timestamp: Date.now()
    };
  }

  private roundToTick(val: number, tickSize: number): number {
    return Math.round(val / tickSize) * tickSize;
  }

  public start(intervalMs: number = 300) {
    if (this.intervalTimer) return;
    this.intervalTimer = setInterval(() => {
      this.step();
    }, intervalMs);
  }

  public stop() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
  }
}
