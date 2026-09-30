# Resume Claims & Empirical Verification Mapping

Every technical and numerical claim regarding TradeForge is backed by verifiable code and reproducible tests:

---

## 1. Verified Resume Bullet Points

### Claim 1: High-Throughput In-Memory Matching Engine
> *"Designed and built a deterministic continuous double-sided order book matching engine in TypeScript with Price-Time Priority (FIFO), achieving 247,000+ orders/sec and p50 matching latency of 4.10 µs."*
* **Verification Command**: `npm --prefix backend run benchmark` (or `npx tsx test/benchmark.ts`)
* **Code Implementation**: [`backend/src/domain/matching/MatchingEngine.ts`](file:///c:/Users/mrabh/OneDrive/Desktop/tradef/backend/src/domain/matching/MatchingEngine.ts)
* **Measured Benchmark Results (13th Gen Intel Core i5-13450HX, 16 Cores, Node.js v24.13.0)**:
  * Throughput: **247,133 orders/sec**
  * p50 Latency: **4.10 µs**
  * p95 Latency: **6.60 µs**
  * p99 Latency: **10.90 µs**
* *Disclaimer*: Measures the in-memory core algorithm; excludes network and HTTP round-trip overhead.

---

### Claim 2: Pre-Trade Risk & Margin Subsystem
> *"Engineered a synchronous pre-trade risk engine with sub-millisecond validation for 5x intraday leverage, circuit limit bounds, tick size conformance, and client-side idempotency protection."*
* **Verification Command**: `npm --prefix backend test` (Test Suite Section 2)
* **Code Implementation**: [`backend/src/domain/risk/RiskEngine.ts`](file:///c:/Users/mrabh/OneDrive/Desktop/tradef/backend/src/domain/risk/RiskEngine.ts)
* **Tests Passed**:
  * Margin breach rejection for Delivery (1x) vs Intraday (5x MIS).
  * 10% circuit limit enforcement.
  * Tick size fraction rejection.
  * Idempotency duplicate submission prevention without double execution.

---

### Claim 3: Stochastic Market Simulation & L2 Order Book Depth
> *"Implemented a hybrid stochastic market simulator (Geometric Brownian Motion + Ornstein-Uhlenbeck drift + Poisson jump diffusion) generating 119,000+ synthetic ticks/sec with deterministic seed reproducibility."*
* **Verification Command**: `npm --prefix backend run benchmark` (Benchmark 2) & `npm test` (Test Suite Section 4)
* **Code Implementation**: [`backend/src/domain/simulator/MarketSimulator.ts`](file:///c:/Users/mrabh/OneDrive/Desktop/tradef/backend/src/domain/simulator/MarketSimulator.ts)
* **Throughput Measured**: **119,899 ticks/sec**.

---

### Claim 4: Real-Time Web-Based Trading Terminal
> *"Architected a dense, responsive trading terminal in React/TypeScript with HTML5 Canvas candlestick charts, Level-2 depth ladder, selective WebSocket channel routing, and multi-tenant security isolation."*
* **Verification Command**: `npm --prefix frontend run build` & `npx tsx test/e2e-freeze-qa.ts`
* **Code Implementation**: [`frontend/src/`](file:///c:/Users/mrabh/OneDrive/Desktop/tradef/frontend/src/)
* **Zero Compilation Errors**: 1,585 modules transformed cleanly into production assets.
