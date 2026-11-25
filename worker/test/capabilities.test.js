// 프로그램이 할 수 있는 일(capabilities.js) 검사.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  capabilityGuide,
  describeRules,
  INDICATORS,
  judgeStrategyOutput,
  validateRules,
} from '../src/capabilities.js';
import { series } from '../src/indicators.js';
import { checkCondition } from '../src/strategy.js';

const good = () => ({
  market: 'binance_spot',
  symbols: ['BTCUSDT', 'ETHUSDT'],
  timeframe: '1d',
  checkEveryMinutes: 1440,
  entry: {
    logic: 'all',
    conditions: [{ indicator: 'price_change_pct', params: { lookbackBars: 1 }, op: '<=', value: -10, description: '어제 -10% 이하' }],
  },
  exit: { takeProfitPct: 5, stopLossPct: 5, maxHoldHours: 168, logic: 'any', conditions: [] },
  position: { quoteAmountUsdt: 20, maxOpenPositions: 10 },
});

test('사이트 lib/capabilities.js 와 노트북 worker/src/capabilities.js 는 같은 파일이다', () => {
  const site = new URL('../../lib/capabilities.js', import.meta.url);
  if (!existsSync(site)) return; // 노트북에 worker 폴더만 있을 때
  const worker = new URL('../src/capabilities.js', import.meta.url);
  assert.equal(readFileSync(worker, 'utf8'), readFileSync(site, 'utf8'));
});

test('올바른 규칙은 통과한다', () => {
  assert.deepEqual(validateRules(good()), []);
});

test('프로그램이 모르는 항목은 어디에 있든 막는다', () => {
  const cases = [
    (r) => (r.rank = { by: 'volume', top: 10 }),
    (r) => (r.position.pctOfCapital = 5),
    (r) => (r.exit.trailingStopPct = 3),
    (r) => (r.entry.cooldownHours = 24),
    (r) => (r.entry.conditions[0].timeframe = '1h'),
    (r) => (r.entry.conditions[0].params.symbol = 'BTCUSDT'),
  ];
  for (const change of cases) {
    const r = good();
    change(r);
    const errors = validateRules(r);
    assert.ok(errors.some((e) => e.includes('모르는 항목')), JSON.stringify(errors));
  }
});

test('지표·비교·숫자 범위를 엄격하게 본다', () => {
  const withCond = (c) => {
    const r = good();
    r.entry.conditions = [c];
    return validateRules(r);
  };
  assert.ok(withCond({ indicator: 'stochastic', op: '<', value: 20 }).length);
  assert.ok(withCond({ indicator: 'rsi', params: { period: 14.5 }, op: '<', value: 30 }).length);
  assert.ok(withCond({ indicator: 'rsi', op: '<', value: 300 }).length);
  assert.ok(withCond({ indicator: 'rsi', op: 'between', value: 30 }).length);
  assert.ok(withCond({ indicator: 'sma', op: '>', value: 100 }).length, 'sma period 필수');
  assert.ok(withCond({ indicator: 'rsi', op: '>', value: { indicator: 'sma', params: { period: 20 } } }).length, '단위가 다름');
  assert.ok(withCond({ indicator: 'macd_hist', params: { fast: 30, slow: 26 }, op: '>', value: 0 }).length);
  assert.deepEqual(withCond({ indicator: 'rsi', op: '<', value: 30 }), [], 'rsi period 기본 14');
  assert.deepEqual(
    withCond({ indicator: 'price', op: 'crosses_above', value: { indicator: 'ema', params: { period: 20 } } }),
    [],
    '가격과 이동평균은 비교 가능',
  );

  const r = good();
  delete r.exit.stopLossPct;
  assert.ok(validateRules(r).some((e) => e.includes('손절')));
  const r2 = good();
  r2.position.quoteAmountUsdt = 1;
  assert.ok(validateRules(r2).length, '최소 주문 금액');
  const r3 = good();
  r3.symbols = ['BTCUSDT', 'BTCUSDT'];
  assert.ok(validateRules(r3).length, '중복 종목');
  const r4 = good();
  r4.timeframe = '1w';
  assert.ok(validateRules(r4).length);
});

test('화면 설명은 AI의 description 이 아니라 규칙에서 만든다', () => {
  const r = good();
  r.entry.conditions[0].description = 'RSI 30 미만'; // 거짓 설명
  const text = JSON.stringify(describeRules(r));
  assert.ok(text.includes('가격 변화율(1봉 전 종가 대비, %) ≤ -10'));
  assert.ok(!text.includes('RSI 30 미만'));
  assert.ok(text.includes('20 USDT'));
  assert.ok(text.includes('BTCUSDT, ETHUSDT'));
  assert.ok(text.includes('5% 이상 떨어짐'));
});

test('노트북 로그의 조건 이름도 규칙에서 만든다', () => {
  const candles = [100, 100, 89].map((close, i) => ({ time: i, open: close, high: close, low: close, close, volume: 1 }));
  const r = checkCondition(candles, { indicator: 'price_change_pct', params: { lookbackBars: 1 }, op: '<=', value: -10, description: '거짓말' });
  assert.equal(r.ok, true);
  assert.ok(r.label.includes('가격 변화율'));
});

test('지표 계산 기본값은 capabilities 표의 기본값과 같다', () => {
  const candles = Array.from({ length: 120 }, (_, i) => {
    const close = 100 + Math.sin(i / 5) * 10 + i * 0.1;
    return { time: i, open: close, high: close, low: close, close, volume: 10 + (i % 7) };
  });
  for (const [name, def] of Object.entries(INDICATORS)) {
    const explicit = {};
    for (const [k, s] of Object.entries(def.params)) if (s.default != null) explicit[k] = s.default;
    if (Object.values(def.params).some((s) => s.default == null)) continue;
    assert.deepEqual(series(candles, { indicator: name }), series(candles, { indicator: name, params: explicit }), name);
  }
});

test('AI가 못 한다고 하면 규칙을 버리고 실행 불가로 둔다', () => {
  // 매일 바뀌는 순위 → 고정 목록으로 바꿔 넣으려 해도 unsupported 가 있으면 버린다
  const j = judgeStrategyOutput({
    feasibility: 'ok',
    unsupported: [{ request: '어제 거래량 상위 10개', reason: '순위 기능 없음', alternative: '고정 10개' }],
    rules: good(),
  });
  assert.equal(j.executable, false);
  assert.equal(j.feasibility, 'partial');
  assert.equal(j.rules, null);

  const k = judgeStrategyOutput({ feasibility: 'impossible', rules: good() });
  assert.equal(k.executable, false);
  assert.equal(k.rules, null);
  assert.equal(k.unsupported.length, 1, '이유가 없어도 막고 안내를 붙인다');

  assert.equal(judgeStrategyOutput(null).executable, false);
  assert.equal(judgeStrategyOutput({ rules: good() }).executable, false, 'feasibility 가 없으면 막는다');

  const ok = judgeStrategyOutput({
    feasibility: 'ok',
    unsupported: [],
    assumptions: [{ item: '손절', value: '5%', why: '요청에 없음' }],
    rules: good(),
  });
  assert.equal(ok.executable, true);
  assert.deepEqual(ok.validationErrors, []);
  assert.equal(ok.assumptions[0].item, '손절');

  const bad = good();
  bad.rank = 'volume';
  assert.ok(judgeStrategyOutput({ feasibility: 'ok', rules: bad }).validationErrors.length);
});

test('AI 설명에 못 하는 일 목록과 숫자 범위가 들어간다', () => {
  const g = capabilityGuide();
  assert.ok(g.includes('매번 바뀌는 종목 고르기'));
  assert.ok(g.includes('stopLossPct(필수)'));
  for (const name of Object.keys(INDICATORS)) assert.ok(g.includes(`- ${name} (`), name);
});
