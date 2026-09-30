import React, { useState } from 'react';
import { useTerminalStore } from '../store/useTerminalStore';
import { ApiClient } from '../services/api';
import { X, Lock, Mail, User, ShieldCheck, Zap } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { isAuthModalOpen, setAuthModalOpen, setAuth } = useTerminalStore();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('trader@tradeforge.io');
  const [password, setPassword] = useState('password123');
  const [name, setName] = useState('Alpha Trader');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isAuthModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        const data = await ApiClient.register(email, name, password);
        setAuth(data.user, data.token, data.account);
      } else {
        const data = await ApiClient.login(email, password);
        setAuth(data.user, data.token, data.account);
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await ApiClient.login('trader@tradeforge.io', 'password123');
      setAuth(data.user, data.token, data.account);
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-sm bg-terminal-panel border border-terminal-border rounded-lg shadow-2xl overflow-hidden p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-terminal-border pb-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5 h-5 text-trade-buy" />
            <span className="font-bold text-base text-white">
              {isRegister ? 'Create TradeForge Account' : 'Sign In to TradeForge'}
            </span>
          </div>
          <button
            onClick={() => setAuthModalOpen(false)}
            className="p-1 text-terminal-muted hover:text-white rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 1-Click Fast Demo Login Button */}
        {!isRegister && (
          <button
            onClick={handleDemoLogin}
            disabled={loading}
            className="w-full py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded shadow flex items-center justify-center space-x-2 transition-all"
          >
            <Zap className="w-4 h-4 text-amber-300" />
            <span>1-Click Instant Demo Login (₹10L Capital)</span>
          </button>
        )}

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-terminal-border"></div>
          <span className="flex-shrink mx-2 text-2xs text-terminal-subtle uppercase">Or standard login</span>
          <div className="flex-grow border-t border-terminal-border"></div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3 font-sans text-xs">
          {isRegister && (
            <div>
              <label className="text-2xs text-terminal-muted uppercase font-semibold block mb-1">Full Name</label>
              <div className="relative flex items-center">
                <User className="w-3.5 h-3.5 text-terminal-subtle absolute left-2.5" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full h-8 bg-terminal-surface border border-terminal-border rounded pl-8 pr-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-2xs text-terminal-muted uppercase font-semibold block mb-1">Email</label>
            <div className="relative flex items-center">
              <Mail className="w-3.5 h-3.5 text-terminal-subtle absolute left-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-8 bg-terminal-surface border border-terminal-border rounded pl-8 pr-2 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-2xs text-terminal-muted uppercase font-semibold block mb-1">Password</label>
            <div className="relative flex items-center">
              <Lock className="w-3.5 h-3.5 text-terminal-subtle absolute left-2.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-8 bg-terminal-surface border border-terminal-border rounded pl-8 pr-2 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-2 bg-red-950/40 border border-red-800/50 rounded text-trade-sell text-2xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 bg-trade-buy hover:bg-trade-buyHover text-black text-xs font-bold rounded shadow transition-colors mt-2"
          >
            {loading ? 'Processing...' : isRegister ? 'Register & Start Paper Trading' : 'Sign In'}
          </button>
        </form>

        {/* Footer Toggle */}
        <div className="text-center pt-2 border-t border-terminal-border">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-2xs text-blue-400 hover:underline"
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
      </div>
    </div>
  );
};
