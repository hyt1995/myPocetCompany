// 자동 실행 스케줄러 (알람시계 방식).
//
// - 직원 문서는 Firestore 리스너로 '바뀔 때만' 받는다 (주기적으로 다시 읽지 않는다).
// - 자동 실행 대상(모드 '모의' + 자동 실행 켬 + 승인 전략 있음)마다 타이머 하나를 다음 실행 시각에 맞춰 둔다.
// - 타이머가 울리면 승인 전략으로 한 번 확인 → 조건이 맞으면 모의매매 → 다음 시각으로 다시 맞춘다.
// - 스케줄·모드·전략이 바뀌면 그 직원의 타이머만 다시 맞춘다.
// 자동 실행은 모의매매만 한다. 실제 돈은 사이트에서 사장님이 누른 서명된 명령으로만 움직인다.

import { getApprovedStrategy, setNextRun } from './db.js';
import { log } from './log.js';
import { enqueue } from './queue.js';
import { describeSchedule, nextRunAt } from './schedule.js';
import { runStrategy } from './trading.js';

const timers = new Map(); // memberId → { key, timeout, at }
const generation = new Map(); // memberId → 숫자 (빠르게 여러 번 바뀔 때 마지막 것만 반영)

const isTarget = (m) => m.mode === 'paper' && m.autoRun === true && Boolean(m.activeStrategyVersion);
const keyOf = (m) => JSON.stringify([m.activeStrategyVersion, m.schedule || null, m.paperCapitalUsdt]);

// 리스너가 직원 목록을 줄 때마다 부른다.
export function syncMembers(members) {
  const targets = new Map(members.filter(isTarget).map((m) => [m.id, m]));

  for (const [id, t] of timers) {
    if (!targets.has(id)) {
      clearTimeout(t.timeout);
      timers.delete(id);
      generation.set(id, (generation.get(id) || 0) + 1);
      setNextRun(id, null).catch(() => {});
      log(`자동 실행 끔: ${t.name}`);
    }
  }

  for (const member of targets.values()) {
    const t = timers.get(member.id);
    if (t && t.key === keyOf(member)) continue; // 바뀐 게 없음
    arm(member).catch((err) => log(`스케줄 설정 실패 (${member.name}): ${err.message}`));
  }
}

async function arm(member, after = Date.now()) {
  const gen = (generation.get(member.id) || 0) + 1;
  generation.set(member.id, gen);

  const strategy = await getApprovedStrategy(member);
  if (generation.get(member.id) !== gen) return; // 그 사이 또 바뀜
  const old = timers.get(member.id);
  if (old) clearTimeout(old.timeout);
  if (!strategy) {
    timers.delete(member.id);
    log(`자동 실행 대기: ${member.name} — 승인된 전략을 읽지 못했어요`);
    return;
  }

  const every = strategy.rules?.checkEveryMinutes;
  const at = nextRunAt(member.schedule, every, after);
  const timeout = setTimeout(() => fire(member, strategy, gen), Math.max(at - Date.now(), 0));
  timers.set(member.id, { key: keyOf(member), timeout, at, name: member.name });
  setNextRun(member.id, at).catch(() => {});
  log(`자동 실행 예약: ${member.name} v${strategy.version} · ${describeSchedule(member.schedule, every)} · 다음 ${fmt(at)}`);
}

function fire(member, strategy, gen) {
  if (generation.get(member.id) !== gen) return;
  enqueue(async () => {
    const messages = await runStrategy(member, strategy, { trigger: '자동' });
    log(`[자동] ${member.name} v${strategy.version}: ${messages.join(' / ')}`);
  })
    .catch((err) => log(`[자동] ${member.name} 오류: ${err.message}`))
    .finally(() => {
      // 노트북이 잠들었다 깨어 늦게 울려도, 밀린 횟수만큼 몰아서 돌리지 않고 다음 시각으로 맞춘다.
      if (generation.get(member.id) === gen) {
        arm(member, Date.now() + 1000).catch((err) => log(`스케줄 재설정 실패: ${err.message}`));
      }
    });
}

export function stopAll() {
  for (const t of timers.values()) clearTimeout(t.timeout);
  timers.clear();
}

function fmt(ms) {
  return new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
}
