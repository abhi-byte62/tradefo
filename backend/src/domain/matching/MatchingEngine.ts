import { Order, Execution, OrderSide, OrderType, DepthLevel, MarketDepth } from '../../types/index.js';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

export interface MatchResult {
  order: Order;
  executions: Execution[];
  restingOrderCreated: boolean;
  fullyFilled: boolean;
}

export interface BookOrder {
  id: string;
  userId: string;
  symbol: string;
  side: OrderSide;
  orderType: OrderType;
  price: number;
  quantity: number;
  filledQuantity: number;
  remainingQuantity: number;
  timestamp: number;
  rawOrder: Order;
}

export class OrderBook {
  public symbol: string;
  // Bids sorted DESCENDING by price (highest first)
  public bids: Map<number, BookOrder[]> = new Map();
  // Asks sorted ASCENDING by price (lowest first)
  public asks: Map<number, BookOrder[]> = new Map();
  // Quick lookup orderId -> { side, price, order }
  public orderMap: Map<string, { side: OrderSide; price: number; order: BookOrder }> = new Map();

  constructor(symbol: string) {
    this.symbol = symbol;
  }

  public getSortedBidPrices(): number[] {
    return Array.from(this.bids.keys()).sort((a, b) => b - a);
  }

  public getSortedAskPrices(): number[] {
    return Array.from(this.asks.keys()).sort((a, b) => a - b);
  }

  public addRestingOrder(order: BookOrder) {
    const book = order.side === 'BUY' ? this.bids : this.asks;
    if (!book.has(order.price)) {
      book.set(order.price, []);
    }
    book.get(order.price)!.push(order);
    this.orderMap.set(order.id, { side: order.side, price: order.price, order });
  }

  public removeOrder(orderId: string): BookOrder | null {
    const entry = this.orderMap.get(orderId);
    if (!entry) return null;

    const book = entry.side === 'BUY' ? this.bids : this.asks;
    const queue = book.get(entry.price);
    if (queue) {
      const idx = queue.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        const removed = queue.splice(idx, 1)[0];
        if (queue.length === 0) {
          book.delete(entry.price);
        }
        this.orderMap.delete(orderId);
        return removed;
      }
    }
    this.orderMap.delete(orderId);
    return null;
  }

  public getDepth(levels: number = 5): { bids: DepthLevel[]; asks: DepthLevel[]; totalBidQty: number; totalAskQty: number } {
    const sortedBids = this.getSortedBidPrices();
    const sortedAsks = this.getSortedAskPrices();

    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];
    let totalBidQty = 0;
    let totalAskQty = 0;

    for (let i = 0; i < Math.min(levels, sortedBids.length); i++) {
      const price = sortedBids[i];
      const orders = this.bids.get(price) || [];
      const qty = orders.reduce((sum, o) => sum + o.remainingQuantity, 0);
      bids.push({ price, quantity: qty, orders: orders.length });
      totalBidQty += qty;
    }

    for (let i = 0; i < Math.min(levels, sortedAsks.length); i++) {
      const price = sortedAsks[i];
      const orders = this.asks.get(price) || [];
      const qty = orders.reduce((sum, o) => sum + o.remainingQuantity, 0);
      asks.push({ price, quantity: qty, orders: orders.length });
      totalAskQty += qty;
    }

    return { bids, asks, totalBidQty, totalAskQty };
  }
}

export class MatchingEngine extends EventEmitter {
  private orderBooks: Map<string, OrderBook> = new Map();
  // Trigger order queue (Stop Loss / SL-Limit)
  private triggerOrders: Map<string, Order[]> = new Map(); // symbol -> Orders

  constructor() {
    super();
  }

  public getOrderBook(symbol: string): OrderBook {
    let book = this.orderBooks.get(symbol);
    if (!book) {
      book = new OrderBook(symbol);
      this.orderBooks.set(symbol, book);
    }
    return book;
  }

  /**
   * Process a live market tick to evaluate any pending Stop Loss trigger conditions
   */
  public processTick(symbol: string, currentPrice: number): Order[] {
    const triggered: Order[] = [];
    const pending = this.triggerOrders.get(symbol);
    if (!pending || pending.length === 0) return triggered;

    const remaining: Order[] = [];

    for (const order of pending) {
      let isTriggered = false;
      const triggerPrice = order.trigger_price || 0;

      if (order.side === 'BUY') {
        // Buy SL triggers when price rises to or above trigger price
        if (currentPrice >= triggerPrice) isTriggered = true;
      } else {
        // Sell SL triggers when price falls to or below trigger price
        if (currentPrice <= triggerPrice) isTriggered = true;
      }

      if (isTriggered) {
        triggered.push(order);
      } else {
        remaining.push(order);
      }
    }

    this.triggerOrders.set(symbol, remaining);
    return triggered;
  }

  /**
   * Register a Stop Loss order for conditional trigger
   */
  public registerTriggerOrder(order: Order) {
    if (!this.triggerOrders.has(order.symbol)) {
      this.triggerOrders.set(order.symbol, []);
    }
    this.triggerOrders.get(order.symbol)!.push(order);
  }

  /**
   * Primary Matching Function with Price-Time Priority
   */
  public matchOrder(order: Order, simulatedMarketPrice?: number): MatchResult {
    const book = this.getOrderBook(order.symbol);
    const executions: Execution[] = [];
    let remainingQty = order.remaining_quantity;
    let totalFilledQty = order.filled_quantity;
    let weightedPriceSum = (order.average_price || 0) * totalFilledQty;

    const isBuy = order.side === 'BUY';
    const isMarket = order.order_type === 'MARKET';
    const limitPrice = order.price ?? 0;

    // Opposite book
    const oppositePrices = isBuy ? book.getSortedAskPrices() : book.getSortedBidPrices();
    const oppositeBook = isBuy ? book.asks : book.bids;

    for (const price of oppositePrices) {
      if (remainingQty <= 0) break;

      // Price limit check
      if (!isMarket) {
        if (isBuy && price > limitPrice) break; // Cannot buy above limit
        if (!isBuy && price < limitPrice) break; // Cannot sell below limit
      }

      const orderQueue = oppositeBook.get(price);
      if (!orderQueue || orderQueue.length === 0) continue;

      let queueIdx = 0;
      while (queueIdx < orderQueue.length && remainingQty > 0) {
        const resting = orderQueue[queueIdx];
        const matchQty = Math.min(remainingQty, resting.remainingQuantity);
        const matchPrice = resting.price; // Maker price is execution price

        // Create execution record
        const execution: Execution = {
          id: uuidv4(),
          order_id: order.id,
          user_id: order.user_id,
          symbol: order.symbol,
          side: order.side,
          price: matchPrice,
          quantity: matchQty,
          timestamp: new Date().toISOString(),
          maker_order_id: resting.id,
          taker_order_id: order.id
        };

        executions.push(execution);

        // Update resting order
        resting.remainingQuantity -= matchQty;
        resting.filledQuantity += matchQty;
        resting.rawOrder.filled_quantity += matchQty;
        resting.rawOrder.remaining_quantity -= matchQty;
        resting.rawOrder.updated_at = new Date().toISOString();

        if (resting.remainingQuantity === 0) {
          resting.rawOrder.status = 'FILLED';
          orderQueue.splice(queueIdx, 1);
          book.orderMap.delete(resting.id);
        } else {
          resting.rawOrder.status = 'PARTIALLY_FILLED';
          queueIdx++;
        }

        // Notify resting maker execution
        this.emit('makerFill', {
          order: resting.rawOrder,
          execution: {
            ...execution,
            id: uuidv4(),
            order_id: resting.id,
            user_id: resting.userId,
            side: resting.side
          }
        });

        // Update incoming taker order
        remainingQty -= matchQty;
        totalFilledQty += matchQty;
        weightedPriceSum += matchPrice * matchQty;
      }

      if (orderQueue.length === 0) {
        oppositeBook.delete(price);
      }
    }

    // In a simulated paper trading market with synthetic liquidity:
    // 1. If MARKET order -> immediate fill against simulated market price
    // 2. If LIMIT order and market price satisfies limit condition -> fill against simulated market price
    const isMarketableLimit = !isMarket && (
      (isBuy && limitPrice >= (simulatedMarketPrice || 0)) ||
      (!isBuy && limitPrice <= (simulatedMarketPrice || Infinity))
    );

    if (remainingQty > 0 && simulatedMarketPrice && (isMarket || isMarketableLimit)) {
      const matchQty = remainingQty;
      const matchPrice = isMarket ? simulatedMarketPrice : (isBuy ? Math.min(limitPrice, simulatedMarketPrice) : Math.max(limitPrice, simulatedMarketPrice));

      const execution: Execution = {
        id: uuidv4(),
        order_id: order.id,
        user_id: order.user_id,
        symbol: order.symbol,
        side: order.side,
        price: matchPrice,
        quantity: matchQty,
        timestamp: new Date().toISOString(),
        taker_order_id: order.id
      };

      executions.push(execution);

      remainingQty = 0;
      totalFilledQty += matchQty;
      weightedPriceSum += matchPrice * matchQty;
    }

    // Update incoming order status
    order.filled_quantity = totalFilledQty;
    order.remaining_quantity = remainingQty;
    order.average_price = totalFilledQty > 0 ? Number((weightedPriceSum / totalFilledQty).toFixed(2)) : undefined;
    order.updated_at = new Date().toISOString();
    order.version += 1;

    let restingOrderCreated = false;
    const fullyFilled = remainingQty === 0;

    if (fullyFilled) {
      order.status = 'FILLED';
    } else if (totalFilledQty > 0) {
      order.status = 'PARTIALLY_FILLED';
      if (!isMarket) {
        // Rest remainder in book
        const bookOrder: BookOrder = {
          id: order.id,
          userId: order.user_id,
          symbol: order.symbol,
          side: order.side,
          orderType: order.order_type,
          price: limitPrice,
          quantity: order.quantity,
          filledQuantity: totalFilledQty,
          remainingQuantity: remainingQty,
          timestamp: Date.now(),
          rawOrder: order
        };
        book.addRestingOrder(bookOrder);
        restingOrderCreated = true;
      }
    } else {
      order.status = 'OPEN';
      if (!isMarket) {
        const bookOrder: BookOrder = {
          id: order.id,
          userId: order.user_id,
          symbol: order.symbol,
          side: order.side,
          orderType: order.order_type,
          price: limitPrice,
          quantity: order.quantity,
          filledQuantity: 0,
          remainingQuantity: remainingQty,
          timestamp: Date.now(),
          rawOrder: order
        };
        book.addRestingOrder(bookOrder);
        restingOrderCreated = true;
      }
    }

    return {
      order,
      executions,
      restingOrderCreated,
      fullyFilled
    };
  }

  /**
   * Cancel an open order in book
   */
  public cancelOrder(symbol: string, orderId: string): { success: boolean; order?: Order; message?: string } {
    const book = this.getOrderBook(symbol);
    const removed = book.removeOrder(orderId);

    if (removed) {
      removed.rawOrder.status = 'CANCELLED';
      removed.rawOrder.updated_at = new Date().toISOString();
      removed.rawOrder.version += 1;
      return { success: true, order: removed.rawOrder };
    }

    // Check trigger list
    const triggers = this.triggerOrders.get(symbol);
    if (triggers) {
      const idx = triggers.findIndex(o => o.id === orderId);
      if (idx !== -1) {
        const order = triggers.splice(idx, 1)[0];
        order.status = 'CANCELLED';
        order.updated_at = new Date().toISOString();
        order.version += 1;
        return { success: true, order };
      }
    }

    return { success: false, message: 'Order not found or already filled/cancelled' };
  }

  /**
   * Modify price or quantity of a resting order
   */
  public modifyOrder(symbol: string, orderId: string, newPrice: number, newQty: number): { success: boolean; order?: Order; message?: string } {
    const book = this.getOrderBook(symbol);
    const entry = book.orderMap.get(orderId);

    if (!entry) {
      return { success: false, message: 'Resting order not found in orderbook' };
    }

    if (newQty <= entry.order.filledQuantity) {
      return { success: false, message: 'New quantity must be greater than already filled quantity' };
    }

    // Remove from current price slot
    book.removeOrder(orderId);

    // Update fields & reset time priority
    entry.order.price = newPrice;
    entry.order.quantity = newQty;
    entry.order.remainingQuantity = newQty - entry.order.filledQuantity;
    entry.order.timestamp = Date.now();
    entry.order.rawOrder.price = newPrice;
    entry.order.rawOrder.quantity = newQty;
    entry.order.rawOrder.remaining_quantity = entry.order.remainingQuantity;
    entry.order.rawOrder.updated_at = new Date().toISOString();
    entry.order.rawOrder.version += 1;

    // Add to new price slot
    book.addRestingOrder(entry.order);

    return { success: true, order: entry.order.rawOrder };
  }

  /**
   * Evaluate resting limit orders against incoming live market tick
   */
  public matchRestingOrdersOnTick(symbol: string, currentPrice: number): { orders: Order[]; executions: Execution[] } {
    const book = this.getOrderBook(symbol);
    const filledOrders: Order[] = [];
    const executions: Execution[] = [];

    // 1. Check Resting Bids: Execute if resting bid price >= current market price
    const sortedBids = book.getSortedBidPrices();
    for (const bidPrice of sortedBids) {
      if (bidPrice < currentPrice) break; // Lower bids not yet reached

      const queue = book.bids.get(bidPrice);
      if (!queue) continue;

      while (queue.length > 0) {
        const resting = queue.shift()!;
        book.orderMap.delete(resting.id);

        const execution: Execution = {
          id: uuidv4(),
          order_id: resting.id,
          user_id: resting.userId,
          symbol: resting.symbol,
          side: resting.side,
          price: resting.price,
          quantity: resting.remainingQuantity,
          timestamp: new Date().toISOString()
        };

        executions.push(execution);

        resting.filledQuantity += resting.remainingQuantity;
        resting.remainingQuantity = 0;
        resting.rawOrder.filled_quantity = resting.quantity;
        resting.rawOrder.remaining_quantity = 0;
        resting.rawOrder.average_price = resting.price;
        resting.rawOrder.status = 'FILLED';
        resting.rawOrder.updated_at = new Date().toISOString();
        resting.rawOrder.version += 1;

        filledOrders.push(resting.rawOrder);
      }
      book.bids.delete(bidPrice);
    }

    // 2. Check Resting Asks: Execute if resting ask price <= current market price
    const sortedAsks = book.getSortedAskPrices();
    for (const askPrice of sortedAsks) {
      if (askPrice > currentPrice) break; // Higher asks not yet reached

      const queue = book.asks.get(askPrice);
      if (!queue) continue;

      while (queue.length > 0) {
        const resting = queue.shift()!;
        book.orderMap.delete(resting.id);

        const execution: Execution = {
          id: uuidv4(),
          order_id: resting.id,
          user_id: resting.userId,
          symbol: resting.symbol,
          side: resting.side,
          price: resting.price,
          quantity: resting.remainingQuantity,
          timestamp: new Date().toISOString()
        };

        executions.push(execution);

        resting.filledQuantity += resting.remainingQuantity;
        resting.remainingQuantity = 0;
        resting.rawOrder.filled_quantity = resting.quantity;
        resting.rawOrder.remaining_quantity = 0;
        resting.rawOrder.average_price = resting.price;
        resting.rawOrder.status = 'FILLED';
        resting.rawOrder.updated_at = new Date().toISOString();
        resting.rawOrder.version += 1;

        filledOrders.push(resting.rawOrder);
      }
      book.asks.delete(askPrice);
    }

    return { orders: filledOrders, executions };
  }

  public getDepthSnapshot(symbol: string): MarketDepth {
    const book = this.getOrderBook(symbol);
    const depth = book.getDepth(5);
    return {
      symbol,
      bids: depth.bids,
      asks: depth.asks,
      timestamp: Date.now(),
      total_bid_qty: depth.totalBidQty,
      total_ask_qty: depth.totalAskQty
    };
  }
}
