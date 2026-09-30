# Stochastic Market Simulator & Tick Engine

## 1. Mathematical Modeling

TradeForge synthesizes realistic price action and depth using a hybrid stochastic differential equation combining **Geometric Brownian Motion (GBM)**, **Ornstein-Uhlenbeck Mean Reversion**, and **Poisson Jump Diffusion**:

$$dS_t = \theta (\mu - S_t) dt + \sigma S_t dW_t + J_t dN_t$$

Where:
* $S_t$: Asset price at time $t$.
* $\theta (\mu - S_t) dt$: Ornstein-Uhlenbeck drift pulling prices toward the fundamental anchor $\mu$ with reversion speed $\theta$.
* $\sigma S_t dW_t$: Geometric Brownian Motion diffusion driven by Wiener process $W_t$ with annualized volatility $\sigma$.
* $J_t dN_t$: Compound Poisson jump process capturing sudden market shocks (earnings, macro data).

---

## 2. Deterministic Reproducibility

* **PRNG (Linear Congruential / Mulberry32)**: The simulator accepts an optional seed parameter (`seed?: number`).
* Given identical seeds, the price trajectory, tick intervals, and candle histories are 100% deterministic and reproducible across runs and test environments.
* Verified in automated unit tests (`test/index.test.ts` Section 4).

---

## 3. Level 2 (L2) Depth & Spread Synthesis

At each tick event:
1. **Spread Calculation**: Spread is dynamically derived based on instrument liquidity and current volatility.
2. **Best Bid & Best Ask**:
   $$\text{Best Bid} = \text{LTP} - \frac{\text{Spread}}{2}, \quad \text{Best Ask} = \text{LTP} + \frac{\text{Spread}}{2}$$
3. **Multi-Level Depth**: 5 bid levels and 5 ask levels are generated with realistic power-law depth distributions ($Q_i \propto \frac{1}{\sqrt{i}}$) representing resting limit orders.

---

## 4. Multi-Timeframe OHLC Aggregation

Raw tick streams are continuously aggregated into candlestick intervals:
* **Timeframes**: `1s`, `5s`, `1m`, `5m`, `15m`, `1h`, `1d`.
* Each candle tracks `timestamp`, `open`, `high`, `low`, `close`, `volume`, and `turnover`.
* SMA (20-period Simple Moving Average) and EMA (20-period Exponential Moving Average) are computed in real time.
