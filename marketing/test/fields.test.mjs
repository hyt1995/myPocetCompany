// 실행: node --test marketing/test/   (외부 의존 없음)

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanMemberPatch, MAX_PROMPT_CHARS, toMember } from '../server/fields.js';
import { findSeed, TEAM } from '../team.js';

test('직원 수정은 이름·역할·모델·지침만 받고 모르는 항목은 버린다', () => {
  const patch = cleanMemberPatch({ name: '  분석가 ', model: 'smart', order: 1, departmentId: 'investment', foo: 1 });
  assert.deepEqual(patch, { name: '분석가', model: 'smart' });
});

test('잘못된 모델 등급과 너무 긴 지침은 걸러진다', () => {
  const patch = cleanMemberPatch({ model: 'opus', systemPrompt: 'x'.repeat(MAX_PROMPT_CHARS + 50) });
  assert.equal(patch.model, undefined);
  assert.equal(patch.systemPrompt.length, MAX_PROMPT_CHARS);
});

test('빈 이름은 "이름 없음"으로 저장된다', () => {
  assert.equal(cleanMemberPatch({ name: '   ' }).name, '이름 없음');
});

test('팀은 직원1·직원2·팀장 3명이고 id 가 mkt- 로 시작한다', () => {
  assert.deepEqual(
    TEAM.map((m) => m.title),
    ['직원1', '직원2', '팀장'],
  );
  for (const m of TEAM) {
    assert.ok(m.id.startsWith('mkt-'));
    assert.ok(m.systemPrompt.length > 100);
  }
});

test('기본 지침 그대로면 isDefaultPrompt 가 true', () => {
  const seed = findSeed('mkt-lead');
  assert.equal(toMember(seed.id, { ...seed }, seed).isDefaultPrompt, true);
  assert.equal(toMember(seed.id, { ...seed, systemPrompt: '바꿈' }, seed).isDefaultPrompt, false);
});
