# WebSocket Protocol & Streaming Architecture

## 1. Connection & Authentication

TradeForge uses native WebSocket streams (`ws://localhost:8080/ws`) for bidirectional real-time communication.

### Handshake & Auth Flow:
```text
Client                                  Server
  │                                       │
  ├─── Connect (ws://.../ws) ─────────────► (Connected, Unauthenticated)
  │                                       │
  ├─── { type: "AUTH", token: "..." } ───► Validate JWT
  │                                       │ (Tagged with userId)
  ◄─── { type: "AUTH_OK" } ───────────────┤
  │                                       │
  ├─── { type: "SUBSCRIBE", symbols } ───► Register symbol subscriptions
  │                                       │
  ◄─── { type: "TICK", data: [...] } ─────┤ Broadcast filtered ticks
  ◄─── { type: "ORDER_UPDATE", ... } ─────┤ Private user events only
```

---

## 2. Channel Isolation & Selective Subscriptions

To prevent bandwidth saturation and prevent clients from receiving all market symbols:
* **Public Channels**:
  * `TICK`: Broadcasts price updates strictly for symbols the client explicitly subscribed to.
  * `DEPTH`: Broadcasts Level-2 snapshot updates for the active symbol.
* **Private User Channels (Authenticated)**:
  * `ORDER_UPDATE`: Sent strictly to the user matching `order.user_id`.
  * `TRADE_TAPE`: Execution fills relevant to the user.
  * `POSITION_UPDATE`: Updated Net Quantity, Average Price, and MTM P&L.
  * `PORTFOLIO_UPDATE`: Updated Available Margin and Used Margin.

---

## 3. Heartbeats & Reconnection Recovery

* **Heartbeat**: Periodic ping/pong frames every 30 seconds to detect dead TCP sockets.
* **Client Auto-Reconnect**:
  * Upon network drop, client enters `RECONNECTING` state with exponential backoff (1s, 2s, 4s, max 10s).
  * Upon re-establishing the socket connection, the client automatically re-authenticates and re-subscribes to its active watchlist symbols and requests fresh snapshots.
