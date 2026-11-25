// 노트북 매매 프로그램이 할 수 있는 일 — 여기 한 곳에서 정의한다.
//
// 이 파일은 사이트 lib/capabilities.js 와 노트북 worker/src/capabilities.js 가 글자 하나까지 같다.
// (같이 고친다. worker 테스트가 두 파일이 같은지 확인한다.)
//
// 아래 표 하나에서 세 가지가 만들어진다.
//   1) capabilityGuide()  전략 AI에게 보여주는 설명 → AI가 프로그램이 뭘 할 수 있는지 정확히 안다
//   2) validateRules()    규칙 검사 → 표에 없는 칸·지표·값은 통과 못 한다 (사이트 승인 때, 노트북 실행 때 둘 다)
//   3) describeRules()    규칙을 사람 말로 → 화면의 "프로그램이 실제로 하는 일" (AI 설명이 아니라 코드가 만든다)
// 그래서 표에 없는 것은 AI도 모르고, 검사도 통과 못 하고, 프로그램도 실행하지 않는다.
//
// 프로그램 동작(worker/src/trading.js, strategy.js, indicators.js)을 바꾸면 이 파일도 같이 고친다.

export const CAPABILITIES_VERSION = 1;

export const TIMEFRAMES = {
  '1m': '1분봉',
  '5m': '5분봉',
  '15m': '15분봉',
  '1h': '1시간봉',
  '4h': '4시간봉',
  '1d': '일봉',
};

const int = (min, max, dflt) => ({ type: 'int', min, max, default: dflt });
const num = (min, max, dflt) => ({ type: 'number', min, max, default: dflt });

// 지표. params 의 default 가 없으면 반드시 넣어야 한다. unit 이 같은 지표끼리만 비교할 수 있다.
// valueRange: 숫자와 비교할 때 말이 되는 범위 (밖이면 조건이 항상 참/거짓이 된다)
export const INDICATORS = {
  price: {
    params: {},
    unit: 'price',
    valueRange: [0, 1e9],
    desc: '마지막 완성 봉의 종가 (USDT)',
    label: () => '가격(마지막 완성 봉 종가)',
  },
  price_change_pct: {
    params: { lookbackBars: int(1, 200, 1) },
    unit: 'price_change_pct',
    valueRange: [-100, 10000],
    desc: '마지막 완성 봉 종가가 N봉 전 종가보다 몇 % 변했는지. 일봉 + lookbackBars 1 = 어제 하루 변화율',
    label: (p) => `가격 변화율(${p.lookbackBars}봉 전 종가 대비, %)`,
  },
  sma: {
    params: { period: int(2, 200) },
    unit: 'price',
    valueRange: [0, 1e9],
    desc: '종가 단순 이동평균',
    label: (p) => `단순이동평균(${p.period})`,
  },
  ema: {
    params: { period: int(2, 200) },
    unit: 'price',
    valueRange: [0, 1e9],
    desc: '종가 지수 이동평균',
    label: (p) => `지수이동평균(${p.period})`,
  },
  rsi: {
    params: { period: int(2, 100, 14) },
    unit: 'rsi',
    valueRange: [0, 100],
    desc: 'RSI 0~100 (기존 파이썬 GetRSI 와 같은 값)',
    label: (p) => `RSI(${p.period})`,
  },
  volume_change_pct: {
    params: { lookbackBars: int(1, 200, 20) },
    unit: 'volume_change_pct',
    valueRange: [-100, 100000],
    desc: '마지막 완성 봉 거래량이 그 앞 N봉 평균 거래량보다 몇 % 많은지',
    label: (p) => `거래량 변화율(앞 ${p.lookbackBars}봉 평균 대비, %)`,
  },
  bollinger_pct_b: {
    params: { period: int(2, 200, 20), stdDev: num(0.5, 4, 2) },
    unit: 'bollinger_pct_b',
    valueRange: [-2, 3],
    desc: '볼린저밴드 %B (0 = 하단선, 0.5 = 중간선, 1 = 상단선)',
    label: (p) => `볼린저 %B(${p.period}, ${p.stdDev})`,
  },
  macd_hist: {
    params: { fast: int(2, 100, 12), slow: int(3, 150, 26), signal: int(2, 50, 9) },
    unit: 'macd_hist',
    valueRange: [-1e9, 1e9],
    desc: 'MACD 히스토그램 (MACD선 − 시그널선). 0 위면 상승 힘이 우세',
    label: (p) => `MACD 히스토그램(${p.fast}, ${p.slow}, ${p.signal})`,
  },
};

export const OPERATORS = {
  '>': '>',
  '>=': '≥',
  '<': '<',
  '<=': '≤',
  crosses_above: '상향 돌파',
  crosses_below: '하향 돌파',
};

export const LIMITS = {
  symbols: 20, // 종목 최대 개수
  conditions: 10, // 진입·청산 조건 각각 최대 개수
  checkEveryMinutes: int(1, 1440),
  quoteAmountUsdt: num(5, 10000), // 바이낸스 현물 최소 주문 금액이 약 5 USDT
  maxOpenPositions: int(1, 20, 1),
  stopLossPct: num(0.1, 50),
  takeProfitPct: num(0.1, 1000),
  maxHoldHours: num(1, 8760),
};

// 프로그램이 실제로 이렇게 움직인다 (worker/src/trading.js runStrategy).
export const BEHAVIOR = [
  '정해진 확인 시각에만 한 번씩 확인한다. 그 사이에는 시세를 보지 않는다. 확인 시각은 프로그램 탭 스케줄(전략 기본 = checkEveryMinutes 마다 / N분마다 / 매일 정해진 시각)로 정한다.',
  '자동 실행은 모의매매만 한다. 실제 돈 매매는 사장님이 직접 버튼이나 확인 카드로만 한다.',
  '종목 목록(symbols)은 고정이다. 적힌 종목만, 적힌 순서대로 하나씩 확인한다.',
  '지표는 마지막으로 완성된 봉으로 계산한다. 지금 만들어지고 있는 봉은 쓰지 않는다. 일봉은 한국 시간 오전 9시에 마감된다.',
  '보유 중이 아닌 종목: 동시 보유 수가 한도 미만이고 진입 조건이 맞으면, 정해진 USDT 금액만큼 시장가로 산다.',
  '보유 중인 종목: 추가로 사지 않고(물타기 없음), 청산만 확인한다.',
  '청산은 손절 → 익절 → 최대 보유시간 → 청산 조건 순서로 보고, 하나라도 맞으면 전량을 시장가로 판다. 손절·익절은 확인 시각의 현재가와 평균 매수가로 계산한다.',
  '동시 보유 수에는 이 직원이 모의로 가진 모든 코인(수동으로 산 것 포함)이 들어간다. 한도가 차면 목록 뒤쪽 종목은 확인하지 않고 넘어간다.',
  '모의매매 수수료 0.1% 를 반영한다. 바이낸스에 없는 종목은 그 종목만 오류로 건너뛴다.',
];

// 프로그램이 못 하는 것. AI는 이런 요청을 다른 것으로 바꿔 넣지 않고 "실행 불가"로 알려야 한다.
export const CANNOT = [
  { what: '매번 바뀌는 종목 고르기 (거래량·시가총액·상승률·하락률 순위, 전체 코인 스캔, 신규 상장)', alternative: '종목 목록을 고정으로 정한다' },
  { what: '뉴스·SNS·공시·감성 분석, 외부 데이터 (김치프리미엄, 펀딩비, 공포탐욕지수, 온체인, 다른 거래소 가격)', alternative: '가격·거래량 지표로 표현할 수 있는 부분만 쓴다' },
  { what: '선물·레버리지·공매도(하락에 돈 걸기)', alternative: '현물 매수 후 매도만 가능' },
  { what: '지정가 주문, 정해진 가격에 걸어 두기', alternative: '확인 시각에 시장가로 사고판다' },
  { what: '분할 매수·물타기·불타기, 보유 중 추가 매수', alternative: '종목당 한 번 사고, 판 뒤에 다시 살 수 있다' },
  { what: '분할 매도·일부 익절', alternative: '조건이 맞으면 전량 매도' },
  { what: '트레일링 스톱, 손절가를 본전·수익 구간으로 옮기기', alternative: '고정 손절 %와 익절 %' },
  { what: '자금의 % 또는 잔고에 따라 금액 바꾸기, 복리', alternative: '1회 매수 금액을 USDT 고정값으로 정한다' },
  { what: '종목끼리 비교하는 조건 (예: BTC가 오르면 ETH 매수)', alternative: '각 종목은 자기 차트로만 판단한다' },
  { what: '여러 봉 섞기 (예: 일봉 추세 + 1시간봉 진입)', alternative: '전략 하나에 봉 하나' },
  { what: `목록에 없는 지표 (스토캐스틱, ATR, 일목균형표, VWAP, 피보나치, 캔들 패턴, 지지·저항선, 다이버전스, 고가·저가 기준 조건 등)`, alternative: '지원하는 지표로 다시 정한다' },
  { what: '시각·요일 조건을 규칙 안에 넣기', alternative: '확인 시각은 프로그램 탭 스케줄로 정한다 (schedule 제안)' },
  { what: '판 뒤 일정 시간 다시 안 사기(쿨다운), 연속 손실 시 자동 중지, 하루 거래 횟수 제한', alternative: '없음 — 필요하면 사장님이 프로그램을 정지' },
];

// ---------------------------------------------------------------------------
// 전략 AI에게 주는 설명

export function capabilityGuide() {
  const indicators = Object.entries(INDICATORS)
    .map(([k, v]) => {
      const params = Object.entries(v.params)
        .map(([p, s]) => `${p}: ${s.type === 'int' ? '정수' : '숫자'} ${s.min}~${s.max}${s.default != null ? `, 기본 ${s.default}` : ', 필수'}`)
        .join(' / ');
      return `- ${k} (${params || '파라미터 없음'}): ${v.desc}. 숫자와 비교할 때 범위 ${v.valueRange[0]}~${v.valueRange[1]}`;
    })
    .join('\n');
  const l = LIMITS;
  return `[노트북 매매 프로그램이 할 수 있는 일 — 이것이 전부다]
시장: 바이낸스 현물 USDT 마켓만 (symbols 예: BTCUSDT). 종목 최대 ${l.symbols}개.
봉(timeframe): ${Object.entries(TIMEFRAMES).map(([k, v]) => `${k}=${v}`).join(', ')}. 전략 하나에 봉 하나.
비교(op): >, >=, <, <=, crosses_above(직전 봉엔 이하, 이번 봉엔 초과), crosses_below(반대).
value: 숫자, 또는 같은 종류(unit)의 지표 { "indicator", "params" }. 가격·단순이동평균·지수이동평균은 서로 비교할 수 있고, 다른 지표는 같은 지표끼리만 비교한다.
진입 조건 1~${l.conditions}개 (logic all = 모두 / any = 하나라도). 청산 조건 0~${l.conditions}개.
지표:
${indicators}
숫자 범위: checkEveryMinutes ${l.checkEveryMinutes.min}~${l.checkEveryMinutes.max} 정수, quoteAmountUsdt(1회 매수 USDT) ${l.quoteAmountUsdt.min}~${l.quoteAmountUsdt.max}, maxOpenPositions ${l.maxOpenPositions.min}~${l.maxOpenPositions.max} 정수, stopLossPct(필수) ${l.stopLossPct.min}~${l.stopLossPct.max}, takeProfitPct ${l.takeProfitPct.min}~${l.takeProfitPct.max}, maxHoldHours ${l.maxHoldHours.min}~${l.maxHoldHours.max}.

[프로그램 동작 방식]
${BEHAVIOR.map((b) => `- ${b}`).join('\n')}

[프로그램이 못 하는 일 → 이런 요청은 "실행 불가"로 알린다]
${CANNOT.map((c) => `- ${c.what} (대안: ${c.alternative})`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// 규칙 검사 (엄격). 표에 없는 칸이 하나라도 있으면 통과 못 한다.
// → 프로그램이 모르는 칸을 조용히 무시해서 사장님 생각과 다르게 매매하는 일을 막는다.

const RULE_KEYS = ['market', 'symbols', 'timeframe', 'checkEveryMinutes', 'entry', 'exit', 'position'];
const ENTRY_KEYS = ['logic', 'conditions'];
const EXIT_KEYS = ['takeProfitPct', 'stopLossPct', 'maxHoldHours', 'logic', 'conditions'];
const POSITION_KEYS = ['quoteAmountUsdt', 'maxOpenPositions'];
const CONDITION_KEYS = ['indicator', 'params', 'op', 'value', 'description'];
const VALUE_KEYS = ['indicator', 'params'];

export function validateRules(rules) {
  const errors = [];
  if (!isObject(rules)) return ['규칙(rules)이 없어요.'];
  unknownKeys(rules, RULE_KEYS, '규칙', errors);

  if (rules.market !== 'binance_spot') errors.push('market 은 binance_spot 이어야 해요.');

  if (!Array.isArray(rules.symbols) || rules.symbols.length === 0) {
    errors.push('종목(symbols)이 없어요.');
  } else {
    if (rules.symbols.length > LIMITS.symbols) errors.push(`종목은 최대 ${LIMITS.symbols}개예요.`);
    const bad = rules.symbols.filter((s) => typeof s !== 'string' || !/^[A-Z0-9]{2,15}USDT$/.test(s));
    if (bad.length) errors.push(`종목 이름이 올바르지 않아요: ${bad.join(', ')} (예: BTCUSDT)`);
    if (new Set(rules.symbols).size !== rules.symbols.length) errors.push('같은 종목이 두 번 들어 있어요.');
  }

  if (!TIMEFRAMES[rules.timeframe]) errors.push(`봉(timeframe)은 ${Object.keys(TIMEFRAMES).join(', ')} 중 하나여야 해요.`);
  checkNumber(rules.checkEveryMinutes, LIMITS.checkEveryMinutes, '확인 주기(checkEveryMinutes)', errors, true);

  // 진입
  if (!isObject(rules.entry)) {
    errors.push('진입(entry)이 없어요.');
  } else {
    unknownKeys(rules.entry, ENTRY_KEYS, '진입', errors);
    if (!['all', 'any'].includes(rules.entry.logic)) errors.push('진입 logic 은 all 또는 any 여야 해요.');
    const conds = rules.entry.conditions;
    if (!Array.isArray(conds) || conds.length === 0) errors.push('진입 조건이 없어요.');
    else if (conds.length > LIMITS.conditions) errors.push(`진입 조건은 최대 ${LIMITS.conditions}개예요.`);
    else conds.forEach((c, i) => checkCondition(c, `진입 조건 ${i + 1}`, errors));
  }

  // 청산
  if (!isObject(rules.exit)) {
    errors.push('청산(exit)이 없어요. 손절은 반드시 있어야 해요.');
  } else {
    const exit = rules.exit;
    unknownKeys(exit, EXIT_KEYS, '청산', errors);
    checkNumber(exit.stopLossPct, LIMITS.stopLossPct, '손절(stopLossPct)', errors, true);
    checkNumber(exit.takeProfitPct, LIMITS.takeProfitPct, '익절(takeProfitPct)', errors, false);
    checkNumber(exit.maxHoldHours, LIMITS.maxHoldHours, '최대 보유시간(maxHoldHours)', errors, false);
    if (exit.logic != null && !['all', 'any'].includes(exit.logic)) errors.push('청산 logic 은 all 또는 any 여야 해요.');
    if (exit.conditions != null) {
      if (!Array.isArray(exit.conditions)) errors.push('청산 조건(conditions)은 목록이어야 해요.');
      else if (exit.conditions.length > LIMITS.conditions) errors.push(`청산 조건은 최대 ${LIMITS.conditions}개예요.`);
      else exit.conditions.forEach((c, i) => checkCondition(c, `청산 조건 ${i + 1}`, errors));
    }
  }

  // 금액
  if (!isObject(rules.position)) {
    errors.push('매수 금액(position)이 없어요.');
  } else {
    unknownKeys(rules.position, POSITION_KEYS, '매수 설정', errors);
    checkNumber(rules.position.quoteAmountUsdt, LIMITS.quoteAmountUsdt, '1회 매수 금액(quoteAmountUsdt)', errors, true);
    checkNumber(rules.position.maxOpenPositions, LIMITS.maxOpenPositions, '동시 보유 한도(maxOpenPositions)', errors, false);
  }
  return errors;
}

function checkCondition(c, label, errors) {
  if (!isObject(c)) return errors.push(`${label}: 형식 오류`);
  unknownKeys(c, CONDITION_KEYS, label, errors);
  const left = checkIndicator(c, label, errors);
  if (!OPERATORS[c.op]) errors.push(`${label}: 지원하지 않는 비교 '${c.op}'`);
  if (c.description != null && typeof c.description !== 'string') errors.push(`${label}: description 은 글자여야 해요.`);

  const v = c.value;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) errors.push(`${label}: 비교 값이 숫자가 아니에요.`);
    else if (left) {
      const [min, max] = left.valueRange;
      if (v < min || v > max) errors.push(`${label}: ${c.indicator} 는 ${min}~${max} 범위 숫자와 비교해야 해요 (지금 ${v}).`);
    }
  } else if (isObject(v)) {
    unknownKeys(v, VALUE_KEYS, `${label} 비교 대상`, errors);
    const right = checkIndicator(v, `${label} 비교 대상`, errors);
    if (left && right && left.unit !== right.unit) {
      errors.push(`${label}: ${c.indicator} 와 ${v.indicator} 는 단위가 달라 비교할 수 없어요.`);
    }
  } else {
    errors.push(`${label}: 비교 값(value)은 숫자 또는 지표여야 해요.`);
  }
}

function checkIndicator(spec, label, errors) {
  const def = INDICATORS[spec.indicator];
  if (!def) {
    errors.push(`${label}: 지원하지 않는 지표 '${spec.indicator}'`);
    return null;
  }
  const params = spec.params == null ? {} : spec.params;
  if (!isObject(params)) {
    errors.push(`${label}: params 형식 오류`);
    return def;
  }
  unknownKeys(params, Object.keys(def.params), `${label} ${spec.indicator}`, errors);
  for (const [key, s] of Object.entries(def.params)) {
    checkNumber(params[key], s, `${label} ${spec.indicator}.${key}`, errors, s.default == null);
  }
  if (spec.indicator === 'macd_hist') {
    const p = effectiveParams(spec);
    if (!(p.fast < p.slow)) errors.push(`${label}: MACD fast 는 slow 보다 작아야 해요.`);
  }
  return def;
}

function checkNumber(v, spec, label, errors, required) {
  if (v == null) {
    if (required) errors.push(`${label} 값이 없어요.`);
    return;
  }
  if (typeof v !== 'number' || !Number.isFinite(v)) return errors.push(`${label} 은 숫자여야 해요.`);
  if (spec.type === 'int' && !Number.isInteger(v)) return errors.push(`${label} 은 정수여야 해요 (지금 ${v}).`);
  if (v < spec.min || v > spec.max) errors.push(`${label} 은 ${spec.min}~${spec.max} 사이여야 해요 (지금 ${v}).`);
}

function unknownKeys(obj, allowed, label, errors) {
  const extra = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (extra.length) errors.push(`${label}: 프로그램이 모르는 항목 ${extra.join(', ')}`);
}

function isObject(x) {
  return x != null && typeof x === 'object' && !Array.isArray(x);
}

// 기본값을 채운 파라미터. 노트북 지표 계산(indicators.js)도 이 기본값을 쓴다.
export function effectiveParams(spec) {
  const def = INDICATORS[spec?.indicator];
  const out = {};
  if (!def) return out;
  for (const [key, s] of Object.entries(def.params)) {
    out[key] = spec.params?.[key] ?? s.default;
  }
  return out;
}

// ---------------------------------------------------------------------------
// 규칙 → 사람 말. AI가 쓴 설명(description)은 쓰지 않는다. 규칙 그대로 코드가 만든다.

export function indicatorLabel(spec) {
  const def = INDICATORS[spec?.indicator];
  return def ? def.label(effectiveParams(spec)) : `알 수 없는 지표(${spec?.indicator})`;
}

export function conditionText(c) {
  const left = indicatorLabel(c);
  const right = typeof c.value === 'number' ? fmtNum(c.value) : indicatorLabel(c.value);
  if (c.op === 'crosses_above') return `${left} ↗ ${right} 위로 돌파 (직전 봉 ≤, 이번 봉 >)`;
  if (c.op === 'crosses_below') return `${left} ↘ ${right} 아래로 돌파 (직전 봉 ≥, 이번 봉 <)`;
  return `${left} ${OPERATORS[c.op] || c.op} ${right}`;
}

// [{ title, items: [..] }]
export function describeRules(rules) {
  if (!isObject(rules)) return [];
  const r = rules;
  const tf = TIMEFRAMES[r.timeframe] || r.timeframe;
  const pos = r.position || {};
  const maxOpen = pos.maxOpenPositions ?? 1;
  const exit = r.exit || {};
  const entryConds = Array.isArray(r.entry?.conditions) ? r.entry.conditions : [];
  const exitConds = Array.isArray(exit.conditions) ? exit.conditions : [];

  const sections = [
    {
      title: '대상',
      items: [
        `바이낸스 현물 · ${(r.symbols || []).join(', ') || '-'} (고정 목록, 이 순서로 확인)`,
        `${tf} 기준, 마지막 완성 봉으로 판단${r.timeframe === '1d' ? ' (일봉은 한국 시간 오전 9시 마감)' : ''}`,
        `확인 시각: 프로그램 탭 스케줄대로 (스케줄이 '전략 기본'이면 ${r.checkEveryMinutes}분마다). 그 사이에는 보지 않아요.`,
      ],
    },
    {
      title: `매수 — 갖고 있지 않은 종목, 동시 보유 ${maxOpen}개 미만일 때`,
      items: [
        `아래 조건이 ${r.entry?.logic === 'any' ? '하나라도' : '모두'} 맞으면 ${fmtNum(pos.quoteAmountUsdt)} USDT 어치 시장가 매수`,
        ...entryConds.map((c) => `· ${conditionText(c)}`),
      ],
    },
    {
      title: '매도(전량, 시장가) — 확인 시각에 하나라도 맞으면',
      items: [
        `손절: 평균 매수가보다 ${fmtNum(exit.stopLossPct)}% 이상 떨어짐`,
        exit.takeProfitPct != null ? `익절: 평균 매수가보다 ${fmtNum(exit.takeProfitPct)}% 이상 오름` : '익절: 없음',
        exit.maxHoldHours != null ? `최대 보유: 산 뒤 ${fmtNum(exit.maxHoldHours)}시간 지나면` : '최대 보유시간: 없음',
        ...(exitConds.length
          ? [`청산 조건이 ${exit.logic === 'all' ? '모두' : '하나라도'} 맞으면:`, ...exitConds.map((c) => `· ${conditionText(c)}`)]
          : []),
      ],
    },
    {
      title: '하지 않는 일',
      items: [
        '보유 중 추가 매수(물타기)·일부 매도는 하지 않아요.',
        '손절·익절은 확인 시각에만 봐요. 그 사이 가격이 더 움직이면 기준보다 손실이 커질 수 있어요.',
        '자동 실행은 모의매매만 해요.',
      ],
    },
  ];
  return sections;
}

function fmtNum(n) {
  return typeof n === 'number' && Number.isFinite(n) ? String(Number(n.toPrecision(10))) : '-';
}

// ---------------------------------------------------------------------------
// 전략 AI 답을 판정한다. AI가 "가능"이라고 해도 규칙 검사를 통과해야 하고,
// AI가 못 하는 부분을 하나라도 적었으면 규칙은 버리고 "실행 불가"로 둔다 (다른 것으로 바꿔 넣지 않게).

const FEASIBILITY = ['ok', 'partial', 'impossible'];

export function judgeStrategyOutput(parsed) {
  const p = isObject(parsed) ? parsed : {};
  const unsupported = listOf(p.unsupported, ['request', 'reason', 'alternative']).filter((u) => u.request || u.reason);
  const assumptions = listOf(p.assumptions, ['item', 'value', 'why']).filter((a) => a.item);
  let feasibility = FEASIBILITY.includes(p.feasibility) ? p.feasibility : 'impossible';
  if (feasibility === 'ok' && unsupported.length) feasibility = 'partial';
  if (feasibility !== 'ok' && unsupported.length === 0) {
    unsupported.push({
      request: '(직원이 실행 가능 여부를 정확히 답하지 않음)',
      reason: '프로그램이 그대로 실행할 수 있다는 확인이 없어서 막았어요.',
      alternative: '요청을 더 구체적으로 써서 다시 만들어 주세요.',
    });
  }
  const executable = feasibility === 'ok';
  const rules = executable && isObject(p.rules) ? p.rules : null;
  const validationErrors = executable ? validateRules(rules) : [];
  return {
    feasibility,
    executable,
    understood: str(p.understood, 1000),
    unsupported,
    assumptions,
    rules,
    validationErrors,
  };
}

function listOf(x, keys) {
  if (!Array.isArray(x)) return [];
  return x.slice(0, 20).map((item) => {
    const o = {};
    for (const k of keys) o[k] = str(isObject(item) ? item[k] : k === keys[0] ? item : '', 500);
    return o;
  });
}

function str(x, max) {
  return x == null ? '' : String(x).slice(0, max);
}
