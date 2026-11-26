// 숫자 계산. 외부 의존 없음 → research/test 에서 테스트.
// 계산 방법을 바꾸면 capabilities.js 의 설명도 같이 고친다.

import { GROWTH_CLAMP, MIN_DEMAND } from './capabilities.js';

// 검색광고 API 의 검색수: 숫자 또는 "< 10"
export function parseCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { value, approx: false };
  if (typeof value === 'string') {
    if (value.includes('<')) return { value: 5, approx: true };
    const n = Number(value.replace(/,/g, ''));
    if (Number.isFinite(n)) return { value: n, approx: false };
  }
  return { value: null, approx: false };
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const round = (n, digits = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** digits) / 10 ** digits);

// series: { 'YYYY-MM-01': ratio }, months: 오래된 달 → 최근 달 (15개)
export function trendMetrics(series, months) {
  if (!series || !Array.isArray(months) || months.length < 6) return null;
  const values = months.map((m) => (typeof series[m] === 'number' ? series[m] : 0));
  if (values.every((v) => v === 0)) return null;

  const n = values.length;
  const last3 = sum(values.slice(n - 3));
  const prev3 = sum(values.slice(n - 6, n - 3));
  const yoyBase = n >= 15 ? sum(values.slice(n - 15, n - 12)) : 0;
  const before5 = values.slice(n - 6, n - 1);
  const avgBefore5 = sum(before5) / before5.length;

  return {
    values,
    momentum: prev3 > 0 ? round(last3 / prev3) : null, // 3개월 성장률
    yoy: yoyBase > 0 ? round(last3 / yoyBase) : null, // 1년 성장률
    spike: avgBefore5 > 0 && values[n - 1] >= avgBefore5 * 2,
  };
}

export function clampGrowth(g) {
  if (g === null || g === undefined || !Number.isFinite(g)) return 1;
  return Math.min(GROWTH_CLAMP[1], Math.max(GROWTH_CLAMP[0], g));
}

// 한 키워드의 결과 정리. raw: { searchad, trend, blogTotal, errors }
export function buildRow(keyword, raw = {}) {
  const pc = parseCount(raw.searchad?.monthlyPcQcCnt);
  const mo = parseCount(raw.searchad?.monthlyMobileQcCnt);
  const hasSearch = pc.value !== null || mo.value !== null;
  const monthly = hasSearch ? (pc.value || 0) + (mo.value || 0) : null;
  const blogTotal = Number.isFinite(raw.blogTotal) ? raw.blogTotal : null;
  const trend = raw.trend || null;
  const growth = trend ? (trend.yoy ?? trend.momentum) : null;

  const flags = [];
  let score = null;
  if (monthly === null) flags.push('검색량 정보 없음');
  else if (monthly < MIN_DEMAND) {
    flags.push('수요 적음');
    score = 0;
  }
  if (monthly !== null && monthly >= MIN_DEMAND && blogTotal !== null) {
    score = round((monthly / (blogTotal + 1)) * clampGrowth(growth) * 100, 1);
  }
  if (trend?.spike) flags.push('최근 급등');
  if (trend?.yoy !== null && trend?.yoy !== undefined && trend.yoy < 0.8) flags.push('감소 중');
  if (pc.approx || mo.approx) flags.push('검색수 10 미만 포함');
  if (raw.errors?.length) flags.push('일부 조회 실패');

  return {
    keyword,
    monthly,
    pc: pc.value,
    mobile: mo.value,
    compIdx: raw.searchad?.compIdx || null, // 광고 경쟁: 낮음/중간/높음
    adClicks: round((Number(raw.searchad?.monthlyAvePcClkCnt) || 0) + (Number(raw.searchad?.monthlyAveMobileClkCnt) || 0), 1),
    adDepth: Number.isFinite(Number(raw.searchad?.plAvgDepth)) ? Number(raw.searchad.plAvgDepth) : null,
    blogTotal,
    competition: monthly && blogTotal !== null ? round(blogTotal / monthly, 1) : null, // 경쟁비
    yoy: trend?.yoy ?? null,
    momentum: trend?.momentum ?? null,
    trend: trend?.values || null,
    score,
    flags,
    errors: raw.errors || [],
  };
}

// rows: { k0: row, ... } → 점수 높은 순 배열 (점수 없는 것은 뒤로)
export function rankRows(rows = {}) {
  return Object.entries(rows)
    .map(([id, row]) => ({ id, ...row }))
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || (b.monthly ?? -1) - (a.monthly ?? -1))
    .map((row, i) => ({ rank: i + 1, ...row }));
}

const fmt = (v, suffix = '') => (v === null || v === undefined ? '확인 못 함' : `${v}${suffix}`);

// AI 직원에게 넘기는 표 (토큰을 아끼려고 상위 limit 개만, 한 줄씩)
export function tableForAi(ranked, limit = 40) {
  const head = '순위 | 키워드 | 월 검색수 | 블로그 글 수 | 경쟁비 | 1년 성장률 | 3개월 성장률 | 광고 경쟁 | 기회 점수 | 표시';
  const lines = ranked
    .slice(0, limit)
    .map((r) =>
      [
        r.rank,
        r.keyword,
        fmt(r.monthly),
        fmt(r.blogTotal),
        fmt(r.competition),
        fmt(r.yoy, '배'),
        fmt(r.momentum, '배'),
        r.compIdx || '확인 못 함',
        fmt(r.score),
        r.flags.join(', ') || '-',
      ].join(' | '),
    );
  const rest = ranked.length > limit ? `\n(나머지 ${ranked.length - limit}개는 점수가 더 낮아 생략)` : '';
  return `${head}\n${lines.join('\n')}${rest}`;
}
