import React, { useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { X, Edit2, AlertCircle } from 'lucide-react';

export const ModifyOrderModal: React.FC = () => {
  const { isModifyOpen, setModifyOpen, selectedOrderForModify, modifyOrder } = useTerminalStore();

  const [price, setPrice] = useState(selectedOrderForModify?.price || 0);
  const [qty, setQty] = useState(selectedOrderForModify?.quantity || 1);

  if (!isModifyOpen || !selectedOrderForModify) return null;

  const handleModify = async () => {
    await modifyOrder(selectedOrderForModify.id, price, qty);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-terminal-panel border border-terminal-border rounded-lg shadow-2xl overflow-hidden p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-terminal-border pb-2">
          <div className="flex items-center space-x-2">
            <Edit2 className="w-4 h-4 text-blue-400" />
            <span className="font-bold text-sm text-white">Modify Order: {selectedOrderForModify.symbol}</span>
          </div>
          <button
            onClick={() => setModifyOpen(false)}
            className="p-1 text-terminal-muted hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 font-mono text-xs">
          <div>
            <label className="text-2xs text-terminal-muted uppercase font-semibold block mb-1">
              Quantity (Filled: {selectedOrderForModify.filled_quantity})
            </label>
            <input
              type="number"
              min={selectedOrderForModify.filled_quantity + 1}
              value={qty}
              onChange={(e) => setQty(parseInt(e.target.value) || 1)}
              className="w-full h-8 bg-terminal-surface border border-terminal-border rounded px-2.5 text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-2xs text-terminal-muted uppercase font-semibold block mb-1">
              Limit Price
            </label>
            <input
              type="number"
              step="0.05"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
              className="w-full h-8 bg-terminal-surface border border-terminal-border rounded px-2.5 text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-terminal-border flex space-x-2">
          <button
            onClick={() => setModifyOpen(false)}
            className="flex-1 py-1.5 rounded bg-terminal-surface hover:bg-terminal-card border border-terminal-border text-terminal-muted text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleModify}
            className="flex-1 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};
