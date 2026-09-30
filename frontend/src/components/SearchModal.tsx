import React, { useState, useEffect } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { Search, X, TrendingUp, ArrowRight } from 'lucide-react';

export const SearchModal: React.FC = () => {
  const { isSearchOpen, setSearchOpen, instruments, setSelectedSymbol, ticks } = useTerminalStore();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isSearchOpen) {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearchOpen]);

  if (!isSearchOpen) return null;

  const filtered = instruments.filter(i =>
    i.symbol.toLowerCase().includes(query.toLowerCase()) ||
    i.name.toLowerCase().includes(query.toLowerCase()) ||
    i.segment.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 select-none">
      <div className="w-full max-w-lg bg-terminal-panel border border-terminal-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Search Bar Input */}
        <div className="p-3 border-b border-terminal-border flex items-center space-x-2 bg-terminal-surface">
          <Search className="w-4 h-4 text-blue-400 shrink-0" />
          <input
            autoFocus
            type="text"
            placeholder="Search stocks, indices, crypto by symbol or name..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-white text-sm focus:outline-none placeholder-terminal-subtle font-mono"
          />
          <button
            onClick={() => setSearchOpen(false)}
            className="p-1 text-terminal-muted hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto divide-y divide-terminal-border/40 font-mono text-xs">
          {filtered.map(inst => {
            const tick = ticks[inst.symbol];
            const ltp = tick ? tick.ltp : inst.base_price;
            const change = tick ? tick.change : 0;
            const isPositive = change >= 0;

            return (
              <div
                key={inst.symbol}
                onClick={() => {
                  setSelectedSymbol(inst.symbol);
                  setSearchOpen(false);
                }}
                className="p-3 flex items-center justify-between hover:bg-terminal-card cursor-pointer transition-colors group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded bg-terminal-surface border border-terminal-border flex items-center justify-center text-xs font-bold text-blue-400">
                    {inst.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white group-hover:text-blue-400 transition-colors">
                        {inst.symbol}
                      </span>
                      <span className="text-2xs bg-terminal-bg text-terminal-muted px-1.5 py-0.2 rounded border border-terminal-border">
                        {inst.exchange} • {inst.segment}
                      </span>
                    </div>
                    <div className="text-2xs text-terminal-muted font-sans truncate max-w-[200px]">
                      {inst.name}
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="font-bold text-white tabular-nums">₹{ltp.toFixed(2)}</div>
                    <div className={`text-2xs font-semibold tabular-nums ${isPositive ? 'text-trade-buy' : 'text-trade-sell'}`}>
                      {isPositive ? '+' : ''}{change.toFixed(2)} ({tick ? tick.change_percent.toFixed(2) : '0.00'}%)
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-terminal-subtle group-hover:text-white transition-colors" />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="p-8 text-center text-terminal-muted font-sans text-xs">
              No matching instruments found for "{query}".
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
