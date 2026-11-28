// 숫자 계산. 외부 의존 없음 → research/test 에서 테스트.
// 계산 방법을 바꾸면 capabilities.js 의 설명도 같이 고친다.

import { GROWTH_CLAMP, MIN_DEMAND, SORT_KEYS } from './capabilities.js';
import { describeRanking, passesFilters, safeRanking } from './ranking.js';

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

// rows: { k0: row, ... } → 줄 세우기 기준(ranking)대로 정렬한 배열.
// 거르기를 통과한 키워드가 위, 못 넘은 키워드는 아래(inRange: false). 값이 없는 키워드는 각 묶음의 맨 아래.
export function rankRows(rows = {}, ranking) {
  const r = safeRanking(ranking);
  const { field, order } = SORT_KEYS[r.sortBy];
  const dir = order === 'asc' ? 1 : -1;
  const val = (row) => (typeof row[field] === 'number' && Number.isFinite(row[field]) ? row[field] : null);
  const cmp = (a, b) => {
    const va = val(a);
    const vb = val(b);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) return (va - vb) * dir;
    return (b.score ?? -1) - (a.score ?? -1) || (b.monthly ?? -1) - (a.monthly ?? -1);
  };
  return Object.entries(rows)
    .map(([id, row]) => ({ id, ...row, inRange: passesFilters(row, r) }))
    .sort((a, b) => Number(b.inRange) - Number(a.inRange) || cmp(a, b))
    .map((row, i) => ({ rank: i + 1, ...row }));
}

const fmt = (v, suffix = '') => (v === null || v === undefined ? '확인 못 함' : `${v}${suffix}`);

// AI 직원에게 넘기는 표 (토큰을 아끼려고 기준을 통과한 상위 top 개만, 한 줄씩).
// rankingOrLimit: 줄 세우기 기준 객체, 또는 (예전 방식) 줄 수 숫자
export function tableForAi(ranked, rankingOrLimit) {
  const ranking =
    typeof rankingOrLimit === 'number' ? { ...safeRanking(null), top: rankingOrLimit } : safeRanking(rankingOrLimit);
  const passed = ranked.filter((row) => row.inRange !== false);
  const head = '순위 | 키워드 | 월 검색수 | 블로그 글 수 | 경쟁비 | 1년 성장률 | 3개월 성장률 | 광고 경쟁 | 광고 클릭수 | 기회 점수 | 표시';
  const lines = passed
    .slice(0, ranking.top)
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
        fmt(r.adClicks),
        fmt(r.score),
        r.flags.join(', ') || '-',
      ].join(' | '),
    );
  const notes = [`(줄 세우기 기준: ${describeRanking(ranking)})`];
  if (passed.length > ranking.top) notes.push(`(기준을 통과했지만 ${ranking.top}위 밖이라 생략: ${passed.length - ranking.top}개)`);
  if (ranked.length > passed.length) notes.push(`(거르기 조건을 못 넘어 뺀 키워드: ${ranked.length - passed.length}개)`);
  return `${head}\n${lines.join('\n')}\n${notes.join('\n')}`;
}
