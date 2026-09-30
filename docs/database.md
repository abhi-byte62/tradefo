# Database Design & Persistence Architecture

## Schema Overview

TradeForge models financial entities with PostgreSQL relational integrity:

* **`users`**: Unique email, hashed credentials (bcrypt), creation timestamp.
* **`accounts`**: Cash balance, available margin, used margin, realized P&L, initial virtual balance.
* **`instruments`**: Symbol, exchange, tick size, lot size, circuit collar bounds.
* **`orders`**: Full order record, client idempotency key, product type, status, fill quantities, timestamps.
* **`executions`**: Immutable trade executions, execution price, trade volume, maker/taker IDs.
* **`positions`**: Net open positions, buy/sell values, weighted average purchase cost, mark-to-market unrealized P&L.
* **`holdings`**: Delivery investments, invested capital, current valuation, aggregate P&L.
* **`watchlists` & `watchlist_items`**: Custom user watchlists and symbol associations.
* **`order_audit_logs`**: Lifecycle state audit events with JSON metadata payloads.

---

## Indexing Strategy

* `CREATE INDEX idx_orders_user_id ON orders(user_id);`
* `CREATE INDEX idx_orders_symbol ON orders(symbol);`
* `CREATE INDEX idx_orders_status ON orders(status);`
* `CREATE INDEX idx_orders_created_at ON orders(created_at DESC);`
* `CREATE INDEX idx_executions_user_id ON executions(user_id);`
* `CREATE INDEX idx_executions_order_id ON executions(order_id);`
