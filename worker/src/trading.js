// 모의매매 실행과 전략 실행. (실전 주문은 commands.js → live.js)

import { validateRules } from './capabilities.js';
import { config } from './config.js';
import { addTrade, listPositions, savePosition } from './db.js';
import { fetchCandles, fetchPrice } from './market.js';
import { applyBuy, applySell, emptyPosition, paperCash } from './paper.js';
import { closedCandles, evaluateEntry, evaluateExit, summarize, TIMEFRAME_MS } from './strategy.js';

const capitalOf = (member) => Number(member.paperCapitalUsdt) || 1000;
const fmtQty = (q) => Number(q.toPrecision(6));

export async function paperBuy({ member, symbol, quoteAmountUsdt, reason, commandId = null, strategyVersion = null }) {
  const price = await fetchPrice(symbol);
  const positions = await listPositions(member.id, 'paper');
  const cash = paperCash(capitalOf(member), positions);
  const fee = quoteAmountUsdt * config.paperFeeRate;
  if (quoteAmountUsdt + fee > cash + 1e-9) {
    throw new Error(`모의 잔고 부족: 남은 가상자금 ${cash.toFixed(2)} USDT`);
  }

  const current = positions.find((p) => p.symbol === symbol) || emptyPosition();
  const { position, trade } = applyBuy(current, { price, quoteAmountUsdt, feeRate: config.paperFeeRate });
  await savePosition(member.id, 'paper', symbol, { ...position, lastPrice: price });
  const tradeId = await addTrade({
    memberId: member.id, mode: 'paper', symbol, ...trade, strategyVersion, commandId, reason,
  });
  return { tradeId, message: `모의 매수 ${fmtQty(trade.quantity)} ${symbol} @ ${price}` };
}

export async function paperSell({ member, symbol, quantity = null, reason, commandId = null, strategyVersion = null }) {
  const price = await fetchPrice(symbol);
  const positions = await listPositions(member.id, 'paper');
  const current = positions.find((p) => p.symbol === symbol);
  if (!current || !(Number(current.quantity) > 0)) throw new Error(`모의로 보유 중인 ${symbol} 이 없어요.`);

  const { position, trade } = applySell(current, { price, quantity, feeRate: config.paperFeeRate });
  await savePosition(member.id, 'paper', symbol, { ...position, lastPrice: price });
  const tradeId = await addTrade({
    memberId: member.id, mode: 'paper', symbol, ...trade, strategyVersion, commandId, reason,
  });
  const pnl = trade.realizedPnlUsdt;
  return {
    tradeId,
    message: `모의 매도 ${fmtQty(trade.quantity)} ${symbol} @ ${price} (손익 ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USDT)`,
  };
}

// 이 직원이 보유 중인 코인(모의·실전)의 현재가를 갱신한다. 사이트 현황 탭을 열 때 명령으로 온다.
export async function refreshMemberPrices(member) {
  const positions = (await listPositions(member.id)).filter((p) => Number(p.quantity) > 0);
  if (positions.length === 0) return { message: '보유 중인 코인이 없어요.' };
  const prices = new Map();
  for (const p of positions) {
    if (!prices.has(p.symbol)) prices.set(p.symbol, await fetchPrice(p.symbol));
    await savePosition(member.id, p.mode, p.symbol, { lastPrice: prices.get(p.symbol) });
  }
  return { message: `현재가 갱신: ${[...prices].map(([s, v]) => `${s} ${v}`).join(', ')}` };
}

// 승인된 전략으로 한 번 확인하고, 조건이 맞으면 모의매매한다.
// 규칙이 capabilities.js 검사를 통과하지 못하면 아무것도 사고팔지 않는다.
export async function runStrategy(member, strategy, { commandId = null, trigger = '자동' } = {}) {
  const rules = strategy.rules;
  const errors = validateRules(rules);
  if (errors.length) {
    throw new Error(`v${strategy.version} 전략이 프로그램 규칙 검사를 통과하지 못해 실행하지 않았어요: ${errors.join(' / ')}`);
  }
  const tfMs = TIMEFRAME_MS[rules.timeframe];
  const maxOpen = Number(rules.position?.maxOpenPositions) || 1;
  const messages = [];

  for (const symbol of rules.symbols || []) {
    try {
      const candles = closedCandles(await fetchCandles(symbol, rules.timeframe), Date.now(), tfMs);
      const price = await fetchPrice(symbol);
      const positions = await listPositions(member.id, 'paper');
      const pos = positions.find((p) => p.symbol === symbol);
      const base = { member, symbol, commandId, strategyVersion: strategy.version };

      if (pos && Number(pos.quantity) > 0) {
        const ex = evaluateExit(rules, pos, price, candles);
        if (ex.exit) {
          const r = await paperSell({ ...base, reason: `${trigger}: ${ex.reason}` });
          messages.push(r.message);
        } else {
          await savePosition(member.id, 'paper', symbol, { lastPrice: price });
          messages.push(`${symbol}: ${ex.reason}`);
        }
        continue;
      }

      const open = positions.filter((p) => Number(p.quantity) > 0).length;
      if (open >= maxOpen) {
        messages.push(`${symbol}: 동시 보유 한도(${maxOpen}개)라 진입 안 함`);
        continue;
      }

      const entry = evaluateEntry(rules, candles);
      if (entry.ok) {
        const r = await paperBuy({
          ...base,
          quoteAmountUsdt: Number(rules.position.quoteAmountUsdt),
          reason: `${trigger}: 진입 ${summarize(entry.results)}`,
        });
        messages.push(r.message);
      } else {
        messages.push(`${symbol}: 진입 조건 불충족 — ${summarize(entry.results)}`);
      }
    } catch (err) {
      messages.push(`${symbol}: 오류 — ${err.message}`);
    }
  }
  return messages;
}
