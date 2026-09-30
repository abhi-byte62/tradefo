-- TradeForge Relational Database Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS instruments (
    symbol VARCHAR(32) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    exchange VARCHAR(16) NOT NULL,
    instrument_type VARCHAR(16) NOT NULL,
    tick_size NUMERIC(10, 4) NOT NULL,
    lot_size INT NOT NULL DEFAULT 1,
    base_price NUMERIC(15, 4) NOT NULL,
    lower_circuit NUMERIC(15, 4) NOT NULL,
    upper_circuit NUMERIC(15, 4) NOT NULL,
    segment VARCHAR(32) NOT NULL
);

CREATE TABLE IF NOT EXISTS accounts (
    user_id VARCHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    cash_balance NUMERIC(18, 2) NOT NULL DEFAULT 1000000.00,
    available_margin NUMERIC(18, 2) NOT NULL DEFAULT 1000000.00,
    used_margin NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    unrealized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    initial_balance NUMERIC(18, 2) NOT NULL DEFAULT 1000000.00,
    currency VARCHAR(8) NOT NULL DEFAULT 'INR',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id VARCHAR(36) PRIMARY KEY,
    client_order_id VARCHAR(64),
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL REFERENCES instruments(symbol),
    side VARCHAR(8) NOT NULL, -- BUY, SELL
    order_type VARCHAR(24) NOT NULL, -- MARKET, LIMIT, STOP_LOSS, STOP_LOSS_LIMIT
    product_type VARCHAR(16) NOT NULL, -- INTRADAY, DELIVERY
    quantity INT NOT NULL,
    filled_quantity INT NOT NULL DEFAULT 0,
    remaining_quantity INT NOT NULL,
    price NUMERIC(15, 2),
    trigger_price NUMERIC(15, 2),
    average_price NUMERIC(15, 2),
    status VARCHAR(24) NOT NULL, -- NEW, PENDING, OPEN, PARTIALLY_FILLED, FILLED, CANCELLED, REJECTED
    reject_reason VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    version INT NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_symbol ON orders(symbol);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS executions (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL REFERENCES instruments(symbol),
    side VARCHAR(8) NOT NULL,
    price NUMERIC(15, 2) NOT NULL,
    quantity INT NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    maker_order_id VARCHAR(36),
    taker_order_id VARCHAR(36)
);

CREATE INDEX IF NOT EXISTS idx_executions_user_id ON executions(user_id);
CREATE INDEX IF NOT EXISTS idx_executions_order_id ON executions(order_id);

CREATE TABLE IF NOT EXISTS positions (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL REFERENCES instruments(symbol),
    product_type VARCHAR(16) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    buy_quantity INT NOT NULL DEFAULT 0,
    sell_quantity INT NOT NULL DEFAULT 0,
    buy_value NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    sell_value NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    average_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    realized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    unrealized_pnl NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    last_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_symbol_product UNIQUE (user_id, symbol, product_type)
);

CREATE TABLE IF NOT EXISTS holdings (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL REFERENCES instruments(symbol),
    quantity INT NOT NULL DEFAULT 0,
    average_price NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
    invested_value NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    current_value NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    pnl NUMERIC(18, 2) NOT NULL DEFAULT 0.00,
    pnl_percentage NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_symbol_holding UNIQUE (user_id, symbol)
);

CREATE TABLE IF NOT EXISTS watchlists (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(64) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS watchlist_items (
    watchlist_id VARCHAR(36) NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL REFERENCES instruments(symbol),
    PRIMARY KEY (watchlist_id, symbol)
);

CREATE TABLE IF NOT EXISTS order_audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    order_id VARCHAR(36) NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    event VARCHAR(64) NOT NULL,
    details JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
