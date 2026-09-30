import { Execution, Order, Position, Holding, Account, Tick, ProductType } from '../../types/index.js';
import { v4 as uuidv4 } from 'uuid';

export class PortfolioEngine {
  /**
   * Process a confirmed execution against user positions, holdings, and account margins
   */
  public processExecution(
    execution: Execution,
    order: Order,
    currentPosition: Position | undefined,
    currentHolding: Holding | undefined,
    account: Account
  ): { position: Position; holding?: Holding; account: Account; realizedPnlDelta: number } {
    let realizedPnlDelta = 0;
    const isBuy = execution.side === 'BUY';
    const isDelivery = order.product_type === 'DELIVERY';

    // 1. Process Position
    let pos: Position = currentPosition || {
      id: uuidv4(),
      user_id: execution.user_id,
      symbol: execution.symbol,
      product_type: order.product_type,
      quantity: 0,
      buy_quantity: 0,
      sell_quantity: 0,
      buy_value: 0,
      sell_value: 0,
      average_price: 0,
      realized_pnl: 0,
      unrealized_pnl: 0,
      last_price: execution.price,
      updated_at: new Date().toISOString()
    };

    const prevQty = pos.quantity;

    if (isBuy) {
      pos.buy_quantity += execution.quantity;
      pos.buy_value += execution.price * execution.quantity;

      if (prevQty >= 0) {
        // Adding to Long position
        const newQty = prevQty + execution.quantity;
        const totalCost = prevQty * pos.average_price + execution.price * execution.quantity;
        pos.average_price = newQty > 0 ? Number((totalCost / newQty).toFixed(2)) : execution.price;
        pos.quantity = newQty;
      } else {
        // Covering a Short position
        const closedQty = Math.min(Math.abs(prevQty), execution.quantity);
        // Short realized PnL = (Short Entry Price - Buy Cover Price) * qty
        const pnl = (pos.average_price - execution.price) * closedQty;
        realizedPnlDelta += pnl;
        pos.realized_pnl += pnl;

        const remainingShort = Math.abs(prevQty) - closedQty;
        const excessBuy = execution.quantity - closedQty;

        if (excessBuy > 0) {
          // Flipped from Short to Long
          pos.quantity = excessBuy;
          pos.average_price = execution.price;
        } else {
          pos.quantity = -remainingShort;
          if (remainingShort === 0) pos.average_price = 0;
        }
      }
    } else {
      // Sell Order
      pos.sell_quantity += execution.quantity;
      pos.sell_value += execution.price * execution.quantity;

      if (prevQty <= 0) {
        // Adding to Short position
        const newQty = Math.abs(prevQty) + execution.quantity;
        const totalCost = Math.abs(prevQty) * pos.average_price + execution.price * execution.quantity;
        pos.average_price = newQty > 0 ? Number((totalCost / newQty).toFixed(2)) : execution.price;
        pos.quantity = -newQty;
      } else {
        // Selling Long position
        const closedQty = Math.min(prevQty, execution.quantity);
        // Long realized PnL = (Sell Price - Long Entry Price) * qty
        const pnl = (execution.price - pos.average_price) * closedQty;
        realizedPnlDelta += pnl;
        pos.realized_pnl += pnl;

        const remainingLong = prevQty - closedQty;
        const excessSell = execution.quantity - closedQty;

        if (excessSell > 0) {
          // Flipped from Long to Short
          pos.quantity = -excessSell;
          pos.average_price = execution.price;
        } else {
          pos.quantity = remainingLong;
          if (remainingLong === 0) pos.average_price = 0;
        }
      }
    }

    pos.last_price = execution.price;
    pos.unrealized_pnl = this.calculateUnrealizedPnl(pos.quantity, pos.average_price, execution.price);
    pos.updated_at = new Date().toISOString();

    // 2. Process Holdings (Delivery orders)
    let holding = currentHolding;
    if (isDelivery) {
      if (isBuy) {
        if (!holding) {
          holding = {
            id: uuidv4(),
            user_id: execution.user_id,
            symbol: execution.symbol,
            quantity: execution.quantity,
            average_price: execution.price,
            invested_value: execution.price * execution.quantity,
            current_value: execution.price * execution.quantity,
            pnl: 0,
            pnl_percentage: 0,
            updated_at: new Date().toISOString()
          };
        } else {
          const newQty = holding.quantity + execution.quantity;
          const totalInvested = holding.invested_value + execution.price * execution.quantity;
          holding.quantity = newQty;
          holding.average_price = Number((totalInvested / newQty).toFixed(2));
          holding.invested_value = totalInvested;
          holding.current_value = newQty * execution.price;
          holding.pnl = holding.current_value - holding.invested_value;
          holding.pnl_percentage = holding.invested_value > 0 ? Number(((holding.pnl / holding.invested_value) * 100).toFixed(2)) : 0;
          holding.updated_at = new Date().toISOString();
        }
      } else if (holding) {
        // Delivery Sell
        const remainingQty = Math.max(0, holding.quantity - execution.quantity);
        const sellCostBasis = holding.average_price * Math.min(holding.quantity, execution.quantity);
        holding.quantity = remainingQty;
        holding.invested_value = holding.average_price * remainingQty;
        holding.current_value = remainingQty * execution.price;
        holding.pnl = holding.current_value - holding.invested_value;
        holding.pnl_percentage = holding.invested_value > 0 ? Number(((holding.pnl / holding.invested_value) * 100).toFixed(2)) : 0;
        holding.updated_at = new Date().toISOString();
      }
    }

    // 3. Update Account Balance & Margins
    const updatedAccount = { ...account };
    const tradeValue = execution.price * execution.quantity;

    if (isDelivery) {
      if (isBuy) {
        updatedAccount.cash_balance -= tradeValue;
      } else {
        updatedAccount.cash_balance += tradeValue;
      }
    } else {
      // Intraday margin adjustments
      updatedAccount.cash_balance += realizedPnlDelta;
    }

    updatedAccount.realized_pnl += realizedPnlDelta;
    updatedAccount.available_margin = Math.max(0, updatedAccount.cash_balance + updatedAccount.realized_pnl - updatedAccount.used_margin);
    updatedAccount.updated_at = new Date().toISOString();

    return {
      position: pos,
      holding,
      account: updatedAccount,
      realizedPnlDelta
    };
  }

  public calculateUnrealizedPnl(quantity: number, averagePrice: number, currentLtp: number): number {
    if (quantity === 0 || averagePrice === 0) return 0;
    if (quantity > 0) {
      // Long: (LTP - Avg) * Qty
      return Number(((currentLtp - averagePrice) * quantity).toFixed(2));
    } else {
      // Short: (Avg - LTP) * |Qty|
      return Number(((averagePrice - currentLtp) * Math.abs(quantity)).toFixed(2));
    }
  }

  public markToMarket(positions: Position[], holdings: Holding[], ticks: Map<string, Tick>): {
    updatedPositions: Position[];
    updatedHoldings: Holding[];
    totalUnrealizedPnl: number;
    totalPortfolioValue: number;
  } {
    let totalUnrealizedPnl = 0;
    let totalHoldingsValue = 0;

    const updatedPositions = positions.map(pos => {
      const tick = ticks.get(pos.symbol);
      if (!tick) return pos;

      const unrealized = this.calculateUnrealizedPnl(pos.quantity, pos.average_price, tick.ltp);
      totalUnrealizedPnl += unrealized;
      return {
        ...pos,
        last_price: tick.ltp,
        unrealized_pnl: unrealized,
        updated_at: new Date().toISOString()
      };
    });

    const updatedHoldings = holdings.map(h => {
      const tick = ticks.get(h.symbol);
      if (!tick) return h;

      const currentValue = h.quantity * tick.ltp;
      const pnl = currentValue - h.invested_value;
      const pnlPercentage = h.invested_value > 0 ? Number(((pnl / h.invested_value) * 100).toFixed(2)) : 0;
      totalHoldingsValue += currentValue;

      return {
        ...h,
        current_value: Number(currentValue.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        pnl_percentage: pnlPercentage,
        updated_at: new Date().toISOString()
      };
    });

    return {
      updatedPositions,
      updatedHoldings,
      totalUnrealizedPnl: Number(totalUnrealizedPnl.toFixed(2)),
      totalPortfolioValue: Number(totalHoldingsValue.toFixed(2))
    };
  }
}
