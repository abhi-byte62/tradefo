import React, { useEffect } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { AlignLeft, RefreshCw } from 'lucide-react';

export const MarketDepthPanel: React.FC = () => {
  const { selectedSymbol, marketDepth, fetchDepth, instruments } = useTerminalStore();
  const inst = instruments.find(i => i.symbol === selectedSymbol);

  // Refresh depth snapshot periodically
  useEffect(() => {
    const timer = setInterval(() => {
      fetchDepth();
    }, 1500);
    return () => clearInterval(timer);
  }, [selectedSymbol]);

  const bids = marketDepth?.bids || [];
  const asks = marketDepth?.asks || [];
  const totalBidQty = marketDepth?.total_bid_qty || 1;
  const totalAskQty = marketDepth?.total_ask_qty || 1;
  const totalVolume = totalBidQty + totalAskQty;
  const bidRatio = Math.round((totalBidQty / totalVolume) * 100);

  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? Number((bestAsk - bestBid).toFixed(2)) : 0;
  const spreadBps = bestBid > 0 ? Number(((spread / bestBid) * 10000).toFixed(1)) : 0;

  const maxBidQty = Math.max(...bids.map(b => b.quantity), 1);
  const maxAskQty = Math.max(...asks.map(a => a.quantity), 1);

  return (
    <div className="w-80 bg-terminal-panel border-l border-terminal-border flex flex-col h-full shrink-0 select-none overflow-hidden">
      {/* Header */}
      <div className="p-2 border-b border-terminal-border flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <AlignLeft className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-semibold text-white uppercase tracking-wider">Market Depth (L2)</span>
        </div>
        <button
          onClick={() => fetchDepth()}
          title="Refresh Depth"
          className="p-1 text-terminal-muted hover:text-white rounded transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Depth Ladder: Bids & Asks Grid */}
      <div className="flex-1 p-2 flex flex-col justify-between overflow-y-auto font-mono text-2xs">
        <div className="grid grid-cols-2 gap-2">
          {/* BID SIDE */}
          <div>
            <div className="flex items-center justify-between pb-1 border-b border-terminal-border/60 text-terminal-muted font-medium text-2xs uppercase">
              <span>Orders</span>
              <span>Qty</span>
              <span>Bid Price</span>
            </div>

            <div className="space-y-1 pt-1">
              {bids.slice(0, 5).map((bid, idx) => {
                const widthPercent = Math.round((bid.quantity / maxBidQty) * 100);
                const isBest = idx === 0;
                return (
                  <div
                    key={`bid-${idx}`}
                    className={`relative flex items-center justify-between py-0.5 px-1 rounded overflow-hidden ${
                      isBest ? 'bg-emerald-950/30' : ''
                    }`}
                  >
                    {/* Background Depth Bar */}
                    <div
                      className="absolute right-0 top-0 bottom-0 bg-trade-buy/15 pointer-events-none rounded"
                      style={{ width: `${widthPercent}%` }}
                    />
                    <span className="text-terminal-subtle relative z-10 text-3xs">{bid.orders}</span>
                    <span className="text-white relative z-10 text-2xs tabular-nums">{bid.quantity}</span>
                    <span className={`font-bold relative z-10 tabular-nums text-trade-buy ${isBest ? 'text-xs' : 'text-2xs'}`}>
                      ₹{bid.price.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 pt-1 border-t border-terminal-border/60 flex items-center justify-between font-semibold text-terminal-muted text-2xs">
              <span>Total Bid:</span>
              <span className="text-white tabular-nums">{totalBidQty.toLocaleString()}</span>
            </div>
          </div>

          {/* ASK SIDE */}
          <div>
            <div className="flex items-center justify-between pb-1 border-b border-terminal-border/60 text-terminal-muted font-medium text-2xs uppercase">
              <span>Ask Price</span>
              <span>Qty</span>
              <span>Orders</span>
            </div>

            <div className="space-y-1 pt-1">
              {asks.slice(0, 5).map((ask, idx) => {
                const widthPercent = Math.round((ask.quantity / maxAskQty) * 100);
                const isBest = idx === 0;
                return (
                  <div
                    key={`ask-${idx}`}
                    className={`relative flex items-center justify-between py-0.5 px-1 rounded overflow-hidden ${
                      isBest ? 'bg-rose-950/30' : ''
                    }`}
                  >
                    {/* Background Depth Bar */}
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-trade-sell/15 pointer-events-none rounded"
                      style={{ width: `${widthPercent}%` }}
                    />
                    <span className={`font-bold relative z-10 tabular-nums text-trade-sell ${isBest ? 'text-xs' : 'text-2xs'}`}>
                      ₹{ask.price.toFixed(2)}
                    </span>
                    <span className="text-white relative z-10 text-2xs tabular-nums">{ask.quantity}</span>
                    <span className="text-terminal-subtle relative z-10 text-3xs">{ask.orders}</span>
                  </div>
                );
              })}
            </div>

            <div className="mt-2 pt-1 border-t border-terminal-border/60 flex items-center justify-between font-semibold text-terminal-muted text-2xs">
              <span>Total Ask:</span>
              <span className="text-white tabular-nums">{totalAskQty.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Depth Analytics Footer */}
        <div className="mt-2 pt-2 border-t border-terminal-border space-y-2">
          {/* Bid vs Ask Liquidity Ratio Bar */}
          <div>
            <div className="flex justify-between text-2xs text-terminal-muted mb-1 font-sans">
              <span className="text-trade-buy font-semibold">{bidRatio}% Buyers</span>
              <span className="text-trade-sell font-semibold">{100 - bidRatio}% Sellers</span>
            </div>
            <div className="h-1.5 w-full bg-trade-sell/40 rounded-full overflow-hidden flex">
              <div className="h-full bg-trade-buy transition-all duration-300" style={{ width: `${bidRatio}%` }} />
            </div>
          </div>

          {/* Spread & Circuit Limits */}
          <div className="bg-terminal-surface p-2 rounded border border-terminal-border text-2xs space-y-1 font-sans">
            <div className="flex justify-between items-center">
              <span className="text-terminal-muted font-medium">Spread:</span>
              <span className="font-mono font-bold text-white tabular-nums">
                ₹{spread.toFixed(2)} <span className="text-terminal-subtle font-normal">({spreadBps} bps)</span>
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Lower Circuit (10%):</span>
              <span className="font-mono text-trade-sell tabular-nums">₹{inst?.lower_circuit.toFixed(2) || '0.00'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Upper Circuit (10%):</span>
              <span className="font-mono text-trade-buy tabular-nums">₹{inst?.upper_circuit.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
