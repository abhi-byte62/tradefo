import React, { useEffect } from 'react';
import { useTerminalStore } from './store/useTerminalStore';
import { Header } from './components/Header';
import { WatchlistPanel } from './components/WatchlistPanel';
import { ChartPanel } from './components/ChartPanel';
import { MarketDepthPanel } from './components/MarketDepthPanel';
import { OrderEntryPanel } from './components/OrderEntryPanel';
import { TerminalBottomConsole } from './components/TerminalBottomConsole';
import { SearchModal } from './components/SearchModal';
import { ModifyOrderModal } from './components/ModifyOrderModal';
import { OrderLogsModal } from './components/OrderLogsModal';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { AuthModal } from './components/AuthModal';

export const App: React.FC = () => {
  const {
    initSession,
    setSearchOpen,
    setShortcutsOpen,
    setOrderSide,
    setActiveBottomTab,
    setModifyOpen,
    setLogsOpen,
    setAuthModalOpen
  } = useTerminalStore();

  useEffect(() => {
    initSession();

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Strictly ignore keyboard shortcuts if user is focused inside any input, textarea, or select
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        if (e.key === 'Escape') {
          target.blur();
        }
        return;
      }

      switch (e.key) {
        case '/':
          e.preventDefault();
          setSearchOpen(true);
          break;
        case 'b':
        case 'B':
          setOrderSide('BUY');
          break;
        case 's':
        case 'S':
          setOrderSide('SELL');
          break;
        case '1':
          setActiveBottomTab('ORDERS');
          break;
        case '2':
          setActiveBottomTab('POSITIONS');
          break;
        case '3':
          setActiveBottomTab('HOLDINGS');
          break;
        case '4':
          setActiveBottomTab('TRADES');
          break;
        case '5':
          setActiveBottomTab('LOGS');
          break;
        case '?':
          setShortcutsOpen(true);
          break;
        case 'Escape':
          setSearchOpen(false);
          setShortcutsOpen(false);
          setModifyOpen(false);
          setLogsOpen(false);
          setAuthModalOpen(false);
          break;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen bg-terminal-bg text-terminal-text overflow-hidden">
      {/* Top Navigation Bar */}
      <Header />

      {/* Main Terminal Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Watchlist */}
        <WatchlistPanel />

        {/* Center Candlestick Chart */}
        <ChartPanel />

        {/* Right Level 2 Market Depth */}
        <MarketDepthPanel />

        {/* Far-Right Order Execution Panel */}
        <OrderEntryPanel />
      </div>

      {/* Bottom Multi-Tab Console */}
      <TerminalBottomConsole />

      {/* Interactive Modals */}
      <SearchModal />
      <ModifyOrderModal />
      <OrderLogsModal />
      <KeyboardShortcutsModal />
      <AuthModal />
    </div>
  );
};

export default App;
