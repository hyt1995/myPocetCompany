import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkRefs,
  lastTag,
  markInvalidRefs,
  notesWithRefs,
  numberSources,
  sectionFirstLine,
} from '../teams/newbiz/sources.js';
import { blockedReason, nextSpeaker } from '../teams/newbiz/steps.js';
import { isWeekKey, weekKeyOf, weekRange } from '../teams/newbiz/week.js';
import { promptHash } from '../team.js';

const kst = (s) => Date.parse(`${s}+09:00`);

test('주 번호는 한국 시간 기준 ISO 주', () => {
  assert.equal(weekKeyOf(kst('2026-11-23T00:30:00')), '2026-W48'); // 월요일 새벽 (UTC 로는 일요일)
  assert.equal(weekKeyOf(kst('2026-11-29T23:59:00')), '2026-W48'); // 일요일 밤
  assert.equal(weekKeyOf(kst('2026-11-30T07:00:00')), '2026-W49');
  assert.equal(weekKeyOf(kst('2027-01-01T12:00:00')), '2026-W53'); // 2026년은 53주까지
  assert.equal(weekKeyOf(kst('2025-12-29T12:00:00')), '2026-W01');
});

test('주 범위와 앞뒤 주', () => {
  const r = weekRange('2026-W48');
  assert.equal(r.monday, '2026-11-23');
  assert.equal(r.sunday, '2026-11-29');
  assert.equal(r.prevMonday, '2026-11-16');
  assert.equal(r.prevSunday, '2026-11-22');
  assert.equal(r.prevKey, '2026-W47');
  assert.equal(r.nextKey, '2026-W49');
  assert.equal(weekRange('2027-W01').prevKey, '2026-W53');
  assert.equal(weekRange('2026-W01').monday, '2025-12-29');
});

test('주 표기 검사', () => {
  assert.equal(isWeekKey('2026-W48'), true);
  assert.equal(isWeekKey('2026-W53'), true);
  assert.equal(isWeekKey('2027-W53'), false); // 2027년은 52주
  assert.equal(isWeekKey('2026-48'), false);
  assert.equal(isWeekKey('../x'), false);
});

const content = [
  { type: 'server_tool_use', name: 'web_search' },
  { type: 'text', text: '코스피 주간 -1.2%.', citations: [{ url: 'https://b.com', title: 'B' }] },
  { type: 'text', text: '\n비트코인 9만 달러.', citations: [{ url: 'https://a.com' }, { url: 'https://b.com' }] },
  { type: 'text', text: '\n환율은 찾지 못함.' },
];
const sources = [
  { url: 'https://a.com', title: 'A' },
  { url: 'https://c.com', title: 'C' },
  { url: 'https://b.com', title: 'B' },
];

test('인용된 출처가 앞 번호, 메모에 번호가 붙는다', () => {
  const numbered = numberSources(sources, 'B', content);
  assert.deepEqual(
    numbered.map((s) => `${s.ref}:${s.url}`),
    ['B1:https://a.com', 'B2:https://b.com', 'B3:https://c.com'],
  );
  const notes = notesWithRefs(content, numbered);
  assert.equal(notes, '코스피 주간 -1.2%. [B2]\n비트코인 9만 달러. [B1][B2]\n환율은 찾지 못함.');
});

test('목록에 없는 출처 번호는 잡아내고 [출처 없음]으로 바꾼다', () => {
  const allowed = numberSources(sources, 'E');
  const text = '수요 증가 [E1], 가격 3만 원 [E9], 순위 [D2]';
  const { used, invalid } = checkRefs(text, allowed);
  assert.deepEqual(used, ['E1']);
  assert.deepEqual(invalid, ['E9', 'D2']);
  assert.equal(markInvalidRefs(text, invalid), '수요 증가 [E1], 가격 3만 원 [출처 없음], 순위 [출처 없음]');
});

test('마지막 판정 줄 읽기', () => {
  assert.equal(lastTag('...\n**판정: 반려**', '판정', ['통과', '조건부', '반려', '아이템 없음']), '반려');
  assert.equal(lastTag('결정：넘어감 (근거 약함)', '결정', ['심층조사', '넘어감']), '넘어감');
  assert.equal(lastTag('판정은 나중에', '판정', ['통과']), null);
});

test('요약 줄 뽑기', () => {
  const t = '# 보고서\n## 한 줄 결론\n- **일본 선크림 역직구는 조건부 통과** [E2]\n## 다음';
  assert.equal(sectionFirstLine(t, '한 줄 결론'), '일본 선크림 역직구는 조건부 통과');
});

test('단계 순서: 앞 단계가 끝나야 한다', () => {
  assert.match(blockedReason('directive', { steps: {} }), /시장 탐색/);
  assert.equal(blockedReason('directive', { steps: { explore: { status: 'done' } } }), null);
  assert.equal(blockedReason('briefing', { steps: {} }), null);
  const skip = { steps: { explore: { status: 'done' }, directive: { status: 'done', decision: '넘어감' } } };
  assert.match(blockedReason('deep', skip), /넘어가기로/);
  assert.equal(blockedReason('report', { steps: { explore: { status: 'done' } } }), null);
});

test('회의 발언 순서와 3라운드 제한', () => {
  assert.deepEqual(nextSpeaker(null), { round: 1, who: 'planner' });
  const t = (round, who, verdict) => ({ round, who, verdict });
  assert.deepEqual(nextSpeaker({ turns: [t(1, 'planner')] }), { round: 1, who: 'analyst' });
  assert.deepEqual(nextSpeaker({ turns: [t(1, 'planner'), t(1, 'analyst')] }), { round: 1, who: 'lead' });
  assert.deepEqual(nextSpeaker({ turns: [t(1, 'lead', '반려')] }), { round: 2, who: 'planner' });
  assert.equal(nextSpeaker({ turns: [t(1, 'lead', '통과')] }), null);
  assert.equal(nextSpeaker({ turns: [t(3, 'lead', '반려')] }), null);
  assert.equal(nextSpeaker({ status: 'done', turns: [] }), null);
});

test('예전 기본 지침 지문', () => {
  assert.equal(typeof promptHash('abc'), 'string');
  assert.equal(promptHash('abc'), promptHash('abc'));
  assert.notEqual(promptHash('abc'), promptHash('abd'));
});
