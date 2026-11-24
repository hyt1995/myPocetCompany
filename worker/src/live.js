// 바이낸스 실제 주문 (현물). BINANCE_TESTNET=true(기본)면 테스트넷(가짜 돈)으로 나간다.
// 이 파일의 함수는 commands.js 가 서명·만료·실전 허용·한도를 모두 확인한 뒤에만 부른다.

import ccxt from 'ccxt';
import { config } from './config.js';
import { toCcxtSymbol } from './market.js';

let ex = null;
let ready = null;

async function exchange() {
  if (!ex) {
    ex = new ccxt.binance({
      apiKey: config.binance.apiKey,
      secret: config.binance.secret,
      enableRateLimit: true,
      options: { defaultType: 'spot' },
    });
    if (config.binance.testnet) ex.setSandboxMode(true);
    ready = ex.loadMarkets();
  }
  await ready;
  return ex;
}

const amount = (e, sym, v) => Number(e.amountToPrecision(sym, v));
const price = (e, sym, v) => Number(e.priceToPrecision(sym, v));

// 체결 결과에서 수수료를 USDT로 환산하고, 수수료로 빠진 코인 수량을 계산한다.
function settle(order, base) {
  const filled = Number(order.filled || 0);
  const cost = Number(order.cost || 0);
  const avg = Number(order.average || (filled > 0 ? cost / filled : 0));
  const fees = order.fees?.length ? order.fees : order.fee ? [order.fee] : [];
  let feeUsdt = 0;
  let feeInBase = 0;
  for (const f of fees) {
    const c = Number(f.cost || 0);
    if (f.currency === 'USDT') feeUsdt += c;
    else if (f.currency === base) {
      feeUsdt += c * avg;
      feeInBase += c;
    } else feeUsdt += cost * 0.001; // BNB 등으로 낸 수수료는 0.1%로 추정
  }
  return {
    filled,
    avgPrice: avg,
    cost,
    feeUsdt,
    feeInBaseUsdt: feeInBase * avg, // 코인으로 낸 수수료 (이미 수량에서 빠짐)
    netQuantity: filled - feeInBase,
    orderId: order.id,
  };
}

// 이 종목에 걸린 주문을 모두 취소하고, 이 프로그램이 산 수량(quantity)에만 손절 주문을 새로 건다.
// 계정에 따로 가진 같은 코인은 건드리지 않는다.
export async function resetStopLoss(symbol, stopPrice, quantity) {
  const e = await exchange();
  const sym = toCcxtSymbol(symbol);
  const base = sym.split('/')[0];
  try {
    await e.cancelAllOrders(sym);
  } catch {
    // 열린 주문이 없음
  }
  const balance = await e.fetchBalance();
  const free = Number(balance[base]?.free || 0);
  return placeStopLoss(symbol, Math.min(free, quantity), stopPrice);
}

export async function liveBuy(symbol, quoteUsdt) {
  const e = await exchange();
  const sym = toCcxtSymbol(symbol);
  const base = sym.split('/')[0];
  const cost = Number(e.costToPrecision(sym, quoteUsdt));
  const order = e.has.createMarketBuyOrderWithCost
    ? await e.createMarketBuyOrderWithCost(sym, cost)
    : await e.createOrder(sym, 'market', 'buy', undefined, undefined, { quoteOrderQty: cost });
  const result = settle(order, base);
  if (!(result.filled > 0)) throw new Error('매수 주문이 체결되지 않았어요.');
  return result;
}

// 노트북이 꺼져도 작동하도록 거래소에 손절 주문을 걸어 둔다. (지정가 = 손절가보다 0.5% 아래)
export async function placeStopLoss(symbol, quantity, stopPrice) {
  const e = await exchange();
  const sym = toCcxtSymbol(symbol);
  const qty = amount(e, sym, quantity);
  if (!(qty > 0)) return null;
  const order = await e.createOrder(sym, 'STOP_LOSS_LIMIT', 'sell', qty, price(e, sym, stopPrice * 0.995), {
    stopPrice: price(e, sym, stopPrice),
    timeInForce: 'GTC',
  });
  return order.id;
}

// quantity: 팔 수량 (이 프로그램이 산 수량 안에서 commands.js 가 정한다).
// 걸어 둔 손절 주문을 먼저 취소해야 코인이 풀린다.
export async function liveSell(symbol, quantity) {
  const e = await exchange();
  const sym = toCcxtSymbol(symbol);
  const base = sym.split('/')[0];

  try {
    await e.cancelAllOrders(sym);
  } catch {
    // 열린 주문이 없으면 거래소가 오류를 돌려준다. 무시한다.
  }

  const balance = await e.fetchBalance();
  const free = Number(balance[base]?.free || 0);
  const qty = amount(e, sym, Math.min(quantity, free));
  if (!(qty > 0)) throw new Error(`팔 수 있는 ${base} 잔고가 없어요.`);

  const order = await e.createMarketSellOrder(sym, qty);
  return settle(order, base);
}
