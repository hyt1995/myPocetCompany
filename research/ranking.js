// 줄 세우기 기준 검사·적용. 엄격하게: 모르는 항목·범위 밖 값이 있으면 쓰지 않는다.
// (외부 의존 없음 → research/test 에서 테스트)

import { DEFAULT_RANKING, RANK_TOP, RANKING_FILTERS, SORT_KEYS } from './capabilities.js';

const FIELDS = new Set(['sortBy', 'top', ...Object.keys(RANKING_FILTERS)]);

// 반환: { ok, errors, ranking }. input 이 없으면 기본 기준.
export function validateRanking(input) {
  if (input === undefined || input === null) return { ok: true, errors: [], ranking: { ...DEFAULT_RANKING } };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['줄 세우기 기준 형식이 잘못됐어요.'], ranking: null };
  }
  const errors = [];
  for (const key of Object.keys(input)) {
    if (!FIELDS.has(key)) errors.push(`줄 세우기에 모르는 항목 '${key}'`);
  }

  const sortBy = input.sortBy ?? DEFAULT_RANKING.sortBy;
  if (!SORT_KEYS[sortBy]) errors.push(`모르는 정렬 기준 '${String(sortBy).slice(0, 30)}'`);

  const top = input.top ?? RANK_TOP.default;
  if (!Number.isInteger(top) || top < RANK_TOP.min || top > RANK_TOP.max) {
    errors.push(`보고서 줄 수는 ${RANK_TOP.min}~${RANK_TOP.max} 사이 정수예요.`);
  }

  const ranking = { sortBy, top };
  for (const [key, f] of Object.entries(RANKING_FILTERS)) {
    const v = input[key];
    if (v === undefined || v === null || v === '') continue;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < f.min || v > f.max) {
      errors.push(`${f.label}은(는) ${f.min}~${f.max} 사이 숫자예요.`);
      continue;
    }
    ranking[key] = v;
  }

  if (errors.length) return { ok: false, errors, ranking: null };
  return { ok: true, errors: [], ranking };
}

// 저장된 값이 이상하면 기본 기준으로 (예전 조사에는 기준이 없다)
export function safeRanking(input) {
  const { ok, ranking } = validateRanking(input);
  return ok ? ranking : { ...DEFAULT_RANKING };
}

export function passesFilters(row, ranking) {
  for (const [key, f] of Object.entries(RANKING_FILTERS)) {
    const limit = ranking[key];
    if (limit === undefined) continue;
    const v = row[f.field];
    if (v === null || v === undefined) return false;
    if (f.op === 'min' && v < limit) return false;
    if (f.op === 'max' && v > limit) return false;
  }
  return true;
}

// 사람이 읽는 설명: '경쟁 적은 순 · 월 검색수 최소 500 · 상위 40개'
export function describeRanking(ranking) {
  const r = safeRanking(ranking);
  const parts = [SORT_KEYS[r.sortBy].label];
  for (const [key, f] of Object.entries(RANKING_FILTERS)) {
    if (r[key] !== undefined) parts.push(`${f.label} ${r[key].toLocaleString('ko-KR')}`);
  }
  parts.push(`보고서 상위 ${r.top}개`);
  return parts.join(' · ');
}
