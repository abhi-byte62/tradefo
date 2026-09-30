# Security & Multi-Tenant Isolation Architecture

## 1. Authentication & Session Security

* **Stateless JWT Tokens**: Signed using HMAC-SHA256 with an environment secret (`JWT_SECRET`).
* **Password Hashing**: Bcrypt with a work factor of 10 rounds for all stored credentials.
* **Header Authorization**: Standard `Authorization: Bearer <token>` required for all mutating endpoints (`/api/orders`, `/api/positions/square-off`, `/api/account`).

---

## 2. Multi-Tenant Authorization & Data Isolation

TradeForge enforces strict multi-tenant boundary checks across every state mutation:
* **Order Ownership**: When cancelling an order via `DELETE /api/orders/:id`, the system explicitly queries the order's `user_id` and rejects requests where `req.user.id !== order.user_id` with HTTP 403 Forbidden (`Unauthorized access to order`).
* **Position Ownership**: Position square-off queries only positions matching the authenticated `user_id`.
* **Portfolio & Account Isolation**: Balance queries and margin releases are strictly isolated by `user_id`.

---

## 3. Verified Multi-Tenant Security Test

Automated in [`test/e2e-freeze-qa.ts`](file:///c:/Users/mrabh/OneDrive/Desktop/tradef/backend/test/e2e-freeze-qa.ts):

```typescript
// Verified Test: User A attempts to cancel User B's order
const unauthorizedCancel = await orderService.cancelOrder('usr_unauthorized_attacker', slmRes.order.id);
assert(!unauthorizedCancel.success);
assert(unauthorizedCancel.message === 'Unauthorized access to order');
```

---

## 4. Input Sanitization & Secret Hygiene

* **Schema Validation**: Explicit validation on all order parameters (Quantity, Price, Trigger Price, Product Type, Order Type).
* **Environment Hygiene**: No API keys, passwords, private keys, or tokens committed to source control. `.env.example` provides sanitized template values.
