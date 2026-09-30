# System Architecture & Design Principles

## Overview
**TradeForge** is a high-performance, web-based paper trading platform and market terminal. It combines a deterministic Price-Time Priority (FIFO) matching engine, pre-trade risk controls, a stochastic Ornstein-Uhlenbeck / Geometric Brownian Motion market data simulator, and a low-latency WebSocket streaming layer with a React & TypeScript trading terminal interface.

---

## High-Level Topology

```text
                     ┌───────────────────────────────┐
                     │   React / TypeScript Client   │
                     │  (Zustand + TanStack + L2)    │
                     └───────────────┬───────────────┘
                                     │
                             REST / WebSocket
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │  API Gateway / WebSocket Bus  │
                     │  (Connection Index & Routing) │
                     └───────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         ▼                           ▼                           ▼
┌──────────────────┐       ┌───────────────────┐       ┌───────────────────┐
│ Market Simulator │       │   Order Service   │       │ Portfolio Engine  │
│ (GBM + OU Drift) │       │   (Orchestrator)  │       │ (MTM & Weighted   │
└────────┬─────────┘       └─────────┬─────────┘       │    Cost Basis)    │
         │                           │                 └─────────▲─────────┘
         │                           ▼                           │
         │                 ┌───────────────────┐                 │
         │                 │    Risk Engine    │                 │
         │                 │ (Pre-Trade Check) │                 │
         │                 └─────────┬─────────┘                 │
         │                           │                           │
         │                           ▼                           │
         │                 ┌───────────────────┐                 │
         │                 │  Matching Engine  │─────────────────┘
         │                 │  (FIFO Price/Time)│    Executions
         │                 └─────────┬─────────┘
         │                           │
         └───────────────────────────┼───────────────────────────┐
                                     ▼
                           Domain Event Bus / MQ
                                     │
                      ┌──────────────┴──────────────┐
                      ▼                             ▼
                Hot State Cache                PostgreSQL
          (L2 Depth, Locks, Subs)          (Relational State)
```

---

## Architectural Tradeoffs & Decisions

### 1. Modular Monolith vs Microservices
Rather than splitting orders, risk, and matching across physical network hops (introducing serialization overhead and distributed transactions), TradeForge is designed as a **Modular Monolith** with clear domain boundaries:
* **Zero Network Latency** between Risk Check, Matching Engine, and Execution Logging.
* **Deterministic Sequencing**: In-memory order sequencing eliminates distributed lock contention.
* **Future-Proof Service Boundaries**: Each module (e.g. `MatchingEngine`, `RiskEngine`, `MarketSimulator`) communicates via strictly-typed interfaces and asynchronous event publishers, allowing isolated extraction into standalone microservices if horizontal scaling demands it.

### 2. Real-Time WebSocket Architecture vs Polling
* **Selective Inverted Pub/Sub Indexing**: Clients only receive tick updates for the symbols actively pinned to their watchlist or open on their charts.
* **Bi-directional Heartbeats**: Automatic 30-second ping/pong keepalive drops stale connections and prevents server resource leaks.
* **State Recovery on Reconnect**: When the WebSocket re-establishes, the client re-subscribes active symbols and syncs user orders and positions.

### 3. Concurrency & Idempotency Strategy
* **Pre-Trade Idempotency Key Caching**: Repeated requests with the same idempotency key return the original order response immediately without triggering duplicate risk deductions or executions.
* **Atomic Portfolio State Machine**: Weighted-average cost basis and margin accounting use atomic transitions to prevent race conditions between concurrent fills.
