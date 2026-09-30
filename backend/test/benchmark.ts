import { MatchingEngine } from '../src/domain/matching/MatchingEngine.js';
import { MarketSimulator } from '../src/domain/simulator/MarketSimulator.js';
import { Order } from '../src/types/index.js';
import os from 'os';

function runBenchmarks() {
  console.log('\n======================================================');
  console.log('⚡ TRADEFORGE PERFORMANCE BENCHMARK SUITE');
  console.log('======================================================');
  console.log(`System: ${os.type()} ${os.release()} (${os.arch()})`);
  console.log(`CPU: ${os.cpus()[0].model} (${os.cpus().length} cores)`);
  console.log(`Node.js Version: ${process.version}`);
  console.log('======================================================\n');

  // Benchmark 1: Matching Engine Throughput & Latency
  console.log('📊 Benchmark 1: Matching Engine Throughput (Price-Time Priority FIFO)...');
  const me = new MatchingEngine();
  const symbol = 'RELIANCE';

  // Seed 500 resting sell orders
  for (let i = 0; i < 500; i++) {
    const price = 3000.0 + (i % 20) * 0.05;
    me.matchOrder({
      id: `maker-${i}`,
      user_id: `user-${i % 10}`,
      symbol,
      side: 'SELL',
      order_type: 'LIMIT',
      product_type: 'INTRADAY',
      quantity: 10,
      filled_quantity: 0,
      remaining_quantity: 10,
      price,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    });
  }

  const iterations = 50000;
  const latencies: number[] = [];

  const startTotal = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    const isBuy = i % 2 === 0;
    const price = isBuy ? 3000.5 : 2999.5;
    const startSingle = process.hrtime.bigint();

    me.matchOrder({
      id: `bench-${i}`,
      user_id: `trader-${i % 50}`,
      symbol,
      side: isBuy ? 'BUY' : 'SELL',
      order_type: 'LIMIT',
      product_type: 'INTRADAY',
      quantity: 5,
      filled_quantity: 0,
      remaining_quantity: 5,
      price,
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      version: 1
    });

    const endSingle = process.hrtime.bigint();
    const durationMicros = Number(endSingle - startSingle) / 1000;
    latencies.push(durationMicros);
  }

  const endTotal = process.hrtime.bigint();
  const totalDurationMs = Number(endTotal - startTotal) / 1000000;
  const throughput = Math.round((iterations / totalDurationMs) * 1000);

  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(iterations * 0.5)].toFixed(2);
  const p95 = latencies[Math.floor(iterations * 0.95)].toFixed(2);
  const p99 = latencies[Math.floor(iterations * 0.99)].toFixed(2);

  console.log(`  -> Processed ${iterations.toLocaleString()} orders in ${totalDurationMs.toFixed(2)} ms`);
  console.log(`  -> Throughput: ${throughput.toLocaleString()} orders/sec`);
  console.log(`  -> Matching Latency: p50 = ${p50} µs, p95 = ${p95} µs, p99 = ${p99} µs\n`);

  // Benchmark 2: Stochastic Market Simulator Tick Generation
  console.log('🎲 Benchmark 2: Stochastic Simulator Tick & Candle Generation...');
  const simulator = new MarketSimulator();
  const simIterations = 100000;

  const simStart = process.hrtime.bigint();
  for (let i = 0; i < simIterations; i++) {
    simulator.step('NIFTY50');
  }
  const simEnd = process.hrtime.bigint();
  const simDurationMs = Number(simEnd - simStart) / 1000000;
  const simThroughput = Math.round((simIterations / simDurationMs) * 1000);

  console.log(`  -> Generated ${simIterations.toLocaleString()} ticks across GBM + OU in ${simDurationMs.toFixed(2)} ms`);
  console.log(`  -> Tick Throughput: ${simThroughput.toLocaleString()} ticks/sec\n`);

  console.log('======================================================');
  console.log('🏁 BENCHMARK COMPLETE');
  console.log('======================================================\n');
}

runBenchmarks();
