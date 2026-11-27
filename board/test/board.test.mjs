import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanPost, isPostId, toListItem } from '../fields.js';

const base = { id: 'marketing-newbiz-2026-w48-report', kind: 'report', title: '주간 보고서', body: '# 본문' };

test('게시글 id 는 소문자·숫자·-·_ 만', () => {
  assert.equal(isPostId(base.id), true);
  assert.equal(isPostId('Bad/ID'), false);
  assert.equal(isPostId('../x'), false);
});

test('모르는 종류·빈 제목·빈 본문은 거절', () => {
  assert.throws(() => cleanPost({ ...base, kind: 'ad' }));
  assert.throws(() => cleanPost({ ...base, title: ' ' }));
  assert.throws(() => cleanPost({ ...base, body: '' }));
});

test('출처는 http(s) 주소만 남긴다', () => {
  const post = cleanPost({
    ...base,
    sources: [{ ref: 'E1', url: 'https://a.com', title: 'A' }, { url: 'javascript:alert(1)' }, null],
  });
  assert.deepEqual(post.sources, [{ ref: 'E1', url: 'https://a.com', title: 'A' }]);
});

test('목록에는 본문이 없다', () => {
  const item = toListItem('x', { ...cleanPost(base), at: 1 });
  assert.equal(item.body, undefined);
  assert.equal(item.kindLabel, '주간 보고서');
});
