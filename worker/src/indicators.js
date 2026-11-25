// 지표 계산 (외부 라이브러리 없음).
// 지표 목록·기본값은 capabilities.js 에서 정한다.
// 모든 함수는 캔들 배열과 같은 길이의 배열을 돌려준다. 값을 못 구하는 자리는 null.
// 캔들: { time, open, high, low, close, volume }
//
// RSI 는 기존 파이썬 봇(GetRSI)과 같은 값이 나오게 pandas
// ewm(com=period-1, min_periods=period, adjust=True) 방식을 그대로 옮겼다.

import { effectiveParams, INDICATORS } from './capabilities.js';

export function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i += 1) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

// 일반적인 지수이동평균 (첫 값에서 시작, period-1 번째부터 유효)
export function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const alpha = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) continue;
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    if (i >= period - 1) out[i] = prev;
  }
  return out;
}

// pandas ewm(com, adjust=True, min_periods) 와 같은 계산. null 은 건너뛴다.
function ewmAdjusted(values, com, minPeriods) {
  const out = new Array(values.length).fill(null);
  const decay = 1 - 1 / (1 + com);
  let num = 0;
  let den = 0;
  let count = 0;
  for (let i = 0; i < values.length; i += 1) {
    const v = values[i];
    if (v == null) {
      // pandas 기본값(ignore_na=False): 빈 자리도 가중치가 줄어든다
      if (count > 0) {
        num *= decay;
        den *= decay;
      }
      continue;
    }
    num = v + decay * num;
    den = 1 + decay * den;
    count += 1;
    if (count >= minPeriods) out[i] = num / den;
  }
  return out;
}

export function rsi(closes, period) {
  const gains = closes.map((c, i) => (i === 0 ? null : Math.max(c - closes[i - 1], 0)));
  const losses = closes.map((c, i) => (i === 0 ? null : Math.max(closes[i - 1] - c, 0)));
  const g = ewmAdjusted(gains, period - 1, period);
  const l = ewmAdjusted(losses, period - 1, period);
  return closes.map((_, i) => {
    if (g[i] == null || l[i] == null) return null;
    if (l[i] === 0) return g[i] === 0 ? null : 100;
    return 100 - 100 / (1 + g[i] / l[i]);
  });
}

export function priceChangePct(closes, lookback) {
  return closes.map((c, i) => (i >= lookback && closes[i - lookback] ? (c / closes[i - lookback] - 1) * 100 : null));
}

export function volumeChangePct(volumes, lookback) {
  return volumes.map((v, i) => {
    if (i < lookback) return null;
    let sum = 0;
    for (let j = i - lookback; j < i; j += 1) sum += volumes[j];
    const avg = sum / lookback;
    return avg > 0 ? (v / avg - 1) * 100 : null;
  });
}

// 볼린저 %B (표본표준편차, pandas rolling().std() 와 같음)
export function bollingerPctB(closes, period, stdDev) {
  const mid = sma(closes, period);
  return closes.map((c, i) => {
    if (mid[i] == null || period < 2) return null;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j += 1) sq += (closes[j] - mid[i]) ** 2;
    const sd = Math.sqrt(sq / (period - 1));
    const upper = mid[i] + stdDev * sd;
    const lower = mid[i] - stdDev * sd;
    return upper === lower ? null : (c - lower) / (upper - lower);
  });
}

export function macdHist(closes, fast, slow, signal) {
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const macd = closes.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  const firstValid = macd.findIndex((x) => x != null);
  if (firstValid < 0) return macd;
  const sig = ema(macd.slice(firstValid), signal);
  return macd.map((m, i) => {
    const sv = i >= firstValid ? sig[i - firstValid] : null;
    return m == null || sv == null ? null : m - sv;
  });
}

// 전략 규칙의 { indicator, params } 를 계산한다.
export function series(candles, spec) {
  const closes = candles.map((c) => c.close);
  const def = INDICATORS[spec.indicator];
  if (!def) throw new Error(`지원하지 않는 지표: ${spec.indicator}`);
  const p = effectiveParams(spec); // 빠진 값은 capabilities.js 의 기본값
  const n = (key) => {
    const v = Number(p[key]);
    if (!Number.isFinite(v) || v <= 0) throw new Error(`${spec.indicator}: ${key} 값이 올바르지 않아요.`);
    return v;
  };
  switch (spec.indicator) {
    case 'price':
      return closes;
    case 'price_change_pct':
      return priceChangePct(closes, n('lookbackBars'));
    case 'sma':
      return sma(closes, n('period'));
    case 'ema':
      return ema(closes, n('period'));
    case 'rsi':
      return rsi(closes, n('period'));
    case 'volume_change_pct':
      return volumeChangePct(candles.map((c) => c.volume), n('lookbackBars'));
    case 'bollinger_pct_b':
      return bollingerPctB(closes, n('period'), n('stdDev'));
    case 'macd_hist':
      return macdHist(closes, n('fast'), n('slow'), n('signal'));
    default:
      throw new Error(`지원하지 않는 지표: ${spec.indicator}`);
  }
}
