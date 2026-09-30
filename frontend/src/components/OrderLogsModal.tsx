import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { X, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

export const OrderLogsModal: React.FC = () => {
  const { isLogsOpen, setLogsOpen, selectedOrderForLogs } = useTerminalStore();

  if (!isLogsOpen || !selectedOrderForLogs) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-lg bg-terminal-panel border border-terminal-border rounded-lg shadow-2xl overflow-hidden p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-terminal-border pb-2">
          <div className="flex items-center space-x-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm text-white">Order Lifecycle Audit Trail</span>
          </div>
          <button
            onClick={() => setLogsOpen(false)}
            className="p-1 text-terminal-muted hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-3 font-mono text-xs">
          {selectedOrderForLogs.map((log, idx) => (
            <div key={log.id} className="relative pl-6 pb-2 border-l border-terminal-border last:border-none">
              <div className="absolute -left-1.5 top-0.5 w-3 h-3 rounded-full bg-blue-500 border-2 border-terminal-panel" />
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-2xs uppercase tracking-wider">{log.event}</span>
                <span className="text-2xs text-terminal-subtle">{new Date(log.timestamp).toLocaleTimeString()}</span>
              </div>
              <div className="text-2xs text-terminal-muted bg-terminal-surface p-2 rounded mt-1 border border-terminal-border/60">
                <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
              </div>
            </div>
          ))}

          {selectedOrderForLogs.length === 0 && (
            <div className="text-center py-6 text-terminal-muted font-sans text-xs">
              No audit logs captured for this order.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
