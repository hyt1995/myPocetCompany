// 순수 로직 테스트. 실행: npm test (노트북), 외부 연결 없이 돈다.
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bollingerPctB, ema, rsi, series, sma } from '../src/indicators.js';
import { applyBuy, applySell, paperCash } from '../src/paper.js';
import { canonicalString, verifySignature } from '../src/signature.js';
import { checkCondition, closedCandles, evaluateEntry, evaluateExit } from '../src/strategy.js';

// 기존 파이썬 봇의 GetRSI / GetMA 로 계산한 값 (pandas)
const ref = JSON.parse(readFileSync(new URL('./pandas-reference.json', import.meta.url)));
const at = (arr, i) => arr.at(i);
const close = (a, b) => Math.abs(a - b) < 1e-9;

test('RSI 가 기존 파이썬 GetRSI 와 같다', () => {
  const r14 = rsi(ref.closes, 14);
  [-1, -2, -3, 20].forEach((i, k) => assert.ok(close(at(r14, i), ref.rsi14[k]), `rsi14[${i}] ${at(r14, i)} vs ${ref.rsi14[k]}`));
  const r7 = rsi(ref.closes, 7);
  [-1, -50].forEach((i, k) => assert.ok(close(at(r7, i), ref.rsi7[k])));
});

test('이동평균이 기존 GetMA 와 같다', () => {
  const m5 = sma(ref.closes, 5);
  [-1, -2, -4].forEach((i, k) => assert.ok(close(at(m5, i), ref.ma5[k])));
  assert.ok(close(at(sma(ref.closes, 20), -2), ref.ma20));
});

test('볼린저 %B 가 pandas 와 같다', () => {
  assert.ok(close(at(bollingerPctB(ref.closes, 20, 2), -1), ref.pctb));
});

test('EMA 기본 동작', () => {
  const e = ema([1, 2, 3, 4, 5], 3);
  assert.equal(e[0], null);
  assert.ok(close(e[4], 4.0625));
});

const candles = ref.closes.map((c, i) => ({ time: i * 3600e3, open: c, high: c, low: c, close: c, volume: ref.volumes[i] }));

test('조건 비교와 교차', () => {
  const r = checkCondition(candles, { indicator: 'rsi', params: { period: 14 }, op: '<', value: 100 });
  assert.equal(r.ok, true);
  const up = [10, 10, 10, 9, 8, 12].map((c, i) => ({ time: i, close: c, volume: 1 }));
  const cross = checkCondition(up, {
    indicator: 'price', op: 'crosses_above', value: { indicator: 'sma', params: { period: 3 } },
  });
  assert.equal(cross.ok, true); // 직전 봉 8 <= sma 9, 지금 12 > sma 9.67
  const e = evaluateEntry(
    { entry: { logic: 'any', conditions: [{ indicator: 'price', op: '>', value: 1e9 }, { indicator: 'price', op: '>', value: 0 }] } },
    candles,
  );
  assert.equal(e.ok, true);
  assert.equal(series(candles, { indicator: 'price' }).length, candles.length);
});

test('아직 안 끝난 봉은 뺀다', () => {
  const now = 10 * 3600e3 + 1000;
  const cs = [{ time: 9 * 3600e3 }, { time: 10 * 3600e3 }];
  assert.equal(closedCandles(cs, now, 3600e3).length, 1);
  assert.equal(closedCandles(cs, 11 * 3600e3 + 1, 3600e3).length, 2);
});

test('청산: 손절·익절·보유시간', () => {
  const rules = { exit: { stopLossPct: 2, takeProfitPct: 5, maxHoldHours: 72 } };
  const pos = { avgPrice: 100, quantity: 1, openedAt: 0 };
  assert.match(evaluateExit(rules, pos, 97.9, [], 1000).reason, /손절/);
  assert.match(evaluateExit(rules, pos, 105.1, [], 1000).reason, /익절/);
  assert.match(evaluateExit(rules, pos, 100, [], 73 * 3600e3).reason, /최대 보유/);
  assert.equal(evaluateExit(rules, pos, 101, [], 1000).exit, false);
});

test('모의 매수·매도 손익 (수수료 포함)', () => {
  const b1 = applyBuy({}, { price: 100, quoteAmountUsdt: 100, feeRate: 0.001, now: 5 });
  assert.equal(b1.position.quantity, 1);
  assert.ok(close(b1.position.realizedPnlUsdt, -0.1));
  const b2 = applyBuy(b1.position, { price: 200, quoteAmountUsdt: 100, feeRate: 0.001, now: 9 });
  assert.ok(close(b2.position.avgPrice, 200 / 1.5)); // (100*1 + 200*0.5) / 1.5
  assert.equal(b2.position.openedAt, 5);
  const s = applySell(b2.position, { price: 150, quantity: null, feeRate: 0.001 });
  assert.equal(s.position.quantity, 0);
  assert.ok(close(s.trade.realizedPnlUsdt, (150 - 200 / 1.5) * 1.5 - 0.225));
  assert.ok(close(paperCash(1000, [s.position]), 1000 + s.position.realizedPnlUsdt));
  assert.throws(() => applySell(s.position, { price: 150, feeRate: 0 }), /보유 수량/);
});

test('서명: 사이트 방식과 같다', () => {
  const c = { memberId: 'm', type: 'live_buy', symbol: 'BTCUSDT', quoteAmountUsdt: 100, quantity: null, sellAll: false, createdAt: 1, expiresAt: 300001 };
  assert.equal(canonicalString(c, 'abc'), 'abc|m|live_buy|BTCUSDT|100||1|300001');
  const signature = createHmac('sha256', 's').update('abc|m|live_buy|BTCUSDT|100||1|300001').digest('hex');
  assert.equal(verifySignature({ ...c, signature }, 'abc', 's'), true);
  assert.equal(verifySignature({ ...c, quoteAmountUsdt: 1000, signature }, 'abc', 's'), false); // 금액 조작
  assert.equal(verifySignature({ ...c, signature }, 'abc', 'other'), false);
  assert.equal(verifySignature({ ...c, signature: undefined }, 'abc', 's'), false);
});
