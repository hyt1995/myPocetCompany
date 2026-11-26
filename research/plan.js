// 조사 계획 검사. 엄격하게: 모르는 항목·잘못된 키워드가 있으면 실행하지 않는다.
// (외부 의존 없음 → research/test 에서 테스트)

import { KEYWORD_PATTERN, MAX_KEYWORD_LENGTH, MAX_KEYWORDS } from './capabilities.js';

const PLAN_FIELDS = new Set(['title', 'keywords']);

// 띄어쓰기를 하나로 정리한다. (글자는 바꾸지 않는다)
export function normalizeKeyword(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 같은 키워드인지 비교할 때 쓴다: 띄어쓰기를 빼고 영문 대문자로.
export function compactKeyword(text) {
  return normalizeKeyword(text).replace(/ /g, '').toUpperCase();
}

export function keywordProblem(keyword) {
  if (!keyword) return '빈 키워드';
  if (keyword.length > MAX_KEYWORD_LENGTH) return `${MAX_KEYWORD_LENGTH}자 초과`;
  if (!KEYWORD_PATTERN.test(keyword)) return '한글·영문·숫자·띄어쓰기만 쓸 수 있음';
  return null;
}

export function isValidKeyword(text) {
  return keywordProblem(normalizeKeyword(text)) === null;
}

// 여러 줄 글 → 키워드 목록 (쉼표·줄바꿈으로 구분)
export function splitKeywords(text) {
  return String(text ?? '')
    .split(/[\n,]/)
    .map(normalizeKeyword)
    .filter(Boolean);
}

// 반환: { ok, errors: [문장], plan: { title, keywords: [{ id, keyword }] } }
export function validatePlan(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['조사 계획 형식이 잘못됐어요.'], plan: null };
  }

  for (const key of Object.keys(input)) {
    if (!PLAN_FIELDS.has(key)) errors.push(`모르는 항목 '${key}'`);
  }

  const title = normalizeKeyword(input.title).slice(0, 100);
  if (!title) errors.push('조사 제목이 없어요.');

  if (!Array.isArray(input.keywords)) {
    errors.push('키워드 목록이 없어요.');
    return { ok: false, errors, plan: null };
  }

  const seen = new Set();
  const keywords = [];
  input.keywords.forEach((raw, i) => {
    const keyword = normalizeKeyword(raw);
    const problem = keywordProblem(keyword);
    if (problem) {
      errors.push(`${i + 1}번째 키워드 '${String(raw ?? '').slice(0, 40)}': ${problem}`);
      return;
    }
    const compact = compactKeyword(keyword);
    if (seen.has(compact)) return; // 같은 키워드는 한 번만 (오류 아님)
    seen.add(compact);
    keywords.push({ id: `k${keywords.length}`, keyword });
  });

  if (keywords.length === 0 && errors.length === 0) errors.push('키워드가 하나도 없어요.');
  if (keywords.length > MAX_KEYWORDS) errors.push(`키워드는 한 번에 ${MAX_KEYWORDS}개까지예요 (지금 ${keywords.length}개).`);

  if (errors.length) return { ok: false, errors, plan: null };
  return { ok: true, errors: [], plan: { title, keywords } };
}
