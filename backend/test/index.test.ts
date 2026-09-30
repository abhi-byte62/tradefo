import { MatchingEngine } from '../src/domain/matching/MatchingEngine.js';
import { RiskEngine } from '../src/domain/risk/RiskEngine.js';
import { PortfolioEngine } from '../src/domain/portfolio/PortfolioEngine.js';
import { MarketSimulator } from '../src/domain/simulator/MarketSimulator.js';
import { Database } from '../src/infrastructure/database/Database.js';
import { HotCache } from '../src/infrastructure/cache/HotCache.js';
import { EventBus } from '../src/infrastructure/events/EventBus.js';
import { OrderService } from '../src/domain/OrderService.js';
import { Order, Instrument, Account, Execution } from '../src/types/index.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTestSuite() {
  console.log('\n========================================');
  console.log('🧪 RUNNING TRADEFORGE AUTOMATED TEST SUITE');
  console.log('========================================\n');

  // -------------------------------------------------------------
  // 1. MATCHING ENGINE TESTS
  // -------------------------------------------------------------
  console.log('📦 1. Testing Deterministic Matching Engine (Price-Time Priority)...');
  const me = new MatchingEngine();

  // Test 1.1: Resting limit order placement
  const restingSell: Order = {
    id: 'ord-sell-1',
    user_id: 'user-alice',
    symbol: 'RELIANCE',
    side: 'SELL',
    order_type: 'LIMIT',
    product_type: 'INTRADAY',
    quantity: 100,
    filled_quantity: 0,
    remaining_quantity: 100,
    price: 3000.0,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1
  };
  const res1 = me.matchOrder(restingSell);
  assert(res1.restingOrderCreated === true && res1.fullyFilled === false, 'Resting LIMIT SELL placed in orderbook');

  // Test 1.2: Matching incoming BUY order against resting SELL
  const incomingBuy: Order = {
    id: 'ord-buy-1',
    user_id: 'user-bob',
    symbol: 'RELIANCE',
    side: 'BUY',
    order_type: 'LIMIT',
    product_type: 'INTRADAY',
    quantity: 40,
    filled_quantity: 0,
    remaining_quantity: 40,
    price: 3000.0,
    status: 'OPEN',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    version: 1
  };
  const res2 = me.matchOrder(incomingBuy);
  assert(res2.executions.length === 1, 'Match generated 1 execution');
  assert(res2.executions[0].quantity === 40 && res2.executions[0].price === 3000.0, 'Matched exact 40 qty @ 3000.0');
  assert(res2.fullyFilled === true, 'Taker BUY order fully filled');

  // Test 1.3: Partial Fill remainder in resting order
  const book = me.getOrderBook('RELIANCE');
  const remainingAsks = book.asks.get(3000.0);
  assert(remainingAsks !== undefined && remainingAsks[0].remainingQuantity === 60, 'Maker order updated to 60 remaining qty');

  // Test 1.4: Order Cancellation
  const cancelRes = me.cancelOrder('RELIANCE', 'ord-sell-1');
  assert(cancelRes.success === true && cancelRes.order?.status === 'CANCELLED', 'Maker order successfully cancelled');
  assert(book.asks.size === 0, 'Orderbook ask levels cleanly emptied on cancellation');

  // Test 1.5: Multi-Level Match execution
  const me2 = new MatchingEngine();
  me2.matchOrder({
    id: 's1', user_id: 'u1', symbol: 'TCS', side: 'SELL', order_type: 'LIMIT', product_type: 'INTRADAY',
    quantity: 10, filled_quantity: 0, remaining_quantity: 10, price: 4000.0, status: 'OPEN',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
  });
  me2.matchOrder({
    id: 's2', user_id: 'u2', symbol: 'TCS', side: 'SELL', order_type: 'LIMIT', product_type: 'INTRADAY',
    quantity: 20, filled_quantity: 0, remaining_quantity: 20, price: 4010.0, status: 'OPEN',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
  });

  const takerBuy = me2.matchOrder({
    id: 'b-large', user_id: 'u3', symbol: 'TCS', side: 'BUY', order_type: 'LIMIT', product_type: 'INTRADAY',
    quantity: 25, filled_quantity: 0, remaining_quantity: 25, price: 4020.0, status: 'OPEN',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), version: 1
  });
  assert(takerBuy.executions.length === 2, 'Matched across 2 distinct price levels (Multi-Fill)');
  assert(takerBuy.order.filled_quantity === 25, 'Total 25 filled (10 @ 4000 + 15 @ 4010)');
  assert(takerBuy.order.average_price === 4006.0, 'Calculated correct weighted average execution price (4006.0)');

  // -------------------------------------------------------------
  // 2. RISK ENGINE TESTS
  // -------------------------------------------------------------
  console.log('\n🛡️  2. Testing Pre-Trade Risk Engine...');
  const risk = new RiskEngine();
  const dummyInst: Instrument = {
    symbol: 'RELIANCE', name: 'Reliance', exchange: 'NSE', instrument_type: 'EQUITY',
    tick_size: 0.05, lot_size: 1, base_price: 3000.0, lower_circuit: 2700.0, upper_circuit: 3300.0, segment: 'ENERGY'
  };
  const dummyAccount: Account = {
    user_id: 'u-risk', cash_balance: 10000.0, available_margin: 10000.0, used_margin: 0,
    realized_pnl: 0, unrealized_pnl: 0, initial_balance: 10000.0, currency: 'INR', updated_at: ''
  };

  // Test 2.1: Insufficient funds rejection
  const riskRes1 = risk.validateOrder({
    symbol: 'RELIANCE', side: 'BUY', order_type: 'LIMIT', product_type: 'DELIVERY', quantity: 10, price: 3000.0
  }, dummyInst, dummyAccount, 3000.0);
  assert(riskRes1.passed === false && riskRes1.rejectReason === 'INSUFFICIENT_FUNDS', 'Rejects BUY order exceeding available margin');

  // Test 2.2: Circuit limit violation
  const riskRes2 = risk.validateOrder({
    symbol: 'RELIANCE', side: 'BUY', order_type: 'LIMIT', product_type: 'INTRADAY', quantity: 1, price: 3500.0
  }, dummyInst, dummyAccount, 3000.0);
  assert(riskRes2.passed === false && riskRes2.rejectReason === 'CIRCUIT_LIMIT_VIOLATION', 'Rejects order price breaching upper circuit limit');

  // Test 2.3: Tick size violation
  const riskRes3 = risk.validateOrder({
    symbol: 'RELIANCE', side: 'BUY', order_type: 'LIMIT', product_type: 'INTRADAY', quantity: 1, price: 3000.03
  }, dummyInst, dummyAccount, 3000.0);
  assert(riskRes3.passed === false && riskRes3.rejectReason === 'TICK_SIZE_VIOLATION', 'Rejects order with invalid tick fraction');

  // Test 2.4: Valid intraday order with 5x leverage
  const riskRes4 = risk.validateOrder({
    symbol: 'RELIANCE', side: 'BUY', order_type: 'LIMIT', product_type: 'INTRADAY', quantity: 10, price: 3000.0
  }, dummyInst, dummyAccount, 3000.0);
  assert(riskRes4.passed === true && riskRes4.requiredMargin === 6000.0, 'Allows 5x leveraged Intraday order (Required ₹6,000 <= Available ₹10,000)');

  // -------------------------------------------------------------
  // 3. PORTFOLIO & P&L ENGINE TESTS
  // -------------------------------------------------------------
  console.log('\n📊 3. Testing Portfolio & Mark-to-Market P&L Engine...');
  const portfolio = new PortfolioEngine();

  // Test 3.1: Long position creation
  const buyExec: Execution = {
    id: 'ex1', order_id: 'o1', user_id: 'u1', symbol: 'INFY', side: 'BUY', price: 1500.0, quantity: 10, timestamp: ''
  };
  const buyOrder: Order = {
    id: 'o1', user_id: 'u1', symbol: 'INFY', side: 'BUY', order_type: 'MARKET', product_type: 'INTRADAY',
    quantity: 10, filled_quantity: 10, remaining_quantity: 0, status: 'FILLED', created_at: '', updated_at: '', version: 1
  };
  const portRes1 = portfolio.processExecution(buyExec, buyOrder, undefined, undefined, dummyAccount);
  assert(portRes1.position.quantity === 10 && portRes1.position.average_price === 1500.0, 'Created Long position with 10 qty @ 1500.0');

  // Test 3.2: Partial Exit with Realized P&L
  const sellExec: Execution = {
    id: 'ex2', order_id: 'o2', user_id: 'u1', symbol: 'INFY', side: 'SELL', price: 1550.0, quantity: 4, timestamp: ''
  };
  const sellOrder: Order = {
    id: 'o2', user_id: 'u1', symbol: 'INFY', side: 'SELL', order_type: 'MARKET', product_type: 'INTRADAY',
    quantity: 4, filled_quantity: 4, remaining_quantity: 0, status: 'FILLED', created_at: '', updated_at: '', version: 1
  };
  const portRes2 = portfolio.processExecution(sellExec, sellOrder, portRes1.position, undefined, portRes1.account);
  assert(portRes2.position.quantity === 6, 'Position reduced to 6 qty');
  assert(portRes2.realizedPnlDelta === 200.0, 'Calculated Realized P&L = +₹200.0 ((1550 - 1500) * 4)');

  // Test 3.3: Mark-to-market Unrealized P&L calculation
  const unrealized = portfolio.calculateUnrealizedPnl(6, 1500.0, 1600.0);
  assert(unrealized === 600.0, 'Mark-to-Market Unrealized P&L = +₹600.0 ((1600 - 1500) * 6)');

  // -------------------------------------------------------------
  // 4. STOCHASTIC SIMULATOR REPRODUCIBILITY (SEED TEST)
  // -------------------------------------------------------------
  console.log('\n🎲 4. Testing Stochastic Market Simulator Determinism...');
  const sim1 = new MarketSimulator();
  sim1.setDeterministicSeed(12345);
  const ticks1 = sim1.step('RELIANCE');

  const sim2 = new MarketSimulator();
  sim2.setDeterministicSeed(12345);
  const ticks2 = sim2.step('RELIANCE');

  assert(ticks1[0].ltp === ticks2[0].ltp, `Deterministic seed produced identical price paths (${ticks1[0].ltp})`);

  // -------------------------------------------------------------
  // 5. IDEMPOTENCY & CONCURRENCY TEST
  // -------------------------------------------------------------
  console.log('\n🔒 5. Testing Idempotency & Order Submission Flow...');
  const db = new Database();
  const cache = new HotCache();
  const eventBus = new EventBus();
  const user = await db.createUser('test@example.com', 'Tester', 'hash');
  const orderService = new OrderService(db, cache, eventBus, me, risk, portfolio, sim1);

  const key = 'idem-order-key-999';
  const orderReq = {
    symbol: 'RELIANCE',
    side: 'BUY' as const,
    order_type: 'LIMIT' as const,
    product_type: 'INTRADAY' as const,
    quantity: 1,
    price: 2900.0
  };

  const firstSubmission = await orderService.submitOrder(user.id, orderReq, key);
  const secondSubmission = await orderService.submitOrder(user.id, orderReq, key);

  assert(firstSubmission.order.id === secondSubmission.order.id, 'Duplicate idempotency key returned identical original order without duplicate execution');
  assert((await db.getUserOrders(user.id)).length === 1, 'Database contains exactly 1 order record');

  console.log('\n========================================');
  console.log(`🎉 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite runner encountered fatal error:', err);
  process.exit(1);
});
