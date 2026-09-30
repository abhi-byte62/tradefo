import React from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { X, Command, Keyboard } from 'lucide-react';

export const KeyboardShortcutsModal: React.FC = () => {
  const { isShortcutsOpen, setShortcutsOpen } = useTerminalStore();

  if (!isShortcutsOpen) return null;

  const shortcuts = [
    { key: '/', desc: 'Open Symbol Global Search Palette' },
    { key: 'B', desc: 'Select BUY Order Mode' },
    { key: 'S', desc: 'Select SELL Order Mode' },
    { key: '1', desc: 'Switch Bottom Console to Orders Tab' },
    { key: '2', desc: 'Switch Bottom Console to Positions Tab' },
    { key: '3', desc: 'Switch Bottom Console to Holdings Tab' },
    { key: '4', desc: 'Switch Bottom Console to Trade Book' },
    { key: '5', desc: 'Switch Bottom Console to Telemetry Logs' },
    { key: '?', desc: 'Show / Hide Keyboard Shortcuts' },
    { key: 'Esc', desc: 'Close any active modal or search' }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-terminal-panel border border-terminal-border rounded-lg shadow-2xl overflow-hidden p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-terminal-border pb-2">
          <div className="flex items-center space-x-2">
            <Keyboard className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm text-white">Terminal Keyboard Shortcuts</span>
          </div>
          <button
            onClick={() => setShortcutsOpen(false)}
            className="p-1 text-terminal-muted hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2 font-mono text-xs">
          {shortcuts.map((sc, i) => (
            <div key={i} className="flex items-center justify-between p-2 rounded bg-terminal-surface border border-terminal-border/50">
              <span className="text-terminal-muted font-sans">{sc.desc}</span>
              <kbd className="bg-terminal-bg border border-terminal-border px-2 py-0.5 rounded text-xs text-blue-400 font-bold">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
