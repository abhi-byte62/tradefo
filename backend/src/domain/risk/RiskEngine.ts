import { Order, Instrument, Account, Holding, Position, RejectReason } from '../../types/index.js';

export interface RiskCheckResult {
  passed: boolean;
  rejectReason?: RejectReason;
  message?: string;
  requiredMargin: number;
}

export class RiskEngine {
  private maxSingleOrderQty: number = 50000;
  private maxPositionLimit: number = 100000;
  private intradayMarginMultiplier: number = 0.2; // 5x leverage (20% margin)
  private deliveryMarginMultiplier: number = 1.0; // 100% upfront margin

  public validateOrder(
    order: Partial<Order>,
    instrument: Instrument,
    account: Account,
    currentLtp: number,
    holding?: Holding,
    position?: Position
  ): RiskCheckResult {
    // 1. Validate basic quantities
    if (!order.quantity || order.quantity <= 0 || !Number.isInteger(order.quantity)) {
      return {
        passed: false,
        rejectReason: 'INVALID_QUANTITY',
        message: 'Order quantity must be a positive integer',
        requiredMargin: 0
      };
    }

    if (order.quantity % instrument.lot_size !== 0) {
      return {
        passed: false,
        rejectReason: 'INVALID_QUANTITY',
        message: `Quantity must be a multiple of lot size (${instrument.lot_size})`,
        requiredMargin: 0
      };
    }

    if (order.quantity > this.maxSingleOrderQty * instrument.lot_size) {
      return {
        passed: false,
        rejectReason: 'MAX_ORDER_QTY_EXCEEDED',
        message: `Quantity exceeds maximum order quantity limit of ${this.maxSingleOrderQty * instrument.lot_size}`,
        requiredMargin: 0
      };
    }

    // 2. Validate price for Limit / SL-L
    const effectivePrice = order.order_type === 'MARKET' ? currentLtp : (order.price || 0);

    if (order.order_type === 'LIMIT' || order.order_type === 'STOP_LOSS_LIMIT') {
      if (!order.price || order.price <= 0) {
        return {
          passed: false,
          rejectReason: 'PRICE_REQUIRED_FOR_LIMIT_ORDER',
          message: 'Limit orders require a positive execution price',
          requiredMargin: 0
        };
      }

      // Check tick size alignment
      const remainder = Number((order.price % instrument.tick_size).toFixed(4));
      const tickTolerance = 0.0001;
      if (remainder > tickTolerance && Math.abs(remainder - instrument.tick_size) > tickTolerance) {
        return {
          passed: false,
          rejectReason: 'TICK_SIZE_VIOLATION',
          message: `Price ${order.price} does not conform to tick size ${instrument.tick_size}`,
          requiredMargin: 0
        };
      }

      // Circuit limits
      if (order.price < instrument.lower_circuit || order.price > instrument.upper_circuit) {
        return {
          passed: false,
          rejectReason: 'CIRCUIT_LIMIT_VIOLATION',
          message: `Price must be between lower circuit (${instrument.lower_circuit}) and upper circuit (${instrument.upper_circuit})`,
          requiredMargin: 0
        };
      }
    }

    // 3. Validate trigger price for Stop-Loss
    if (order.order_type === 'STOP_LOSS' || order.order_type === 'STOP_LOSS_LIMIT') {
      if (!order.trigger_price || order.trigger_price <= 0) {
        return {
          passed: false,
          rejectReason: 'TRIGGER_PRICE_REQUIRED',
          message: 'Stop-loss orders require a positive trigger price',
          requiredMargin: 0
        };
      }

      if (order.trigger_price < instrument.lower_circuit || order.trigger_price > instrument.upper_circuit) {
        return {
          passed: false,
          rejectReason: 'CIRCUIT_LIMIT_VIOLATION',
          message: `Trigger price must be between circuit limits (${instrument.lower_circuit} - ${instrument.upper_circuit})`,
          requiredMargin: 0
        };
      }
    }

    // 4. Calculate Margin Requirement
    const marginFactor = order.product_type === 'INTRADAY'
      ? this.intradayMarginMultiplier
      : this.deliveryMarginMultiplier;

    const estimatedValue = effectivePrice * order.quantity;
    const requiredMargin = Number((estimatedValue * marginFactor).toFixed(2));

    // 5. Margin and Holdings Check
    if (order.side === 'BUY') {
      if (requiredMargin > account.available_margin) {
        return {
          passed: false,
          rejectReason: 'INSUFFICIENT_FUNDS',
          message: `Insufficient margin. Required: ₹${requiredMargin.toLocaleString()}, Available: ₹${account.available_margin.toLocaleString()}`,
          requiredMargin
        };
      }
    } else if (order.side === 'SELL') {
      if (order.product_type === 'DELIVERY') {
        const holdingQty = holding?.quantity || 0;
        if (holdingQty < order.quantity) {
          return {
            passed: false,
            rejectReason: 'INSUFFICIENT_HOLDINGS',
            message: `Insufficient demat holdings. Available: ${holdingQty}, Requested: ${order.quantity}`,
            requiredMargin: 0
          };
        }
      } else {
        // Intraday short selling requires margin
        if (requiredMargin > account.available_margin) {
          return {
            passed: false,
            rejectReason: 'INSUFFICIENT_FUNDS',
            message: `Insufficient margin for short position. Required: ₹${requiredMargin.toLocaleString()}, Available: ₹${account.available_margin.toLocaleString()}`,
            requiredMargin
          };
        }
      }
    }

    // 6. Max Position Limits check
    const currentPositionQty = Math.abs(position?.quantity || 0);
    if (currentPositionQty + order.quantity > this.maxPositionLimit) {
      return {
        passed: false,
        rejectReason: 'MAX_POSITION_SIZE_EXCEEDED',
        message: `Resulting position would exceed max symbol exposure limit of ${this.maxPositionLimit}`,
        requiredMargin
      };
    }

    return {
      passed: true,
      requiredMargin
    };
  }
}
