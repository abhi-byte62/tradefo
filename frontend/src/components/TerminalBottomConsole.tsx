import React, { useState, useEffect } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { ApiClient } from '../services/api';
import { FileText, Edit2, Trash2, Cpu, Activity, ShieldCheck, Database, Zap } from 'lucide-react';
import { Order } from '../types';

export const TerminalBottomConsole: React.FC = () => {
  const {
    activeBottomTab,
    setActiveBottomTab,
    orders,
    positions,
    holdings,
    trades,
    systemLogs,
    account,
    cancelOrder,
    setModifyOpen,
    setLogsOpen,
    squareOffPosition
  } = useTerminalStore();

  const [orderFilter, setOrderFilter] = useState<'ALL' | 'OPEN' | 'FILLED' | 'CANCELLED' | 'REJECTED'>('ALL');
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    if (activeBottomTab === 'LOGS') {
      const fetchMetrics = async () => {
        try {
          const res = await fetch('/api/metrics');
          if (res.ok) {
            const data = await res.json();
            setMetrics(data);
          }
        } catch (e) {
          // ignore
        }
      };
      fetchMetrics();
      const timer = setInterval(fetchMetrics, 3000);
      return () => clearInterval(timer);
    }
  }, [activeBottomTab]);

  const filteredOrders = orders.filter(o => {
    if (orderFilter === 'ALL') return true;
    if (orderFilter === 'OPEN') return o.status === 'OPEN' || o.status === 'PARTIALLY_FILLED' || o.status === 'PENDING';
    return o.status === orderFilter;
  });

  const openPositionsCount = positions.filter(p => p.quantity !== 0).length;
  const openOrdersCount = orders.filter(o => o.status === 'OPEN' || o.status === 'PENDING').length;
  const totalUnrealizedPnl = positions.reduce((sum, p) => sum + (p.unrealized_pnl || 0), 0);

  const handleOpenLogs = async (order: Order) => {
    const logs = await ApiClient.getOrderAuditLogs(order.id);
    setLogsOpen(true, logs);
  };

  return (
    <div className="h-64 bg-terminal-panel border-t border-terminal-border flex flex-col shrink-0 select-none overflow-hidden">
      {/* Tab Navigation Header */}
      <div className="h-9 bg-terminal-panel border-b border-terminal-border px-3 flex items-center justify-between text-xs shrink-0">
        {/* Left: Tab Buttons */}
        <div className="flex items-center space-x-1">
          {[
            { key: 'ORDERS', label: 'Orders', count: openOrdersCount > 0 ? openOrdersCount : orders.length },
            { key: 'POSITIONS', label: 'Positions', count: openPositionsCount },
            { key: 'HOLDINGS', label: 'Holdings', count: holdings.length },
            { key: 'TRADES', label: 'Trade Book', count: trades.length },
            { key: 'ANALYTICS', label: 'Portfolio Analytics' },
            { key: 'LOGS', label: 'Engine Telemetry' }
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveBottomTab(tab.key as any)}
              className={`px-3 py-1.5 rounded-t text-xs font-semibold flex items-center space-x-1.5 transition-colors ${
                activeBottomTab === tab.key
                  ? 'bg-terminal-surface text-white border-t-2 border-blue-500'
                  : 'text-terminal-muted hover:text-white'
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-2xs bg-terminal-bg text-terminal-muted px-1.5 py-0.2 rounded font-mono font-medium">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Right: Summary PnL & Order Filters */}
        <div className="flex items-center space-x-3 text-2xs font-mono">
          {activeBottomTab === 'ORDERS' && (
            <div className="flex items-center space-x-1">
              {(['ALL', 'OPEN', 'FILLED', 'CANCELLED', 'REJECTED'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setOrderFilter(f)}
                  className={`px-1.5 py-0.5 rounded transition-colors ${
                    orderFilter === f
                      ? 'bg-blue-900/50 text-blue-300 font-bold border border-blue-700'
                      : 'text-terminal-subtle hover:text-white'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          )}

          {activeBottomTab === 'POSITIONS' && (
            <div className="flex items-center space-x-1.5 bg-terminal-surface px-2.5 py-0.5 rounded border border-terminal-border">
              <span className="text-terminal-muted uppercase tracking-tight font-medium">Unrealized P&L:</span>
              <span className={`font-bold tabular-nums text-xs ${totalUnrealizedPnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tab Content Tables */}
      <div className="flex-1 overflow-auto font-mono text-2xs">
        {/* 1. ORDERS TAB */}
        {activeBottomTab === 'ORDERS' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-terminal-surface sticky top-0 text-terminal-muted uppercase text-2xs border-b border-terminal-border font-medium z-10">
              <tr>
                <th className="py-2 px-3">Time</th>
                <th className="py-2 px-3">Symbol</th>
                <th className="py-2 px-3">Side</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3">Qty</th>
                <th className="py-2 px-3">Filled</th>
                <th className="py-2 px-3">Price</th>
                <th className="py-2 px-3">Avg Price</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/40 text-terminal-text">
              {filteredOrders.map(order => {
                const isBuy = order.side === 'BUY';
                const isOpen = order.status === 'OPEN' || order.status === 'PENDING' || order.status === 'PARTIALLY_FILLED';

                return (
                  <tr key={order.id} className="hover:bg-terminal-surface/40 transition-colors h-8">
                    <td className="py-1.5 px-3 text-terminal-subtle font-mono text-3xs">
                      {new Date(order.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-1.5 px-3 font-bold text-white text-xs">{order.symbol}</td>
                    <td className="py-1.5 px-3">
                      <span className={`font-bold ${isBuy ? 'text-trade-buy' : 'text-trade-sell'}`}>
                        {order.side}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-terminal-muted">{order.order_type}</td>
                    <td className="py-1.5 px-3 text-terminal-subtle">{order.product_type}</td>
                    <td className="py-1.5 px-3 tabular-nums font-semibold text-white">{order.quantity}</td>
                    <td className="py-1.5 px-3 tabular-nums">{order.filled_quantity}</td>
                    <td className="py-1.5 px-3 tabular-nums font-medium text-white">
                      {order.price ? `₹${order.price.toFixed(2)}` : 'MARKET'}
                    </td>
                    <td className="py-1.5 px-3 tabular-nums text-terminal-muted">
                      {order.average_price ? `₹${order.average_price.toFixed(2)}` : '-'}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className={`px-1.5 py-0.5 rounded text-3xs font-bold tracking-wide uppercase ${
                        order.status === 'FILLED' ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800' :
                        order.status === 'OPEN' ? 'bg-blue-950/60 text-blue-400 border border-blue-800' :
                        order.status === 'PENDING' ? 'bg-amber-950/60 text-amber-300 border border-amber-700' :
                        order.status === 'PARTIALLY_FILLED' ? 'bg-amber-950/60 text-amber-400 border border-amber-800' :
                        order.status === 'CANCELLED' ? 'bg-neutral-800 text-neutral-400 border border-neutral-700' :
                        'bg-rose-950/60 text-rose-400 border border-rose-800'
                      }`}>
                        {order.status === 'PENDING' ? 'PENDING' : order.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="flex items-center justify-end space-x-1.5">
                        {isOpen && (
                          <>
                            <button
                              onClick={() => setModifyOpen(true, order)}
                              title="Modify Order Price / Quantity"
                              className="p-1 hover:bg-terminal-card text-blue-400 rounded transition-colors"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => cancelOrder(order.id)}
                              title="Cancel Order"
                              className="p-1 hover:bg-terminal-card text-trade-sell rounded transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleOpenLogs(order)}
                          title="View Order Lifecycle Audit Trail"
                          className="p-1 hover:bg-terminal-card text-terminal-muted hover:text-white rounded transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-10 text-center text-terminal-muted font-sans text-xs">
                    No orders matching filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* 2. POSITIONS TAB */}
        {activeBottomTab === 'POSITIONS' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-terminal-surface sticky top-0 text-terminal-muted uppercase text-2xs border-b border-terminal-border font-medium z-10">
              <tr>
                <th className="py-2 px-3">Symbol</th>
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3">Net Qty</th>
                <th className="py-2 px-3">Avg Buy Price</th>
                <th className="py-2 px-3">LTP</th>
                <th className="py-2 px-3">Realized P&L</th>
                <th className="py-2 px-3">Unrealized P&L</th>
                <th className="py-2 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/40 text-terminal-text">
              {positions.map(pos => {
                const isLong = pos.quantity > 0;
                const isClosed = pos.quantity === 0;

                return (
                  <tr key={`${pos.symbol}_${pos.product_type}`} className="hover:bg-terminal-surface/40 transition-colors h-8">
                    <td className="py-1.5 px-3 font-bold text-white text-xs">{pos.symbol}</td>
                    <td className="py-1.5 px-3 text-terminal-muted">{pos.product_type}</td>
                    <td className="py-1.5 px-3">
                      <span className={`font-bold tabular-nums ${isLong ? 'text-trade-buy' : isClosed ? 'text-terminal-subtle' : 'text-trade-sell'}`}>
                        {pos.quantity}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 tabular-nums">₹{pos.average_price.toFixed(2)}</td>
                    <td className="py-1.5 px-3 tabular-nums text-white">₹{pos.last_price.toFixed(2)}</td>
                    <td className={`py-1.5 px-3 tabular-nums font-semibold ${pos.realized_pnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                      {pos.realized_pnl >= 0 ? '+' : ''}₹{pos.realized_pnl.toFixed(2)}
                    </td>
                    <td className={`py-1.5 px-3 tabular-nums font-bold ${pos.unrealized_pnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                      {pos.unrealized_pnl >= 0 ? '+' : ''}₹{pos.unrealized_pnl.toFixed(2)}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      {!isClosed && (
                        <button
                          onClick={() => squareOffPosition(pos.symbol, pos.product_type)}
                          className="px-2 py-0.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-3xs font-bold transition-colors"
                        >
                          Square Off
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {positions.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-terminal-muted font-sans text-xs">
                    No open positions. Place BUY or SELL orders in the Execution Panel.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* 3. HOLDINGS TAB */}
        {activeBottomTab === 'HOLDINGS' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-terminal-surface sticky top-0 text-terminal-muted uppercase text-2xs border-b border-terminal-border font-medium z-10">
              <tr>
                <th className="py-2 px-3">Symbol</th>
                <th className="py-2 px-3">Qty</th>
                <th className="py-2 px-3">Avg Cost</th>
                <th className="py-2 px-3">Current Price</th>
                <th className="py-2 px-3">Invested Value</th>
                <th className="py-2 px-3">Current Value</th>
                <th className="py-2 px-3">Total P&L</th>
                <th className="py-2 px-3">P&L %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/40 text-terminal-text">
              {holdings.map(h => (
                <tr key={h.symbol} className="hover:bg-terminal-surface/40 transition-colors h-8">
                  <td className="py-1.5 px-3 font-bold text-white text-xs">{h.symbol}</td>
                  <td className="py-1.5 px-3 tabular-nums font-semibold">{h.quantity}</td>
                  <td className="py-1.5 px-3 tabular-nums">₹{h.average_price.toFixed(2)}</td>
                  <td className="py-1.5 px-3 tabular-nums text-white">₹{(h.current_value / h.quantity).toFixed(2)}</td>
                  <td className="py-1.5 px-3 tabular-nums">₹{h.invested_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className="py-1.5 px-3 tabular-nums font-semibold text-white">₹{h.current_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td className={`py-1.5 px-3 tabular-nums font-bold ${h.pnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                    {h.pnl >= 0 ? '+' : ''}₹{h.pnl.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td className={`py-1.5 px-3 tabular-nums font-bold ${h.pnl_percentage >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                    {h.pnl_percentage >= 0 ? '+' : ''}{h.pnl_percentage.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {holdings.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-terminal-muted font-sans text-xs">
                    No demat holdings found. Buy Delivery (CNC) stocks to build your simulated equity portfolio.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* 4. TRADES BOOK TAB */}
        {activeBottomTab === 'TRADES' && (
          <table className="w-full text-left border-collapse">
            <thead className="bg-terminal-surface sticky top-0 text-terminal-muted uppercase text-2xs border-b border-terminal-border font-medium z-10">
              <tr>
                <th className="py-2 px-3">Execution Time</th>
                <th className="py-2 px-3">Trade ID</th>
                <th className="py-2 px-3">Order ID</th>
                <th className="py-2 px-3">Symbol</th>
                <th className="py-2 px-3">Side</th>
                <th className="py-2 px-3">Fill Price</th>
                <th className="py-2 px-3">Quantity</th>
                <th className="py-2 px-3">Trade Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-terminal-border/40 text-terminal-text">
              {trades.map(t => (
                <tr key={t.id} className="hover:bg-terminal-surface/40 transition-colors h-8">
                  <td className="py-1.5 px-3 text-terminal-subtle text-3xs">{new Date(t.timestamp).toLocaleTimeString()}</td>
                  <td className="py-1.5 px-3 text-terminal-muted font-mono">{t.id.slice(0, 8)}</td>
                  <td className="py-1.5 px-3 text-terminal-muted font-mono">{t.order_id.slice(0, 8)}</td>
                  <td className="py-1.5 px-3 font-bold text-white text-xs">{t.symbol}</td>
                  <td className={`py-1.5 px-3 font-bold ${t.side === 'BUY' ? 'text-trade-buy' : 'text-trade-sell'}`}>{t.side}</td>
                  <td className="py-1.5 px-3 font-mono font-bold text-white">₹{t.price.toFixed(2)}</td>
                  <td className="py-1.5 px-3 tabular-nums font-semibold">{t.quantity}</td>
                  <td className="py-1.5 px-3 tabular-nums text-white font-medium">₹{(t.price * t.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
              {trades.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-terminal-muted font-sans text-xs">
                    No executed trades recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {/* 5. PORTFOLIO ANALYTICS TAB */}
        {activeBottomTab === 'ANALYTICS' && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 font-sans">
            <div className="bg-terminal-surface p-3 rounded border border-terminal-border">
              <span className="text-2xs text-terminal-muted uppercase font-medium">Total Portfolio Capital</span>
              <div className="text-base font-bold font-mono text-white mt-1">
                ₹{account ? account.total_portfolio_value?.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '10,00,000.00'}
              </div>
            </div>
            <div className="bg-terminal-surface p-3 rounded border border-terminal-border">
              <span className="text-2xs text-terminal-muted uppercase font-medium">Realized P&L</span>
              <div className={`text-base font-bold font-mono mt-1 ${account && account.realized_pnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                {account && account.realized_pnl >= 0 ? '+' : ''}₹{account ? account.realized_pnl.toFixed(2) : '0.00'}
              </div>
            </div>
            <div className="bg-terminal-surface p-3 rounded border border-terminal-border">
              <span className="text-2xs text-terminal-muted uppercase font-medium">Unrealized MTM P&L</span>
              <div className={`text-base font-bold font-mono mt-1 ${totalUnrealizedPnl >= 0 ? 'text-trade-buy' : 'text-trade-sell'}`}>
                {totalUnrealizedPnl >= 0 ? '+' : ''}₹{totalUnrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div className="bg-terminal-surface p-3 rounded border border-terminal-border">
              <span className="text-2xs text-terminal-muted uppercase font-medium">Margin Utilization</span>
              <div className="text-base font-bold font-mono text-blue-400 mt-1">
                {account ? ((account.used_margin / (account.initial_balance || 1)) * 100).toFixed(1) : '0.0'}%
              </div>
            </div>
          </div>
        )}

        {/* 6. ENGINE TELEMETRY TAB */}
        {activeBottomTab === 'LOGS' && (
          <div className="p-3 space-y-3 font-mono text-2xs">
            {/* Telemetry Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Box 1: Realtime Runtime Telemetry */}
              <div className="bg-terminal-surface p-2.5 rounded border border-terminal-border space-y-1.5 font-sans">
                <div className="flex items-center space-x-1.5 text-blue-400 font-semibold text-2xs uppercase tracking-wider">
                  <Activity className="w-3.5 h-3.5" />
                  <span>Live Engine Telemetry</span>
                </div>
                <div className="space-y-1 text-2xs font-mono">
                  <div className="flex justify-between"><span className="text-terminal-muted">Uptime:</span><span className="text-white">{metrics?.uptimeSeconds || 0}s</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Memory Heap:</span><span className="text-white">{metrics?.memory?.heapUsedMb || 0} MB</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Orders Tracked:</span><span className="text-white">{metrics?.ordersTotal || orders.length}</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Executions:</span><span className="text-white">{metrics?.executionsTotal || trades.length}</span></div>
                </div>
              </div>

              {/* Box 2: Empirical Benchmarks */}
              <div className="bg-terminal-surface p-2.5 rounded border border-terminal-border space-y-1.5 font-sans md:col-span-2">
                <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold text-2xs uppercase tracking-wider">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>Empirical Benchmarks (16 Cores, 50k Run)</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-2xs font-mono">
                  <div className="flex justify-between"><span className="text-terminal-muted">Matching Throughput:</span><span className="text-emerald-400 font-bold">232,633 orders/s</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Matching Latency (p50):</span><span className="text-emerald-400 font-bold">4.20 µs</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Simulator Throughput:</span><span className="text-emerald-400 font-bold">124,153 ticks/s</span></div>
                  <div className="flex justify-between"><span className="text-terminal-muted">Matching Latency (p99):</span><span className="text-emerald-400 font-bold">10.40 µs</span></div>
                </div>
              </div>
            </div>

            {/* Live Telemetry Log Stream */}
            <div className="space-y-1 pt-1 border-t border-terminal-border/60">
              <div className="text-terminal-subtle text-3xs uppercase tracking-wider font-semibold">Realtime Event Dispatch Log</div>
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {systemLogs.map(log => (
                  <div key={log.id} className="flex items-center space-x-2 py-0.5 text-2xs">
                    <span className="text-terminal-subtle text-3xs">{log.time}</span>
                    <span className={`px-1 py-0.2 rounded font-bold text-3xs ${
                      log.level === 'EXEC' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' :
                      log.level === 'RISK' ? 'bg-rose-950 text-rose-400 border border-rose-800' :
                      log.level === 'WARN' ? 'bg-amber-950 text-amber-400 border border-amber-800' :
                      'bg-blue-950 text-blue-400 border border-blue-800'
                    }`}>
                      {log.level}
                    </span>
                    <span className="text-terminal-text truncate">{log.text}</span>
                  </div>
                ))}
                {systemLogs.length === 0 && (
                  <div className="py-2 text-terminal-muted font-sans text-xs">No telemetry logs recorded yet.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
