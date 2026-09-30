# TradeForge
### Real-Time Paper Trading & Market Simulation Platform

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/)
[![Tests](https://img.shields.io/badge/tests-21%2F21%20passing-brightgreen.svg)](https://github.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue.svg)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)

TradeForge is a modular, high-performance web-based paper trading platform and market simulator. It features an in-memory double-sided order book with deterministic price-time priority matching, synchronous pre-trade risk evaluation, stochastic market simulation, and a responsive trading terminal.

---

## Table of Contents
1. [Overview](#1-overview)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Order Lifecycle](#4-order-lifecycle)
5. [Matching Engine](#5-matching-engine)
6. [Risk Engine](#6-risk-engine)
7. [Market Simulator](#7-market-simulator)
8. [WebSocket Architecture](#8-websocket-architecture)
9. [Persistence & Recovery](#9-persistence--recovery)
10. [Performance & Benchmarks](#10-performance--benchmarks)
11. [Testing & Verification](#11-testing--verification)
12. [Security & Isolation](#12-security--isolation)
13. [Terminal Interface](#13-terminal-interface)
14. [Local Setup](#14-local-setup)
15. [Environment Variables](#15-environment-variables)
16. [Known Limitations](#16-known-limitations)
17. [Future Work](#17-future-work)

---

## 1. Overview

TradeForge provides an environment for simulating electronic trading workflows:
* **Deterministic Matching**: In-memory FIFO double-sided limit order book.
* **Pre-Trade Risk Controls**: Real-time margin checking, 5x intraday leverage calculation, and circuit limit bounds.
* **Stochastic Market Dynamics**: Geometric Brownian Motion (GBM) with mean-reversion drift and Poisson jump diffusion.
* **Trading Terminal**: Canvas-based candlestick charting, Level-2 market depth ladder, and synchronized order execution.

---

## 2. Features

* **Multi-Order Support**: `MARKET`, `LIMIT`, `STOP_LOSS` (SL-M), and `STOP_LOSS_LIMIT` (SL-L).
* **Product Types**: Intraday ($5\times$ MIS leverage) and Delivery ($100\%$ CNC upfront cash).
* **Real-Time Level 2 Depth**: 5-level Bid and Ask depth ladder with liquidity distribution bars and spread calculation.
* **Position & P&L Engine**: Real-time Mark-to-Market (MTM) calculation, weighted average buy price updates, and square-off execution.
* **Audit Trail**: Every state transition is recorded in an immutable order audit log.
* **Paper-Trading Clarity**: Visual simulation badges (`PAPER TERMINAL`, `SIM MARKET LIVE`) to distinguish virtual simulated execution.

---

## 3. Architecture

```text
                  ┌─────────────────────────────────────────┐
                  │          React / TypeScript UI          │
                  │    (Tailwind CSS, Canvas Chart, L2)     │
                  └────────────────────┬────────────────────┘
                                       │
                         REST API / Native WebSocket
                                       │
                                       ▼
                  ┌─────────────────────────────────────────┐
                  │        Express API & WS Router          │
                  └───────┬─────────────────────────┬───────┘
                          │                         │
                          ▼                         ▼
         ┌──────────────────────────────┐  ┌──────────────────┐
         │       OrderService           │  │ Market Simulator │
         └───────┬──────────────┬───────┘  │  (GBM + OU Drift)│
                 │              │          └────────┬─────────┘
                 ▼              ▼                   │
        ┌──────────────┐  ┌──────────────┐          │
        │  RiskEngine  │  │  EventBus    │◄─────────┘
        │(Margin/Rules)│  │ (Pub/Sub)    │
        └────────┬─────┘  └──────┬───────┘
                 │               │
                 ▼               ▼
        ┌────────────────────────────────┐
        │   Matching Engine (FIFO LOB)   │
        └────────────────┬───────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │       Persistence Layer        │
        │ (PostgreSQL / In-Memory Fallback)│
        └────────────────────────────────┘
```

* **Source of Truth Audit**:
  * **Orders & Executions**: Authoritative domain state persisted to PostgreSQL (with high-performance in-memory relational store fallback).
  * **Positions & Accounts**: Authoritative ledger updated atomically on each trade execution.
  * **Order Book**: High-performance in-memory double-sided matching state.
  * **Market Ticks**: Generated continuously in-memory by the stochastic simulator.
  * **WebSocket**: Transport layer broadcasting filtered topic streams.

---

## 4. Order Lifecycle

```mermaid
stateDiagram-v2
    [*] --> NEW
    NEW --> REJECTED: Risk Check Failed
    NEW --> PENDING: Risk Check Passed
    
    PENDING --> TRIGGER_PENDING: Stop-Loss (SL-M / SL-L)
    TRIGGER_PENDING --> OPEN: Trigger Hit (Limit)
    TRIGGER_PENDING --> FILLED: Trigger Hit (Market)
    TRIGGER_PENDING --> CANCELLED: Cancelled
    
    PENDING --> OPEN: Resting Limit
    PENDING --> FILLED: Immediate Aggressive Fill
    
    OPEN --> PARTIALLY_FILLED: Partial Match
    OPEN --> FILLED: Full Match
    OPEN --> CANCELLED: User Cancellation
    
    PARTIALLY_FILLED --> FILLED: Remaining Matched
    PARTIALLY_FILLED --> CANCELLED: Remaining Cancelled
    
    FILLED --> [*]
    CANCELLED --> [*]
    REJECTED --> [*]
```

Detailed lifecycle specifications and transition rules are documented in [`docs/order-lifecycle.md`](docs/order-lifecycle.md).

---

## 5. Matching Engine

TradeForge implements a deterministic Price-Time Priority (FIFO) continuous matching engine:
* **Bids**: Sorted descending by price.
* **Asks**: Sorted ascending by price.
* **Direct Order Index**: Hash map index for $O(1)$ order cancellations and queue lookups.
* **Multi-Level Fills**: Taker orders traverse multiple price levels, calculating weighted average fill prices (VWAP).

Detailed specifications are available in [`docs/matching-engine.md`](docs/matching-engine.md).

---

## 6. Risk Engine

Synchronous pre-trade risk evaluation occurs before orders enter the matching book:
1. **Available Margin**: Asserts $\text{Required Margin} \le \text{Available Margin}$ ($5\times$ MIS leverage, $1\times$ CNC).
2. **Circuit Limits**: Rejects orders outside the $\pm 10\%$ price band.
3. **Tick Size**: Enforces valid ₹0.05 increments.
4. **Idempotency**: Prevents duplicate order execution on repeated client submissions.

Detailed risk specifications are available in [`docs/risk-engine.md`](docs/risk-engine.md).

---

## 7. Market Simulator

The stochastic simulator synthesizes realistic tick trajectories using:
$$dS_t = \theta (\mu - S_t) dt + \sigma S_t dW_t + J_t dN_t$$
* **Deterministic Seeds**: Enables 100% reproducible price sequences for unit testing.
* **L2 Depth Synthesis**: Generates power-law depth distributions for bids and asks around the simulated LTP.

Detailed simulator documentation is available in [`docs/market-simulator.md`](docs/market-simulator.md).

---

## 8. WebSocket Architecture

* **Endpoint**: `ws://localhost:8080/ws`
* **Topic Routing**:
  * Public: `TICK`, `DEPTH` (filtered by subscribed symbols).
  * Private: `ORDER_UPDATE`, `POSITION_UPDATE`, `PORTFOLIO_UPDATE`, `TRADE_TAPE` (authenticated by JWT).
* **Automatic Recovery**: Auto-reconnects with exponential backoff and restores active subscriptions upon reconnection.

Detailed WebSocket documentation is available in [`docs/websocket.md`](docs/websocket.md).

---

## 9. Persistence & Recovery

TradeForge supports dual persistence modes:
* **PostgreSQL Mode**: Stores user accounts, orders, positions, holdings, and audit logs with transactional consistency.
* **In-Memory Resilient Store**: Automatic zero-configuration fallback if PostgreSQL is unavailable during development or testing.

---

## 10. Performance & Benchmarks

Measured on a local 16-core system (13th Gen Intel Core i5-13450HX, Node.js v24.13.0):

```text
======================================================
⚡ TRADEFORGE PERFORMANCE BENCHMARK
======================================================
Matching Engine Throughput:   247,133 orders/sec
Matching Latency (p50):       4.10 µs
Matching Latency (p95):       6.60 µs
Matching Latency (p99):       10.90 µs
Market Simulator Throughput:  119,899 ticks/sec
======================================================
```

> **Note**: This benchmark measures the in-memory matching algorithm and excludes network, JSON serialization, and database persistence latency.

To reproduce:
```bash
npm --prefix backend run benchmark
```

---

## 11. Testing & Verification

The test suite contains 21 unit/integration tests and an end-to-end verification scenario:
* **Matching Engine**: Price-time priority, maker/taker fills, cancellations, multi-level fills, VWAP calculation.
* **Risk Engine**: Margin breaches, circuit limit breaches, tick fractions, leverage calculations.
* **Portfolio Engine**: Long/short accounting, realized P&L, Mark-to-Market unrealized P&L.
* **Determinism**: Seeded stochastic simulation paths.
* **Idempotency**: Duplicate order deduplication.
* **Multi-Tenant Security**: Rejection of unauthorized order cancellation.

Run tests:
```bash
npm --prefix backend test
npx tsx backend/test/e2e-freeze-qa.ts
```

---

## 12. Security & Isolation

* **JWT Authentication**: Stateless token verification on API and WebSocket connections.
* **Multi-Tenant Authorization**: Explicit ownership validation prevents cross-account order manipulation.
* **Secret Isolation**: No credentials or private keys in source control.

Detailed security documentation is available in [`docs/security.md`](docs/security.md).

---

## 13. Terminal Interface

* **Watchlist Panel**: Compact instrument list with real-time price updates and percentage changes.
* **Canvas Chart**: High-performance interactive candlestick charting with Volume, SMA, and EMA indicators.
* **Market Depth (L2)**: 5-level bid/ask ladder with live spread and circuit limits.
* **Order Execution Panel**: Immediate inline validation, dynamic max affordable quantity, and explicit order semantics.
* **Console Table**: Orders, Positions, Holdings, Trades, Portfolio Analytics, and Live Engine Telemetry.

---

## 14. Local Setup

### Prerequisites
* Node.js v20+ and npm

### Installation & Startup

1. **Clone Repository**:
   ```bash
   git clone https://github.com/your-username/tradeforge.git
   cd tradeforge
   ```

2. **Install Dependencies**:
   ```bash
   npm --prefix backend install
   npm --prefix frontend install
   ```

3. **Start Development Servers**:
   * **Backend** (Port 8080):
     ```bash
     npm --prefix backend run dev
     ```
   * **Frontend** (Port 5173):
     ```bash
     npm --prefix frontend run dev
     ```

4. **Access Terminal**:
   Open `http://localhost:5173` in your browser. Demo credentials (`trader@tradeforge.io` / `password123`) auto-authenticate out of the box.

---

## 15. Environment Variables

See [`.env.example`](.env.example):
```ini
PORT=8080
JWT_SECRET=tradeforge-dev-secret-key-2026
DATABASE_URL=postgresql://tradeforge_user:tradeforge_password@localhost:5432/tradeforge
INITIAL_PAPER_BALANCE=1000000.0
SIMULATOR_TICK_INTERVAL_MS=350
```

---

## 16. Known Limitations

* **Paper Trading Only**: This application is a simulated paper-trading platform and does not connect to real financial exchanges.
* **Single-Node Execution**: In-memory order books reside on a single backend instance; distributed clustering is not currently implemented.
* **Stochastic Market Data**: Price action is algorithmically generated for educational and paper-trading purposes.

---

## 17. Future Work

* Level-3 order-by-order book matching visualization.
* FIX protocol gateway integration for automated algorithmic client connections.
* Historical tick replay engine from historical market data archives.
