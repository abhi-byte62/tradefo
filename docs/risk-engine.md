# Pre-Trade Risk Engine & Margin Management

## 1. Overview

The TradeForge Pre-Trade Risk Engine inspects every incoming order synchronously before it can reach the order book. Orders failing any risk or validation check are immediately rejected with specific error codes.

---

## 2. Implemented Risk Rules & Invariants

### 2.1 Available Margin Verification
* **Delivery Orders (CNC - Cash N Carry)**:
  * Margin Multiplier = $1.0$ (100% upfront cash required for Buy).
  * $\text{Required Margin} = \text{Order Quantity} \times \text{Effective Price}$.
  * For Delivery SELL orders: The user must already own sufficient free quantity in `holdings`.
* **Intraday Orders (MIS - Margin Intraday Square-off)**:
  * Margin Multiplier = $0.2$ ($5\times$ leverage provided for intraday equities).
  * $\text{Required Margin} = \text{Order Quantity} \times \text{Effective Price} \times 0.2$.
  * Allowed if $\text{Required Margin} \le \text{Available Margin}$.

### 2.2 Circuit Limit Validation
* Each instrument has strict upper and lower price bands:
  * $\text{Lower Circuit} = \text{Base Price} \times 0.90$ ($-10\%$)
  * $\text{Upper Circuit} = \text{Base Price} \times 1.10$ ($+10\%$)
* Limit orders with $\text{Price} < \text{Lower Circuit}$ or $\text{Price} > \text{Upper Circuit}$ are rejected.

### 2.3 Tick Size & Lot Size Conformance
* All prices must align with the instrument tick size (e.g. ₹0.05).
* All quantities must be whole positive integers and exact multiples of the instrument's `lot_size`.

### 2.4 Maximum Quantity & Fat-Finger Protection
* Single-order quantity is capped at $1,000,000$ shares to prevent catastrophic simulation over-allocation.

### 2.5 Idempotency Protection
* Ingestion accepts a `client_order_id` or `Idempotency-Key` header.
* Duplicate submissions within a sliding window return the identical existing order response without double execution or double margin deduction.

---

## 3. Risk Verification Matrix

| Rule | Trigger Condition | Rejection Code |
|---|---|---|
| **Margin Check** | $\text{Required Margin} > \text{Available Margin}$ | `INSUFFICIENT_FUNDS` |
| **Holding Check** | Delivery SELL with $\text{Quantity} > \text{Holding Quantity}$ | `INSUFFICIENT_HOLDINGS` |
| **Circuit Check** | $\text{Price} \notin [\text{Lower Circuit}, \text{Upper Circuit}]$ | `CIRCUIT_LIMIT_BREACHED` |
| **Tick Check** | $(\text{Price} \pmod{\text{Tick Size}}) \neq 0$ | `INVALID_TICK_SIZE` |
| **Lot Check** | $(\text{Qty} \pmod{\text{Lot Size}}) \neq 0$ | `INVALID_LOT_SIZE` |
| **Duplicate Check** | Same idempotency key submitted concurrently | Idempotent Cached Return |
