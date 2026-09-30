# Deterministic Matching Engine Architecture

## 1. Overview & Core Invariants

TradeForge implements an in-memory, deterministic continuous double-sided order book adhering strictly to **Price-Time Priority (FIFO)**.

### Core Invariants:
* **Price Priority**:
  * **Bids** (Buy Orders): Higher bid prices always execute before lower bid prices.
  * **Asks** (Sell Orders): Lower ask prices always execute before higher ask prices.
* **Time Priority (FIFO)**:
  * At identical price levels, orders arriving earlier execute before orders arriving later.
* **Conservation of Shares**:
  * For every matched execution, taker filled quantity matches maker consumed quantity exactly.

---

## 2. Data Structures

The order book maintains discrete sides (Bid and Ask) structured as follows:

```text
       ┌────────────────────────────────────────────────────────┐
       │                       OrderBook                        │
       ├────────────────────────────────────────────────────────┤
       │  bids: Map<Price, PriceLevel>   (Sorted DESCENDING)    │
       │  asks: Map<Price, PriceLevel>   (Sorted ASCENDING)     │
       │  orderMap: Map<OrderId, OrderRef>                      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                       PriceLevel                       │
       ├────────────────────────────────────────────────────────┤
       │  price: number                                         │
       │  totalQuantity: number                                 │
       │  orderCount: number                                    │
       │  orders: Order[] (FIFO Queue)                          │
       └────────────────────────────────────────────────────────┘
```

* **Price Level Organization**: Bids are traversed in descending order; Asks are traversed in ascending order.
* **FIFO Queue**: Each price level contains a list of orders. New limit orders append to the tail. Matches consume from the head.
* **Direct Order Index (`orderMap`)**: A hash map mapping `orderId` $\rightarrow$ `{ side, price, order }` allowing $O(1)$ lookups for cancellation and order retrieval.

---

## 3. Order Types & Matching Semantics

### 3.1 Market Orders
* Crosses the book against available contra-side liquidity immediately.
* Consumes resting orders level by level until fully filled or until book liquidity is exhausted.
* Any unfulfilled quantity on an illiquid book is rejected or left according to execution policies (no resting state for pure market orders).

### 3.2 Limit Orders
* If a Limit Buy order has $\text{Price} \ge \text{Best Ask}$, or Limit Sell has $\text{Price} \le \text{Best Bid}$, it is **marketable** and crosses immediately at maker prices.
* Any remaining unfilled quantity rests in the order book at the specified limit price.

### 3.3 Stop Orders (SL-M & SL-L)
* Managed in a trigger watch list until the symbol's Last Traded Price (LTP) breaches the `trigger_price`.
* Once triggered:
  * **SL-M (Stop-Loss Market)** transitions to a Market Order and aggressively crosses the book.
  * **SL-L (Stop-Loss Limit)** transitions to a Limit Order placed at `price`.

---

## 4. Multi-Level Fill & Partial Fill Example

Consider the following Ask depth for `RELIANCE`:

```text
ASK DEPTH
Price       Qty      Orders
₹101.00     100      1  <-- Best Ask
₹101.10     200      2
₹101.20     500      4
```

**Incoming Taker Order**: `BUY MARKET 150`

**Matching Progression**:
1. Level 1 (`₹101.00`):
   * Available: 100 shares.
   * Match: **100 shares @ ₹101.00** from maker `ord-ask-1`.
   * Maker order is fully filled and removed from level. Level ₹101.00 is pruned.
   * Taker remaining quantity: $150 - 100 = 50$.
2. Level 2 (`₹101.10`):
   * Available: 200 shares.
   * Match: **50 shares @ ₹101.10** from maker `ord-ask-2`.
   * Maker `ord-ask-2` is partially filled (150 remaining).
   * Taker remaining quantity: $50 - 50 = 0$ (Fully Filled).

**Result**:
* 2 Executions: `100 @ ₹101.00` and `50 @ ₹101.10`.
* **Volume Weighted Average Price (VWAP)**:
  $$\text{VWAP} = \frac{(100 \times 101.00) + (50 \times 101.10)}{150} = \frac{10100 + 5055}{150} = ₹101.0333$$

---

## 5. Cancellation & Modification Complexity

| Operation | Complexity | Description |
|---|---|---|
| **Limit Insert (Resting)** | $O(1)$ / $O(\log P)$ | Creates or appends to FIFO queue at specified price. |
| **Market Match** | $O(K)$ | $K$ = number of price levels traversed to satisfy quantity. |
| **Order Cancellation** | $O(1)$ | Direct lookup via `orderMap` and fast removal from price queue. |
| **Order Modification** | $O(1)$ / $O(\log P)$ | Qty decrease preserves priority; Price/Qty increase resets time priority. |

---

## 6. Determinism & Benchmark Disclaimer

All matching logic is completely synchronous, single-threaded per instrument, and contains zero I/O or network calls in the critical matching path.

> **Empirical Benchmark**:
> * **Matching Throughput**: **247,133 orders/sec** (measured across 50,000 iterations on 13th Gen Intel Core i5-13450HX).
> * **Matching Latency**: **p50 = 4.10 µs**, **p95 = 6.60 µs**, **p99 = 10.90 µs**.
> * *Disclaimer*: This benchmark strictly measures the in-memory matching algorithm and excludes HTTP, JSON parsing, database persistence, and WebSocket network latency.
