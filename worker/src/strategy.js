// 승인된 전략 규칙(rules)으로 진입·청산을 판단한다. (외부 라이브러리 없음)
//
// 판단 기준 봉: 마지막 '완성된' 봉. 지금 만들어지고 있는 봉은 쓰지 않는다.
//   → 같은 봉 안에서는 몇 번을 확인해도 같은 결과가 나온다.

import { conditionText } from './capabilities.js';
import { series } from './indicators.js';

// 거래소 캔들에서 아직 안 끝난 마지막 봉을 뺀다.
export function closedCandles(candles, now = Date.now(), timeframeMs) {
  if (candles.length === 0) return candles;
  const last = candles[candles.length - 1];
  return timeframeMs && last.time + timeframeMs > now ? candles.slice(0, -1) : candles;
}

export const TIMEFRAME_MS = {
  '1m': 60e3,
  '5m': 5 * 60e3,
  '15m': 15 * 60e3,
  '1h': 60 * 60e3,
  '4h': 4 * 60 * 60e3,
  '1d': 24 * 60 * 60e3,
};

function valueAt(candles, spec, cache) {
  const key = JSON.stringify([spec.indicator, spec.params || {}]);
  if (!cache.has(key)) cache.set(key, series(candles, spec));
  return cache.get(key);
}

// 조건 하나 확인. 결과와 함께 화면에 보여줄 설명을 돌려준다.
export function checkCondition(candles, cond, cache = new Map()) {
  const t = candles.length - 1;
  const left = valueAt(candles, cond, cache);
  const right =
    typeof cond.value === 'number' ? null : valueAt(candles, cond.value, cache);
  const r = (i) => (typeof cond.value === 'number' ? cond.value : right?.[i] ?? null);

  const l0 = left[t];
  const r0 = r(t);
  const label = conditionText(cond); // AI가 쓴 description 이 아니라 규칙 그대로
  if (l0 == null || r0 == null) {
    return { ok: false, label, detail: '데이터 부족' };
  }

  let ok;
  switch (cond.op) {
    case '>': ok = l0 > r0; break;
    case '>=': ok = l0 >= r0; break;
    case '<': ok = l0 < r0; break;
    case '<=': ok = l0 <= r0; break;
    case 'crosses_above':
    case 'crosses_below': {
      const l1 = left[t - 1];
      const r1 = r(t - 1);
      if (l1 == null || r1 == null) return { ok: false, label, detail: '데이터 부족' };
      ok = cond.op === 'crosses_above' ? l1 <= r1 && l0 > r0 : l1 >= r1 && l0 < r0;
      break;
    }
    default:
      throw new Error(`지원하지 않는 비교: ${cond.op}`);
  }
  return { ok, label, detail: `${fmt(l0)} ${cond.op} ${fmt(r0)}` };
}

export function checkConditions(candles, conditions = [], logic = 'all') {
  if (conditions.length === 0) return { ok: false, results: [] };
  const cache = new Map();
  const results = conditions.map((c) => checkCondition(candles, c, cache));
  const ok = logic === 'any' ? results.some((r) => r.ok) : results.every((r) => r.ok);
  return { ok, results };
}

export function evaluateEntry(rules, candles) {
  return checkConditions(candles, rules.entry?.conditions, rules.entry?.logic);
}

// 보유 중인 포지션을 팔아야 하는지. price = 지금 가격
export function evaluateExit(rules, position, price, candles, now = Date.now()) {
  const exit = rules.exit || {};
  const avg = Number(position.avgPrice);
  const pnlPct = avg > 0 ? (price / avg - 1) * 100 : 0;

  if (exit.stopLossPct && pnlPct <= -exit.stopLossPct) {
    return { exit: true, reason: `손절 ${pnlPct.toFixed(2)}% (기준 -${exit.stopLossPct}%)` };
  }
  if (exit.takeProfitPct && pnlPct >= exit.takeProfitPct) {
    return { exit: true, reason: `익절 +${pnlPct.toFixed(2)}% (기준 +${exit.takeProfitPct}%)` };
  }
  if (exit.maxHoldHours && position.openedAt != null && now - position.openedAt >= exit.maxHoldHours * 3600e3) {
    return { exit: true, reason: `최대 보유시간 ${exit.maxHoldHours}시간 경과` };
  }
  if (Array.isArray(exit.conditions) && exit.conditions.length > 0) {
    const r = checkConditions(candles, exit.conditions, exit.logic || 'any');
    if (r.ok) {
      return { exit: true, reason: `청산 조건: ${r.results.filter((x) => x.ok).map((x) => x.label).join(', ')}` };
    }
  }
  return { exit: false, reason: `보유 유지 (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)` };
}

export function summarize(results) {
  return results.map((r) => `${r.ok ? '✓' : '✗'} ${r.label} (${r.detail})`).join(' / ');
}

function fmt(n) {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  return n.toPrecision(4);
}
