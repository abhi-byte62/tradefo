import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { Activity, Search, RefreshCw, HelpCircle, User as UserIcon, LogIn } from 'lucide-react';

export const Header: React.FC = () => {
  const {
    user,
    account,
    ticks,
    wsStatus,
    setSearchOpen,
    setShortcutsOpen,
    setAuthModalOpen,
    logout,
    resetBalance
  } = useTerminalStore();

  const niftyTick = ticks['NIFTY50'];
  const bankNiftyTick = ticks['BANKNIFTY'];

  const getStatusText = () => {
    switch (wsStatus) {
      case 'CONNECTED':
        return 'SIM MARKET LIVE';
      case 'CONNECTING':
        return 'RECONNECTING...';
      case 'DISCONNECTED':
        return 'DISCONNECTED';
      case 'ERROR':
        return 'CONNECTION ERROR';
      default:
        return 'SIMULATED';
    }
  };

  const getStatusDotColor = () => {
    switch (wsStatus) {
      case 'CONNECTED':
        return 'bg-trade-buy animate-pulse';
      case 'CONNECTING':
        return 'bg-amber-400 animate-pulse';
      default:
        return 'bg-trade-sell';
    }
  };

  return (
    <header className="h-12 bg-terminal-panel border-b border-terminal-border flex items-center justify-between px-3 shrink-0 select-none z-20">
      {/* Left: Brand & Market Indices */}
      <div className="flex items-center space-x-4">
        {/* Brand Logo */}
        <div className="flex items-center space-x-2">
          <div className="w-7 h-7 rounded bg-blue-600/90 border border-blue-500/40 flex items-center justify-center font-bold text-white shadow-sm">
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-white text-sm">
              Trade<span className="text-trade-buy">Forge</span>
            </span>
            <span className="text-3xs bg-blue-950/80 text-blue-300 font-mono px-1.5 py-0.5 rounded border border-blue-800/60 uppercase tracking-wider font-semibold">
              Paper Terminal
            </span>
          </div>
        </div>

        {/* Global Live Tickers */}
        <div className="hidden lg:flex items-center space-x-3 border-l border-terminal-border pl-4 text-xs font-mono">
          {/* NIFTY 50 */}
          <div className="flex items-center space-x-1.5">
            <span className="text-terminal-muted text-2xs uppercase font-medium">NIFTY 50</span>
            <span className="font-semibold tabular-nums text-white">
              {niftyTick ? niftyTick.ltp.toFixed(2) : '25,800.00'}
            </span>
            {niftyTick && (
              <span className={`text-2xs font-medium tabular-nums ${niftyTick.change >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                {niftyTick.change >= 0 ? '+' : ''}{niftyTick.change.toFixed(2)} ({niftyTick.change_percent.toFixed(2)}%)
              </span>
            )}
          </div>

          {/* BANKNIFTY */}
          <div className="flex items-center space-x-1.5 border-l border-terminal-border/60 pl-3">
            <span className="text-terminal-muted text-2xs uppercase font-medium">BANKNIFTY</span>
            <span className="font-semibold tabular-nums text-white">
              {bankNiftyTick ? bankNiftyTick.ltp.toFixed(2) : '53,600.00'}
            </span>
            {bankNiftyTick && (
              <span className={`text-2xs font-medium tabular-nums ${bankNiftyTick.change >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                {bankNiftyTick.change >= 0 ? '+' : ''}{bankNiftyTick.change.toFixed(2)} ({bankNiftyTick.change_percent.toFixed(2)}%)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Search Trigger Bar */}
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <button
          onClick={() => setSearchOpen(true)}
          className="w-full h-7 bg-terminal-surface hover:bg-terminal-card border border-terminal-border hover:border-terminal-borderLight rounded px-2.5 flex items-center justify-between text-xs text-terminal-muted transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <div className="flex items-center space-x-2">
            <Search className="w-3.5 h-3.5 text-terminal-subtle" />
            <span className="text-xs">Search instruments (e.g. RELIANCE, TCS, INFY)...</span>
          </div>
          <kbd className="bg-terminal-bg border border-terminal-border px-1.5 py-0.2 rounded text-2xs text-terminal-subtle font-mono">
            /
          </kbd>
        </button>
      </div>

      {/* Right: Market Status, Virtual Balance & User Profile */}
      <div className="flex items-center space-x-2.5 text-xs">
        {/* WebSocket / Market Status Indicator */}
        <div className="flex items-center space-x-1.5 px-2 py-1 bg-terminal-surface border border-terminal-border rounded text-2xs font-mono">
          <span className={`w-2 h-2 rounded-full ${getStatusDotColor()}`} />
          <span className="text-terminal-muted uppercase font-medium tracking-wide hidden sm:inline">
            {getStatusText()}
          </span>
        </div>

        {/* Paper Trading Account Balance */}
        {user && account ? (
          <div className="flex items-center space-x-2 bg-terminal-surface border border-terminal-border px-2.5 py-1 rounded">
            <div className="flex flex-col text-right">
              <span className="text-2xs text-terminal-muted uppercase tracking-tight">Available Margin</span>
              <span className="font-mono font-bold text-trade-buy tabular-nums text-xs">
                ₹{account.available_margin.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <button
              onClick={resetBalance}
              title="Reset Virtual Paper Capital to ₹10,00,000"
              className="p-1 text-terminal-subtle hover:text-white hover:bg-terminal-card rounded transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : null}

        {/* Keyboard Shortcuts Help */}
        <button
          onClick={() => setShortcutsOpen(true)}
          title="Keyboard Shortcuts (?)"
          className="p-1.5 text-terminal-muted hover:text-white hover:bg-terminal-surface border border-terminal-border rounded transition-colors"
        >
          <HelpCircle className="w-4 h-4" />
        </button>

        {/* User Auth / Login */}
        {user ? (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 bg-terminal-surface border border-terminal-border px-2 py-1 rounded">
              <UserIcon className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-medium text-white max-w-[90px] truncate text-xs">{user.name}</span>
            </div>
            <button
              onClick={logout}
              className="text-2xs text-terminal-muted hover:text-trade-sell px-2 py-1 rounded hover:bg-terminal-surface border border-transparent hover:border-terminal-border transition-colors font-medium"
            >
              Logout
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAuthModalOpen(true)}
            className="flex items-center space-x-1.5 bg-trade-buy hover:bg-trade-buyHover text-black font-semibold px-3 py-1 rounded shadow-sm text-xs transition-colors"
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In / Demo</span>
          </button>
        )}
      </div>
    </header>
  );
};
