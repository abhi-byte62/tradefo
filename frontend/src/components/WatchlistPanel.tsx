import React, { useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { Search, Trash2, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';

export const WatchlistPanel: React.FC = () => {
  const {
    instruments,
    ticks,
    selectedSymbol,
    setSelectedSymbol,
    setOrderSide,
    watchlists,
    activeWatchlistId,
    toggleWatchlistSymbol
  } = useTerminalStore();

  const [searchFilter, setSearchFilter] = useState('');

  // Active watchlist items
  const activeWatchlist = watchlists.find(w => w.id === activeWatchlistId);
  const activeSymbols = activeWatchlist ? activeWatchlist.symbols : instruments.map(i => i.symbol);

  const filteredSymbols = activeSymbols.filter(sym =>
    sym.toLowerCase().includes(searchFilter.toLowerCase())
  );

  return (
    <div className="w-80 bg-terminal-panel border-r border-terminal-border flex flex-col h-full shrink-0 select-none overflow-hidden">
      {/* Top Header & Watchlist Tabs */}
      <div className="p-2 border-b border-terminal-border flex items-center justify-between">
        <div className="flex items-center space-x-1.5">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-semibold text-white uppercase tracking-wider">Watchlist</span>
          <span className="text-2xs bg-terminal-surface text-terminal-muted px-1.5 py-0.5 rounded font-mono font-medium">
            {filteredSymbols.length}
          </span>
        </div>
      </div>

      {/* Filter Input */}
      <div className="p-2 border-b border-terminal-border">
        <div className="relative flex items-center">
          <Search className="w-3.5 h-3.5 text-terminal-subtle absolute left-2.5" />
          <input
            type="text"
            placeholder="Filter symbols in watchlist..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full h-7 bg-terminal-surface border border-terminal-border rounded pl-8 pr-2 text-xs text-white placeholder-terminal-subtle focus:outline-none focus:border-blue-500 font-mono"
          />
        </div>
      </div>

      {/* Symbol List */}
      <div className="flex-1 overflow-y-auto divide-y divide-terminal-border/40">
        {filteredSymbols.map((symbol) => {
          const inst = instruments.find(i => i.symbol === symbol);
          const tick = ticks[symbol];
          const isSelected = selectedSymbol === symbol;
          const ltp = tick ? tick.ltp : (inst ? inst.base_price : 0);
          const change = tick ? tick.change : 0;
          const changePercent = tick ? tick.change_percent : 0;
          const isPositive = change >= 0;

          return (
            <div
              key={symbol}
              onClick={() => setSelectedSymbol(symbol)}
              className={`group relative p-2.5 cursor-pointer transition-colors flex items-center justify-between ${
                isSelected
                  ? 'bg-[#182133] border-l-2 border-blue-500'
                  : 'hover:bg-terminal-surface/70 border-l-2 border-transparent'
              } ${tick?.flashDirection === 'up' ? 'flash-up' : tick?.flashDirection === 'down' ? 'flash-down' : ''}`}
            >
              {/* Left Column: Symbol & Exchange */}
              <div className="flex flex-col">
                <div className="flex items-center space-x-1.5">
                  <span className={`font-semibold text-xs transition-colors ${isSelected ? 'text-white font-bold' : 'text-terminal-text group-hover:text-blue-400'}`}>
                    {symbol}
                  </span>
                  <span className="text-3xs font-mono text-terminal-subtle bg-terminal-bg px-1 py-0.2 rounded border border-terminal-border/60 uppercase">
                    {inst?.exchange || 'NSE'}
                  </span>
                </div>
                <span className="text-2xs text-terminal-muted truncate max-w-[130px] mt-0.5">
                  {inst?.name || symbol}
                </span>
              </div>

              {/* Right Column: LTP & % Change */}
              <div className="flex flex-col items-end">
                <span className="font-mono text-xs font-semibold tabular-nums text-white">
                  ₹{ltp.toFixed(2)}
                </span>
                <div className="flex items-center space-x-0.5 mt-0.5">
                  {isPositive ? (
                    <ArrowUpRight className="w-3 h-3 text-trade-buy" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 text-trade-sell" />
                  )}
                  <span
                    className={`font-mono text-2xs font-semibold tabular-nums ${
                      isPositive ? 'text-trade-buy' : 'text-trade-sell'
                    }`}
                  >
                    {isPositive ? '+' : ''}{change.toFixed(2)} ({changePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              {/* Hover Quick Action Overlay */}
              <div className="absolute right-2 top-2 hidden group-hover:flex items-center space-x-1 bg-terminal-panel/95 p-1 rounded border border-terminal-border shadow-md backdrop-blur">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSymbol(symbol);
                    setOrderSide('BUY');
                  }}
                  className="px-2 py-0.5 bg-trade-buy hover:bg-trade-buyHover text-black text-2xs font-bold rounded shadow-sm transition-colors"
                >
                  BUY
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedSymbol(symbol);
                    setOrderSide('SELL');
                  }}
                  className="px-2 py-0.5 bg-trade-sell hover:bg-trade-sellHover text-white text-2xs font-bold rounded shadow-sm transition-colors"
                >
                  SELL
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleWatchlistSymbol(symbol);
                  }}
                  title="Remove from Watchlist"
                  className="p-1 text-terminal-muted hover:text-trade-sell rounded transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}

        {filteredSymbols.length === 0 && (
          <div className="p-8 text-center text-xs text-terminal-muted font-sans">
            No matching instruments found in watchlist.
          </div>
        )}
      </div>
    </div>
  );
};
