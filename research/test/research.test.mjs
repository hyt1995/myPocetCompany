// 실행: npm run test:research   (외부 의존 없음)

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { MAX_KEYWORDS } from '../capabilities.js';
import { trendRange } from '../dates.js';
import { buildRow, parseCount, rankRows, tableForAi, trendMetrics } from '../metrics.js';
import { compactKeyword, splitKeywords, validatePlan } from '../plan.js';
import { searchadSignature } from '../sign.js';

test('계획 검사: 정상 계획은 통과하고 같은 키워드는 한 번만', () => {
  const r = validatePlan({ title: '학원', keywords: ['학원 출결 관리', '학원출결관리', ' 학원  문자 '] });
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.plan.keywords.map((k) => k.keyword),
    ['학원 출결 관리', '학원 문자'],
  );
  assert.deepEqual(
    r.plan.keywords.map((k) => k.id),
    ['k0', 'k1'],
  );
});

test('계획 검사: 모르는 항목·특수문자·너무 많은 키워드는 실행 불가', () => {
  assert.equal(validatePlan({ title: 'a', keywords: ['a'], region: '서울' }).ok, false);
  const bad = validatePlan({ title: 'a', keywords: ['학원<script>'] });
  assert.equal(bad.ok, false);
  assert.match(bad.errors[0], /한글·영문·숫자/);
  const many = Array.from({ length: MAX_KEYWORDS + 1 }, (_, i) => `키워드 ${i}`);
  assert.equal(validatePlan({ title: 'a', keywords: many }).ok, false);
  assert.equal(validatePlan({ title: '', keywords: ['a'] }).ok, false);
});

test('키워드 나누기와 비교용 형태', () => {
  assert.deepEqual(splitKeywords('a b\n\nc, d '), ['a b', 'c', 'd']);
  assert.equal(compactKeyword(' Excel  자동화 '), 'EXCEL자동화');
});

test('검색수 "< 10" 은 5로, 숫자는 그대로', () => {
  assert.deepEqual(parseCount('< 10'), { value: 5, approx: true });
  assert.deepEqual(parseCount(1200), { value: 1200, approx: false });
  assert.deepEqual(parseCount(undefined), { value: null, approx: false });
});

test('조회 기간: 지난달까지 15개월 (한국 시간)', () => {
  // 2026-11-26 16:00 KST
  const r = trendRange(Date.UTC(2026, 10, 26, 7, 0));
  assert.equal(r.months.length, 15);
  assert.equal(r.months[0], '2025-08-01');
  assert.equal(r.months[14], '2026-10-01');
  assert.equal(r.startDate, '2025-08-01');
  assert.equal(r.endDate, '2026-10-31');
  // 1월이면 지난달은 전년 12월
  const jan = trendRange(Date.UTC(2027, 0, 10));
  assert.equal(jan.endDate, '2026-12-31');
  // UTC 로는 아직 10월 31일이지만 한국은 11월 1일 → 지난달은 10월
  assert.equal(trendRange(Date.UTC(2026, 9, 31, 16, 0)).endDate, '2026-10-31');
});

test('추세: 1년 성장률·3개월 성장률·급등', () => {
  const { months } = trendRange(Date.UTC(2026, 10, 26));
  const series = Object.fromEntries(months.map((m, i) => [m, i < 3 ? 10 : i >= 12 ? 30 : 20]));
  const t = trendMetrics(series, months);
  assert.equal(t.yoy, 3); // 최근 3개월 90 ÷ 1년 전 3개월 30
  assert.equal(t.momentum, 1.5); // 90 ÷ 60
  assert.equal(t.spike, false);
  const spiky = { ...series, [months[14]]: 100 };
  assert.equal(trendMetrics(spiky, months).spike, true);
  assert.equal(trendMetrics({}, months), null);
});

test('기회 점수 = 월 검색수 ÷ (블로그 글+1) × 성장률 × 100, 수요 적으면 0', () => {
  const row = buildRow('학원 문자', {
    searchad: { monthlyPcQcCnt: 300, monthlyMobileQcCnt: 700, compIdx: '높음' },
    trend: { yoy: 2, momentum: 1, spike: false, values: [] },
    blogTotal: 999,
  });
  assert.equal(row.monthly, 1000);
  assert.equal(row.score, 200); // 1000/1000 × 2 × 100
  assert.equal(row.competition, 1);
  assert.equal(row.compIdx, '높음');

  const low = buildRow('희귀', { searchad: { monthlyPcQcCnt: '< 10', monthlyMobileQcCnt: 40 }, blogTotal: 0 });
  assert.equal(low.score, 0);
  assert.ok(low.flags.includes('수요 적음'));

  const noSearch = buildRow('없음', { blogTotal: 10 });
  assert.equal(noSearch.score, null);
  assert.ok(noSearch.flags.includes('검색량 정보 없음'));

  // 성장률은 0.25~4 로 제한
  const boom = buildRow('붐', { searchad: { monthlyPcQcCnt: 1000, monthlyMobileQcCnt: 0 }, trend: { yoy: 50 }, blogTotal: 999 });
  assert.equal(boom.score, 400);
});

test('순위는 점수 높은 순, AI 표는 숫자가 없으면 "확인 못 함"', () => {
  const ranked = rankRows({
    k0: buildRow('a', { searchad: { monthlyPcQcCnt: 500, monthlyMobileQcCnt: 500 }, blogTotal: 9999 }),
    k1: buildRow('b', { searchad: { monthlyPcQcCnt: 500, monthlyMobileQcCnt: 500 }, blogTotal: 99 }),
    k2: buildRow('c', {}),
  });
  assert.deepEqual(
    ranked.map((r) => r.keyword),
    ['b', 'a', 'c'],
  );
  const table = tableForAi(ranked, 2);
  assert.match(table, /확인 못 함/);
  assert.match(table, /나머지 1개/);
});

test('검색광고 서명 = HMAC-SHA256 base64', () => {
  const expected = createHmac('sha256', 'secret').update('1700000000000.GET./keywordstool').digest('base64');
  assert.equal(searchadSignature('1700000000000', 'GET', '/keywordstool', 'secret'), expected);
});
