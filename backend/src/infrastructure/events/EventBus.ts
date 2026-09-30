import { EventEmitter } from 'events';
import { Order, Execution, Position, Holding, Account, Tick, MarketDepth } from '../../types/index.js';

export type DomainEventType =
  | 'ORDER_ACCEPTED'
  | 'ORDER_REJECTED'
  | 'ORDER_MATCHED'
  | 'TRADE_EXECUTED'
  | 'ORDER_CANCELLED'
  | 'ORDER_MODIFIED'
  | 'POSITION_UPDATED'
  | 'PORTFOLIO_UPDATED'
  | 'TICK_GENERATED'
  | 'DEPTH_UPDATED';

export interface DomainEvent<T = any> {
  type: DomainEventType;
  payload: T;
  timestamp: number;
  correlationId?: string;
}

export class EventBus extends EventEmitter {
  public publish<T>(type: DomainEventType, payload: T, correlationId?: string) {
    const event: DomainEvent<T> = {
      type,
      payload,
      timestamp: Date.now(),
      correlationId
    };
    this.emit(type, event);
    this.emit('*', event);
  }

  public subscribe<T>(type: DomainEventType | '*', handler: (event: DomainEvent<T>) => void) {
    this.on(type, handler);
  }
}
