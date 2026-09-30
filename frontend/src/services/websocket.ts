import { Tick, Order, Position, Account } from '../types';

export type WsStatus = 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectDelay = 10000;
  private isExplicitlyClosed = false;
  private subscribedSymbols: Set<string> = new Set();
  private listeners: Map<string, Set<(data: any) => void>> = new Map();
  private statusListeners: Set<(status: WsStatus) => void> = new Set();
  private status: WsStatus = 'DISCONNECTED';

  constructor(url?: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    this.url = url || `${protocol}//${host}/ws`;
  }

  public connect(token?: string) {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.setStatus('CONNECTING');

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus('CONNECTED');

        // Authenticate if token provided
        if (token) {
          this.send({ type: 'AUTH', token });
        }

        // Resubscribe symbols
        if (this.subscribedSymbols.size > 0) {
          this.send({
            type: 'SUBSCRIBE',
            symbols: Array.from(this.subscribedSymbols)
          });
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.emit(msg.type, msg.data);
        } catch (err) {
          console.error('[WS] Message parse error', err);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('DISCONNECTED');
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect(token);
        }
      };

      this.ws.onerror = (err) => {
        console.warn('[WS] Connection error', err);
        this.setStatus('ERROR');
      };
    } catch (err) {
      this.setStatus('ERROR');
      this.scheduleReconnect(token);
    }
  }

  private setStatus(newStatus: WsStatus) {
    this.status = newStatus;
    this.statusListeners.forEach(fn => fn(newStatus));
  }

  public onStatusChange(callback: (status: WsStatus) => void) {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => this.statusListeners.delete(callback);
  }

  private scheduleReconnect(token?: string) {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => {
      if (!this.isExplicitlyClosed) {
        this.connect(token);
      }
    }, delay);
  }

  public subscribeSymbols(symbols: string[]) {
    symbols.forEach(s => this.subscribedSymbols.add(s));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'SUBSCRIBE', symbols });
    }
  }

  public unsubscribeSymbols(symbols: string[]) {
    symbols.forEach(s => this.subscribedSymbols.delete(s));
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'UNSUBSCRIBE', symbols });
    }
  }

  public authenticate(token: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: 'AUTH', token });
    }
  }

  public on<T = any>(event: string, callback: (data: T) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(fn => fn(data));
    }
  }

  private send(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsClient = new WebSocketClient();
