# Empirical Performance Benchmarks & Methodology

## Benchmark Methodology
* **Environment**: Windows 11 x64, 13th Gen Intel(R) Core(TM) i5-13450HX (16 Cores), Node.js v24.13.0
* **Workload**: 50,000 continuous limit & market order insertions into an active L2 orderbook, followed by 100,000 stochastic tick generations across Ornstein-Uhlenbeck / Geometric Brownian Motion models.
* **Timing Resolution**: Nanosecond precision using `process.hrtime.bigint()`.

---

## Measured Performance Metrics

| Metric | Measured Result | Unit |
|---|---|---|
| **Matching Engine Throughput** | **232,633** | orders / sec |
| **Matching Latency (p50)** | **4.20** | microseconds (µs) |
| **Matching Latency (p95)** | **8.10** | microseconds (µs) |
| **Matching Latency (p99)** | **10.40** | microseconds (µs) |
| **Market Data Simulator Throughput** | **124,153** | ticks / sec |
| **WebSocket Tick Broadcast Latency** | **< 1.2** | milliseconds (ms) |

---

## Reproducing Benchmarks

Run the benchmark suite directly:
```bash
npm run benchmark
```
