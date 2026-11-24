// 사이트 버튼이 만든 명령 처리.
// 실전 명령(live_buy, live_sell)은 아래 5가지를 모두 통과해야만 바이낸스로 나간다:
//   1. 서명 일치 (사이트의 APP_PASSCODE 를 통과한 버튼만 서명할 수 있다)
//   2. 만료 전 (명령 후 5분)
//   3. 노트북 .env 의 LIVE_TRADING_ENABLED=true
//   4. 1회 한도 LIVE_MAX_ORDER_USDT
//   5. 하루 한도 LIVE_MAX_DAILY_USDT

import { config } from './config.js';
import {
  addTrade,
  claimCommand,
  finishCommand,
  getApprovedStrategy,
  getMember,
  getPosition,
  liveBuyTotalSince,
  savePosition,
} from './db.js';
import { liveBuy, liveSell, resetStopLoss } from './live.js';
import { log } from './log.js';
import { verifySignature } from './signature.js';
import { paperBuy, paperSell, runStrategy } from './trading.js';

class Rejected extends Error {}

export async function handleCommand(id, data) {
  const claimed = await claimCommand(id);
  if (!claimed) return; // 이미 다른 곳에서 처리 중이거나 끝난 명령
  log(`명령 ${data.type} ${data.symbol || ''} (${id})`);

  try {
    const member = await getMember(claimed.memberId);
    if (!member) throw new Rejected('직원을 찾을 수 없어요.');
    const result = await execute(id, claimed, member);
    await finishCommand(id, { status: 'done', result });
    log(`  → 완료: ${result.message}`);
  } catch (err) {
    const status = err instanceof Rejected ? 'rejected' : 'failed';
    await finishCommand(id, { status, error: err.message }).catch(() => {});
    log(`  → ${status}: ${err.message}`);
  }
}

async function execute(id, c, member) {
  const strategy = await getApprovedStrategy(member);
  const meta = { member, commandId: id, strategyVersion: strategy?.version ?? null };

  switch (c.type) {
    case 'run': {
      if (!strategy) throw new Rejected('승인된 전략이 없어요.');
      const messages = await runStrategy(member, strategy, { commandId: id, trigger: '지금 실행' });
      return { message: messages.join(' / ') };
    }
    case 'paper_buy':
      return paperBuy({ ...meta, symbol: c.symbol, quoteAmountUsdt: Number(c.quoteAmountUsdt), reason: '수동' });
    case 'paper_sell':
      return paperSell({ ...meta, symbol: c.symbol, quantity: c.sellAll ? null : Number(c.quantity), reason: '수동' });
    case 'live_buy':
      checkLive(id, c);
      await checkLimits(Number(c.quoteAmountUsdt));
      return doLiveBuy(c, strategy, meta);
    case 'live_sell':
      checkLive(id, c);
      return doLiveSell(c, meta);
    default:
      throw new Rejected(`알 수 없는 명령: ${c.type}`);
  }
}

function checkLive(id, c) {
  if (!verifySignature(c, id, config.commandSecret)) throw new Rejected('서명이 맞지 않아요. 사이트에서 보낸 명령이 아니에요.');
  if (!c.expiresAt || Date.now() > c.expiresAt) throw new Rejected('명령이 만료됐어요 (5분).');
  if (!config.live.enabled) throw new Rejected('노트북에서 실전이 꺼져 있어요 (LIVE_TRADING_ENABLED).');
}

async function checkLimits(quote) {
  if (!(quote > 0)) throw new Rejected('매수 금액이 올바르지 않아요.');
  if (quote > config.live.maxOrderUsdt) {
    throw new Rejected(`1회 한도 ${config.live.maxOrderUsdt} USDT 를 넘어요.`);
  }
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  const today = await liveBuyTotalSince(midnight.getTime());
  if (today + quote > config.live.maxDailyUsdt) {
    throw new Rejected(`하루 한도 ${config.live.maxDailyUsdt} USDT 를 넘어요 (오늘 ${today.toFixed(2)} 사용).`);
  }
}

async function doLiveBuy(c, strategy, { member, commandId, strategyVersion }) {
  const fill = await liveBuy(c.symbol, Number(c.quoteAmountUsdt));
  const pos = (await getPosition(member.id, 'live', c.symbol)) || { quantity: 0, avgPrice: 0, realizedPnlUsdt: 0 };
  const qty = Number(pos.quantity) || 0;
  const newQty = qty + fill.netQuantity;
  const avgPrice = (Number(pos.avgPrice) * qty + fill.cost) / newQty; // 코인으로 낸 수수료까지 반영된 평균단가
  const stopLossPct = Number(strategy?.rules?.exit?.stopLossPct) || config.live.defaultStopLossPct;
  const stopPrice = avgPrice * (1 - stopLossPct / 100);

  await savePosition(member.id, 'live', c.symbol, {
    quantity: newQty,
    avgPrice,
    lastPrice: fill.avgPrice,
    realizedPnlUsdt: Number(pos.realizedPnlUsdt || 0) - (fill.feeUsdt - fill.feeInBaseUsdt),
    openedAt: qty > 0 && pos.openedAt ? pos.openedAt : Date.now(),
    stopPrice,
  });
  const tradeId = await addTrade({
    memberId: member.id, mode: 'live', symbol: c.symbol, side: 'buy',
    price: fill.avgPrice, quantity: fill.netQuantity, quoteAmountUsdt: fill.cost, feeUsdt: fill.feeUsdt,
    realizedPnlUsdt: null, strategyVersion, commandId, reason: '수동 (실전)', exchangeOrderId: fill.orderId,
  });

  let stopNote;
  try {
    await resetStopLoss(c.symbol, stopPrice, newQty);
    stopNote = `손절 주문 ${stopPrice.toPrecision(6)} (-${stopLossPct}%) 걸어둠`;
  } catch (err) {
    stopNote = `⚠ 손절 주문 실패: ${err.message} — 바이낸스에서 직접 확인하세요`;
  }
  return {
    tradeId,
    message: `${testnetTag()}실제 매수 ${fill.netQuantity.toPrecision(6)} ${c.symbol} @ ${fill.avgPrice} · ${stopNote}`,
  };
}

async function doLiveSell(c, { member, commandId, strategyVersion }) {
  // 이 직원이 실전으로 산 수량 안에서만 판다. (계정에 따로 가진 코인은 건드리지 않는다)
  const pos = await getPosition(member.id, 'live', c.symbol);
  const held = Number(pos?.quantity || 0);
  if (!(held > 0)) throw new Rejected(`이 직원이 실전으로 보유 중인 ${c.symbol} 이 없어요.`);
  const want = c.sellAll ? held : Math.min(Number(c.quantity), held);
  if (!(want > 0)) throw new Rejected('매도 수량이 올바르지 않아요.');

  const fill = await liveSell(c.symbol, want);
  const avg = Number(pos.avgPrice) || fill.avgPrice;
  const pnl = (fill.avgPrice - avg) * fill.filled - fill.feeUsdt;
  let left = held - fill.filled;
  if (left <= held * 1e-9) left = 0;

  await savePosition(member.id, 'live', c.symbol, {
    quantity: left,
    avgPrice: left > 0 ? avg : 0,
    lastPrice: fill.avgPrice,
    realizedPnlUsdt: Number(pos.realizedPnlUsdt || 0) + pnl,
    openedAt: left > 0 ? pos.openedAt || null : null,
  });
  const tradeId = await addTrade({
    memberId: member.id, mode: 'live', symbol: c.symbol, side: 'sell',
    price: fill.avgPrice, quantity: fill.filled, quoteAmountUsdt: fill.cost, feeUsdt: fill.feeUsdt,
    realizedPnlUsdt: pnl, strategyVersion, commandId, reason: '수동 (실전)', exchangeOrderId: fill.orderId,
  });

  let note = '';
  if (left > 0 && pos.stopPrice) {
    try {
      await resetStopLoss(c.symbol, pos.stopPrice, left);
      note = ' · 남은 수량에 손절 주문 다시 걸어둠';
    } catch (err) {
      note = ` · ⚠ 남은 수량 손절 주문 실패: ${err.message}`;
    }
  }
  return {
    tradeId,
    message: `${testnetTag()}실제 매도 ${fill.filled.toPrecision(6)} ${c.symbol} @ ${fill.avgPrice} (손익 ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT)${note}`,
  };
}

function testnetTag() {
  return config.binance.testnet ? '[테스트넷] ' : '';
}
