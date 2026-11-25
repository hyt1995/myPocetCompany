import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSchedule, nextRunAt, normalizeSchedule } from '../src/schedule.js';

// 한국 시간 문자열 → ms
const kst = (s) => Date.parse(`${s}+09:00`);
const show = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');

test('매일 정해진 시각', () => {
  const s = { type: 'times', times: ['21:00', '9:00'] };
  assert.equal(show(nextRunAt(s, 60, kst('2026-11-25T08:59:59'))), '2026-11-25 09:00');
  assert.equal(show(nextRunAt(s, 60, kst('2026-11-25T09:00:00'))), '2026-11-25 21:00'); // 지금 시각은 지난 것으로
  assert.equal(show(nextRunAt(s, 60, kst('2026-11-25T22:00:00'))), '2026-11-26 09:00'); // 다음 날
  assert.equal(show(nextRunAt(s, 60, kst('2026-11-25T00:30:00'))), '2026-11-25 09:00'); // 한국 새벽 (UTC 전날)
});

test('N분마다는 한국 시간 기준으로 맞춘다', () => {
  assert.equal(show(nextRunAt({ type: 'interval', minutes: 30 }, 60, kst('2026-11-25T10:07:00'))), '2026-11-25 10:30');
  assert.equal(show(nextRunAt({ type: 'interval', minutes: 240 }, 60, kst('2026-11-25T10:07:00'))), '2026-11-25 12:00');
  assert.equal(show(nextRunAt({ type: 'interval', minutes: 15 }, 60, kst('2026-11-25T10:15:00'))), '2026-11-25 10:30');
});

test('전략 기본 주기', () => {
  assert.equal(show(nextRunAt({ type: 'strategy' }, 60, kst('2026-11-25T10:07:00'))), '2026-11-25 11:00');
  assert.equal(show(nextRunAt(undefined, 15, kst('2026-11-25T10:07:00'))), '2026-11-25 10:15');
});

test('입력 정리와 오류', () => {
  assert.deepEqual(normalizeSchedule({ type: 'times', times: '21:00, 9:00 09:00' }), { type: 'times', times: ['09:00', '21:00'] });
  assert.throws(() => normalizeSchedule({ type: 'times', times: ['25:00'] }), /시각/);
  assert.throws(() => normalizeSchedule({ type: 'interval', minutes: 0 }), /간격/);
  assert.equal(describeSchedule({ type: 'interval', minutes: 120 }), '2시간마다');
  assert.equal(describeSchedule({ type: 'times', times: ['09:00'] }), '매일 09:00');
});
