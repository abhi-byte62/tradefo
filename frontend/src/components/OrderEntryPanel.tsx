import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { Zap, AlertCircle, ArrowRight } from 'lucide-react';

export const OrderEntryPanel: React.FC = () => {
  const {
    selectedSymbol,
    instruments,
    ticks,
    account,
    orderSide,
    setOrderSide,
    productType,
    setProductType,
    orderType,
    setOrderType,
    orderQuantity,
    setOrderQuantity,
    orderPrice,
    setOrderPrice,
    orderTriggerPrice,
    setOrderTriggerPrice,
    submitOrder,
    orderSubmitting
  } = useTerminalStore();

  const inst = instruments.find(i => i.symbol === selectedSymbol);
  const currentTick = ticks[selectedSymbol];
  const ltp = currentTick ? currentTick.ltp : (inst ? inst.base_price : 0);

  const effectivePrice = orderType === 'MARKET' ? ltp : orderType === 'STOP_LOSS' ? (orderTriggerPrice || ltp) : orderPrice;
  const marginMultiplier = productType === 'INTRADAY' ? 0.2 : 1.0;
  const requiredMargin = Math.round(effectivePrice * orderQuantity * marginMultiplier * 100) / 100;
  const availableMargin = account ? account.available_margin : 0;
  const lotSize = inst ? inst.lot_size : 1;
  const tickSize = inst ? inst.tick_size : 0.05;

  const maxAffordableQty = effectivePrice > 0 ? Math.floor(availableMargin / (effectivePrice * marginMultiplier)) : 0;

  // Real-time pre-submission inline validations
  let validationError: string | null = null;

  if (!orderQuantity || orderQuantity <= 0) {
    validationError = 'Quantity must be greater than 0.';
  } else if (!Number.isInteger(orderQuantity)) {
    validationError = 'Quantity must be a whole integer.';
  } else if (orderQuantity % lotSize !== 0) {
    validationError = `Quantity must be a multiple of lot size (${lotSize}).`;
  } else if (orderQuantity > 1000000) {
    validationError = 'Quantity exceeds maximum allowed single-order limit (1,000,000).';
  } else if ((orderType === 'LIMIT' || orderType === 'STOP_LOSS_LIMIT') && (!orderPrice || orderPrice <= 0)) {
    validationError = 'Valid limit price is required.';
  } else if (inst && (orderType === 'LIMIT' || orderType === 'STOP_LOSS_LIMIT')) {
    const remainder = Number((orderPrice % tickSize).toFixed(4));
    if (remainder > 0.0001 && Math.abs(remainder - tickSize) > 0.0001) {
      validationError = `Price must conform to ₹${tickSize} tick size.`;
    } else if (orderPrice < inst.lower_circuit || orderPrice > inst.upper_circuit) {
      validationError = `Price must be within circuit limits (₹${inst.lower_circuit.toFixed(2)} - ₹${inst.upper_circuit.toFixed(2)}).`;
    }
  } else if ((orderType === 'STOP_LOSS' || orderType === 'STOP_LOSS_LIMIT') && (!orderTriggerPrice || orderTriggerPrice <= 0)) {
    validationError = 'Valid trigger price is required for Stop-Loss.';
  } else if (requiredMargin > availableMargin && (orderSide === 'BUY' || productType === 'INTRADAY')) {
    validationError = `Insufficient available margin (Need ₹${requiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}, Have ₹${availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2 })}).`;
  }

  const handleQuickQty = (multiplier: number) => {
    setOrderQuantity(Math.max(lotSize, multiplier * lotSize));
  };

  return (
    <div className="w-80 bg-terminal-panel border-l border-terminal-border flex flex-col h-full shrink-0 select-none overflow-hidden">
      {/* Top Header */}
      <div className="p-2 border-b border-terminal-border flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-white uppercase tracking-wider">Order Execution</span>
        </div>
        <span className="text-2xs bg-terminal-surface text-terminal-muted px-1.5 py-0.5 rounded font-mono font-medium border border-terminal-border/60">
          Lot: {lotSize}
        </span>
      </div>

      <div className="flex-1 p-3 flex flex-col justify-between overflow-y-auto space-y-3">
        <div className="space-y-3">
          {/* 1. BUY / SELL Switcher */}
          <div className="grid grid-cols-2 gap-1 bg-terminal-surface p-1 rounded border border-terminal-border">
            <button
              onClick={() => setOrderSide('BUY')}
              aria-pressed={orderSide === 'BUY'}
              className={`py-1.5 rounded text-xs font-bold tracking-wide transition-colors ${
                orderSide === 'BUY'
                  ? 'bg-trade-buy text-black shadow-sm ring-1 ring-emerald-400'
                  : 'text-terminal-muted hover:text-white'
              }`}
            >
              BUY [B]
            </button>
            <button
              onClick={() => setOrderSide('SELL')}
              aria-pressed={orderSide === 'SELL'}
              className={`py-1.5 rounded text-xs font-bold tracking-wide transition-colors ${
                orderSide === 'SELL'
                  ? 'bg-trade-sell text-white shadow-sm ring-1 ring-rose-400'
                  : 'text-terminal-muted hover:text-white'
              }`}
            >
              SELL [S]
            </button>
          </div>

          {/* 2. Product Type (Intraday vs Delivery) */}
          <div>
            <label className="text-2xs text-terminal-muted uppercase font-medium block mb-1">
              Product Type
            </label>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => setProductType('INTRADAY')}
                className={`py-1 rounded text-2xs font-semibold border transition-colors ${
                  productType === 'INTRADAY'
                    ? 'bg-blue-900/40 text-blue-300 border-blue-500'
                    : 'bg-terminal-surface text-terminal-muted border-terminal-border hover:text-white'
                }`}
              >
                Intraday (MIS 5x)
              </button>
              <button
                onClick={() => setProductType('DELIVERY')}
                className={`py-1 rounded text-2xs font-semibold border transition-colors ${
                  productType === 'DELIVERY'
                    ? 'bg-blue-900/40 text-blue-300 border-blue-500'
                    : 'bg-terminal-surface text-terminal-muted border-terminal-border hover:text-white'
                }`}
              >
                Delivery (CNC 100%)
              </button>
            </div>
          </div>

          {/* 3. Order Type (Market, Limit, SL-M, SL-L) */}
          <div>
            <label className="text-2xs text-terminal-muted uppercase font-medium block mb-1">
              Order Type
            </label>
            <div className="grid grid-cols-4 gap-1">
              {(['MARKET', 'LIMIT', 'STOP_LOSS', 'STOP_LOSS_LIMIT'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => {
                    setOrderType(type);
                    if ((type === 'LIMIT' || type === 'STOP_LOSS_LIMIT') && orderPrice === 0) setOrderPrice(ltp);
                    if ((type === 'STOP_LOSS' || type === 'STOP_LOSS_LIMIT') && orderTriggerPrice === 0) {
                      setOrderTriggerPrice(Math.round(ltp * (orderSide === 'BUY' ? 1.01 : 0.99) * 20) / 20);
                    }
                  }}
                  className={`py-1 rounded text-2xs font-mono font-semibold border transition-colors ${
                    orderType === type
                      ? 'bg-terminal-card text-white border-blue-500 shadow-sm'
                      : 'bg-terminal-surface text-terminal-subtle border-terminal-border hover:text-white'
                  }`}
                >
                  {type === 'STOP_LOSS' ? 'SL-M' : type === 'STOP_LOSS_LIMIT' ? 'SL-L' : type}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Quantity Input with Quick Multipliers */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-2xs text-terminal-muted uppercase font-medium">Quantity</label>
              <span className="text-2xs text-terminal-subtle font-mono">Max Affordable: {maxAffordableQty}</span>
            </div>
            <input
              type="number"
              step={lotSize}
              min={lotSize}
              value={orderQuantity || ''}
              onChange={(e) => {
                const val = e.target.value === '' ? 0 : parseInt(e.target.value, 10);
                setOrderQuantity(isNaN(val) ? 0 : val);
              }}
              className="w-full h-8 bg-terminal-surface border border-terminal-border rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="flex space-x-1 mt-1 font-mono text-2xs">
              {[1, 5, 10, 25].map(multiplier => (
                <button
                  key={multiplier}
                  onClick={() => handleQuickQty(multiplier)}
                  className="flex-1 py-0.5 bg-terminal-surface hover:bg-terminal-card border border-terminal-border rounded text-terminal-muted hover:text-white transition-colors"
                >
                  +{multiplier * lotSize}
                </button>
              ))}
            </div>
          </div>

          {/* 5. Price Field (Semantics adjusted per Order Type) */}
          {orderType === 'MARKET' ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-2xs text-terminal-muted uppercase font-medium">LTP / Reference Price</label>
                <span className="text-3xs text-emerald-400/90 font-mono">Market Execution</span>
              </div>
              <div className="w-full h-8 bg-terminal-surface/60 border border-terminal-border/80 rounded px-2.5 flex items-center justify-between text-xs font-mono text-terminal-muted cursor-not-allowed">
                <span>₹{ltp.toFixed(2)}</span>
                <span className="text-3xs text-terminal-subtle">Best Available Ask/Bid</span>
              </div>
            </div>
          ) : orderType === 'LIMIT' ? (
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-2xs text-terminal-muted uppercase font-medium">Limit Price</label>
                <button
                  onClick={() => setOrderPrice(ltp)}
                  className="text-2xs text-blue-400 hover:underline font-mono"
                >
                  Set LTP (₹{ltp.toFixed(2)})
                </button>
              </div>
              <input
                type="number"
                step={tickSize}
                value={orderPrice || ''}
                onChange={(e) => setOrderPrice(parseFloat(e.target.value) || 0)}
                className="w-full h-8 bg-terminal-surface border border-terminal-border rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          ) : orderType === 'STOP_LOSS' ? (
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-2xs text-amber-400 uppercase font-medium">Trigger Price</label>
                  <span className="text-3xs text-terminal-subtle font-mono">LTP: ₹{ltp.toFixed(2)}</span>
                </div>
                <input
                  type="number"
                  step={tickSize}
                  value={orderTriggerPrice || ''}
                  onChange={(e) => setOrderTriggerPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 bg-terminal-surface border border-amber-600/70 rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div className="text-3xs text-terminal-subtle bg-terminal-surface/40 p-1.5 rounded border border-terminal-border/40">
                Order remains pending until Trigger Price is hit, then executes at prevailing Market Price.
              </div>
            </div>
          ) : (
            /* STOP_LOSS_LIMIT */
            <div className="space-y-2">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-2xs text-amber-400 uppercase font-medium">Trigger Price</label>
                  <span className="text-3xs text-terminal-subtle font-mono">LTP: ₹{ltp.toFixed(2)}</span>
                </div>
                <input
                  type="number"
                  step={tickSize}
                  value={orderTriggerPrice || ''}
                  onChange={(e) => setOrderTriggerPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 bg-terminal-surface border border-amber-600/70 rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-2xs text-terminal-muted uppercase font-medium">Limit Price</label>
                  <button
                    onClick={() => setOrderPrice(ltp)}
                    className="text-2xs text-blue-400 hover:underline font-mono"
                  >
                    Set LTP (₹{ltp.toFixed(2)})
                  </button>
                </div>
                <input
                  type="number"
                  step={tickSize}
                  value={orderPrice || ''}
                  onChange={(e) => setOrderPrice(parseFloat(e.target.value) || 0)}
                  className="w-full h-8 bg-terminal-surface border border-terminal-border rounded px-2.5 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}
        </div>

        {/* 6. Margin Summary & Submit Button */}
        <div className="space-y-2 pt-2 border-t border-terminal-border">
          <div className="bg-terminal-surface p-2.5 rounded border border-terminal-border space-y-1 font-mono text-2xs">
            <div className="flex justify-between items-center">
              <span className="text-terminal-muted font-medium">Available Margin:</span>
              <span className="text-trade-buy font-bold tabular-nums text-xs">
                ₹{availableMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-terminal-muted font-medium">Margin Required:</span>
              <span className={`font-semibold tabular-nums ${validationError && validationError.includes('margin') ? 'text-trade-sell' : 'text-white'}`}>
                ₹{requiredMargin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-terminal-subtle pt-0.5 border-t border-terminal-border/40">
              <span>Brokerage (Simulated):</span>
              <span>₹0.00</span>
            </div>
          </div>

          {/* Inline Validation Alert */}
          {validationError && (
            <div className="flex items-start space-x-1.5 text-2xs text-trade-sell bg-red-950/40 border border-red-800/50 p-2 rounded">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-trade-sell" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Submit Button (Primary Visual Focus) */}
          <button
            onClick={submitOrder}
            disabled={orderSubmitting || !!validationError}
            className={`w-full py-2.5 rounded font-bold text-xs uppercase tracking-wider shadow-md transition-colors flex items-center justify-center space-x-2 ${
              orderSide === 'BUY'
                ? 'bg-trade-buy hover:bg-trade-buyHover text-black'
                : 'bg-trade-sell hover:bg-trade-sellHover text-white'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {orderSubmitting ? (
              <span>Submitting Order...</span>
            ) : (
              <>
                <span>{orderSide} {orderQuantity} {selectedSymbol}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
