import { Order, Execution, Position, Holding, Account, Instrument, RejectReason } from '../types/index.js';
import { Database } from '../infrastructure/database/Database.js';
import { HotCache } from '../infrastructure/cache/HotCache.js';
import { EventBus } from '../infrastructure/events/EventBus.js';
import { MatchingEngine } from './matching/MatchingEngine.js';
import { RiskEngine } from './risk/RiskEngine.js';
import { PortfolioEngine } from './portfolio/PortfolioEngine.js';
import { MarketSimulator } from './simulator/MarketSimulator.js';
import { v4 as uuidv4 } from 'uuid';

export class OrderService {
  constructor(
    private db: Database,
    private cache: HotCache,
    private eventBus: EventBus,
    private matchingEngine: MatchingEngine,
    private riskEngine: RiskEngine,
    private portfolioEngine: PortfolioEngine,
    private simulator: MarketSimulator
  ) {
    // Listen to maker fill events from matching engine (when passive resting orders match)
    this.matchingEngine.on('makerFill', async ({ order, execution }) => {
      await this.handleMakerFill(order, execution);
    });

    // Listen to live market ticks to trigger SL orders and fill resting Limit orders
    this.simulator.on('ticks', async (ticks: any[]) => {
      for (const tick of ticks) {
        // 1. Process SL Trigger Orders
        const triggeredOrders = this.matchingEngine.processTick(tick.symbol, tick.ltp);
        for (const order of triggeredOrders) {
          order.status = 'OPEN';
          this.eventBus.publish('ORDER_ACCEPTED', { order }, order.id);
          const matchRes = this.matchingEngine.matchOrder(order, tick.ltp);
          await this.db.saveOrder(matchRes.order);

          for (const exec of matchRes.executions) {
            await this.handleMakerFill(matchRes.order, exec);
          }
        }

        // 2. Process Resting Limit Orders that are reached by market price
        const restingFills = this.matchingEngine.matchRestingOrdersOnTick(tick.symbol, tick.ltp);
        for (let i = 0; i < restingFills.executions.length; i++) {
          const exec = restingFills.executions[i];
          const ord = restingFills.orders[i];
          await this.handleMakerFill(ord, exec);
        }
      }
    });
  }

  public async submitOrder(
    userId: string,
    payload: {
      symbol: string;
      side: 'BUY' | 'SELL';
      order_type: 'MARKET' | 'LIMIT' | 'STOP_LOSS' | 'STOP_LOSS_LIMIT';
      product_type: 'INTRADAY' | 'DELIVERY';
      quantity: number;
      price?: number;
      trigger_price?: number;
      client_order_id?: string;
    },
    idempotencyKey?: string
  ): Promise<{ success: boolean; order: Order; executions: Execution[]; rejectReason?: RejectReason; message?: string }> {
    // 1. Idempotency Check
    if (idempotencyKey) {
      const cached = this.cache.getIdempotency(idempotencyKey);
      if (cached) {
        return cached;
      }
    }

    // 2. Fetch instrument, account, holding, position, current price
    const instrument = this.simulator.getInstrument(payload.symbol);
    if (!instrument) {
      const rejectedOrder = this.createRejectedOrder(userId, payload, 'INSTRUMENT_NOT_FOUND');
      return { success: false, order: rejectedOrder, executions: [], rejectReason: 'INSTRUMENT_NOT_FOUND', message: 'Instrument not found' };
    }

    const account = await this.db.getAccount(userId);
    if (!account) {
      const rejectedOrder = this.createRejectedOrder(userId, payload, 'INSUFFICIENT_FUNDS');
      return { success: false, order: rejectedOrder, executions: [], rejectReason: 'INSUFFICIENT_FUNDS', message: 'Account not found' };
    }

    const currentTick = this.simulator.getCurrentTick(payload.symbol);
    const currentLtp = currentTick ? currentTick.ltp : instrument.base_price;
    const holding = await this.db.getHolding(userId, payload.symbol);
    const position = await this.db.getPosition(userId, payload.symbol, payload.product_type);

    // 3. Pre-Trade Risk Validation
    const riskCheck = this.riskEngine.validateOrder(payload, instrument, account, currentLtp, holding, position);

    if (!riskCheck.passed) {
      const orderId = uuidv4();
      const order: Order = {
        id: orderId,
        client_order_id: payload.client_order_id,
        user_id: userId,
        symbol: payload.symbol,
        side: payload.side,
        order_type: payload.order_type,
        product_type: payload.product_type,
        quantity: payload.quantity,
        filled_quantity: 0,
        remaining_quantity: payload.quantity,
        price: payload.price,
        trigger_price: payload.trigger_price,
        status: 'REJECTED',
        reject_reason: riskCheck.rejectReason,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1
      };

      await this.db.saveOrder(order);
      this.db.logOrderEvent(order.id, 'ORDER_REJECTED', { reason: riskCheck.rejectReason, message: riskCheck.message });
      this.eventBus.publish('ORDER_REJECTED', { order, message: riskCheck.message }, order.id);

      const result = {
        success: false,
        order,
        executions: [],
        rejectReason: riskCheck.rejectReason,
        message: riskCheck.message
      };

      if (idempotencyKey) {
        this.cache.setIdempotency(idempotencyKey, result);
      }
      return result;
    }

    // 4. Create Accepted Order
    const orderId = uuidv4();
    const isStopLoss = payload.order_type === 'STOP_LOSS' || payload.order_type === 'STOP_LOSS_LIMIT';

    const order: Order = {
      id: orderId,
      client_order_id: payload.client_order_id,
      user_id: userId,
      symbol: payload.symbol,
      side: payload.side,
      order_type: payload.order_type,
      product_type: payload.product_type,
      quantity: payload.quantity,
      filled_quantity: 0,
      remaining_quantity: payload.quantity,
      price: payload.price,
      trigger_price: payload.trigger_price,
      status: isStopLoss ? 'PENDING' : 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    };

    await this.db.saveOrder(order);
    this.db.logOrderEvent(order.id, 'ORDER_ACCEPTED', { requiredMargin: riskCheck.requiredMargin });
    this.eventBus.publish('ORDER_ACCEPTED', { order }, order.id);

    // If order is Stop Loss, register for trigger
    if (isStopLoss) {
      this.matchingEngine.registerTriggerOrder(order);
      const result = { success: true, order, executions: [] };
      if (idempotencyKey) this.cache.setIdempotency(idempotencyKey, result);
      return result;
    }

    // 5. Submit to Matching Engine
    const matchResult = this.matchingEngine.matchOrder(order, currentLtp);
    await this.db.saveOrder(matchResult.order);

    // 6. Process Executions & Update Portfolio
    for (const exec of matchResult.executions) {
      await this.db.saveExecution(exec);
      this.db.logOrderEvent(order.id, 'TRADE_EXECUTED', { price: exec.price, qty: exec.quantity });

      const currentPos = await this.db.getPosition(userId, exec.symbol, order.product_type);
      const currentHold = await this.db.getHolding(userId, exec.symbol);
      const currentAcc = (await this.db.getAccount(userId))!;

      const portfolioUpdate = this.portfolioEngine.processExecution(
        exec,
        matchResult.order,
        currentPos,
        currentHold,
        currentAcc
      );

      await this.db.savePosition(portfolioUpdate.position);
      if (portfolioUpdate.holding) {
        await this.db.saveHolding(portfolioUpdate.holding);
      }
      await this.db.updateAccount(portfolioUpdate.account);

      this.eventBus.publish('TRADE_EXECUTED', { execution: exec, order: matchResult.order }, order.id);
      this.eventBus.publish('POSITION_UPDATED', { position: portfolioUpdate.position }, order.id);
      this.eventBus.publish('PORTFOLIO_UPDATED', { account: portfolioUpdate.account }, order.id);
    }

    const finalResult = {
      success: true,
      order: matchResult.order,
      executions: matchResult.executions
    };

    if (idempotencyKey) {
      this.cache.setIdempotency(idempotencyKey, finalResult);
    }

    return finalResult;
  }

  public async cancelOrder(userId: string, orderId: string): Promise<{ success: boolean; order?: Order; message?: string }> {
    const order = await this.db.getOrder(orderId);
    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    if (order.user_id !== userId) {
      return { success: false, message: 'Unauthorized access to order' };
    }

    if (order.status === 'FILLED' || order.status === 'CANCELLED' || order.status === 'REJECTED') {
      return { success: false, message: `Cannot cancel order in status ${order.status}` };
    }

    const cancelResult = this.matchingEngine.cancelOrder(order.symbol, orderId);
    if (cancelResult.success && cancelResult.order) {
      await this.db.saveOrder(cancelResult.order);
      this.db.logOrderEvent(order.id, 'ORDER_CANCELLED', {});
      this.eventBus.publish('ORDER_CANCELLED', { order: cancelResult.order }, order.id);
      return { success: true, order: cancelResult.order };
    }

    return { success: false, message: cancelResult.message || 'Could not cancel order' };
  }

  public async modifyOrder(
    userId: string,
    orderId: string,
    newPrice: number,
    newQty: number
  ): Promise<{ success: boolean; order?: Order; message?: string }> {
    const order = await this.db.getOrder(orderId);
    if (!order) return { success: false, message: 'Order not found' };
    if (order.user_id !== userId) return { success: false, message: 'Unauthorized' };

    const result = this.matchingEngine.modifyOrder(order.symbol, orderId, newPrice, newQty);
    if (result.success && result.order) {
      await this.db.saveOrder(result.order);
      this.db.logOrderEvent(order.id, 'ORDER_MODIFIED', { newPrice, newQty });
      this.eventBus.publish('ORDER_MODIFIED', { order: result.order }, order.id);
      return { success: true, order: result.order };
    }

    return { success: false, message: result.message || 'Could not modify order' };
  }

  public async squareOffPosition(userId: string, symbol: string, productType: 'INTRADAY' | 'DELIVERY') {
    const pos = await this.db.getPosition(userId, symbol, productType);
    if (!pos || pos.quantity === 0) {
      return { success: false, message: 'No open position to square off' };
    }

    const side = pos.quantity > 0 ? 'SELL' : 'BUY';
    const quantity = Math.abs(pos.quantity);

    return this.submitOrder(userId, {
      symbol,
      side,
      order_type: 'MARKET',
      product_type: productType,
      quantity
    });
  }

  private async handleMakerFill(order: Order, execution: Execution) {
    await this.db.saveOrder(order);
    await this.db.saveExecution(execution);
    this.db.logOrderEvent(order.id, 'TRADE_EXECUTED_MAKER', { price: execution.price, qty: execution.quantity });

    const currentPos = await this.db.getPosition(order.user_id, execution.symbol, order.product_type);
    const currentHold = await this.db.getHolding(order.user_id, execution.symbol);
    const currentAcc = await this.db.getAccount(order.user_id);

    if (currentAcc) {
      const portfolioUpdate = this.portfolioEngine.processExecution(
        execution,
        order,
        currentPos,
        currentHold,
        currentAcc
      );

      await this.db.savePosition(portfolioUpdate.position);
      if (portfolioUpdate.holding) {
        await this.db.saveHolding(portfolioUpdate.holding);
      }
      await this.db.updateAccount(portfolioUpdate.account);

      this.eventBus.publish('TRADE_EXECUTED', { execution, order }, order.id);
      this.eventBus.publish('POSITION_UPDATED', { position: portfolioUpdate.position }, order.id);
      this.eventBus.publish('PORTFOLIO_UPDATED', { account: portfolioUpdate.account }, order.id);
    }
  }

  private createRejectedOrder(userId: string, payload: any, reason: RejectReason): Order {
    return {
      id: uuidv4(),
      user_id: userId,
      symbol: payload.symbol,
      side: payload.side,
      order_type: payload.order_type,
      product_type: payload.product_type,
      quantity: payload.quantity,
      filled_quantity: 0,
      remaining_quantity: payload.quantity,
      price: payload.price,
      trigger_price: payload.trigger_price,
      status: 'REJECTED',
      reject_reason: reason,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    };
  }
}
