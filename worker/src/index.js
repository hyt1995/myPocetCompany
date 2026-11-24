// 내 손안의 회사 — 노트북 매매 프로그램
// 실행: npm start   (설정은 .env, 설명은 README.md)

import { autorunTick, refreshPrices } from './autorun.js';
import { handleCommand } from './commands.js';
import { checkConfig, config } from './config.js';
import { heartbeat, initDb, onPendingCommands } from './db.js';
import { log } from './log.js';
import { enqueue } from './queue.js';

const problems = checkConfig();
if (problems.length) {
  problems.forEach((p) => console.error(`설정 오류: ${p}`));
  process.exit(1);
}

initDb();

log(`매매 프로그램 시작 v${config.version} (${config.host})`);
log(
  config.live.enabled
    ? `실전: 켜짐 ${config.binance.testnet ? '(테스트넷 — 가짜 돈)' : '(⚠ 메인넷 — 실제 돈)'} · 1회 ${config.live.maxOrderUsdt} / 하루 ${config.live.maxDailyUsdt} USDT`
    : '실전: 꺼짐 (모의매매만)',
);

const timers = [];
const safe = (label, fn) => () => fn().catch((err) => log(`${label} 오류: ${err.message}`));

await heartbeat().catch((err) => {
  console.error(`Firestore 연결 실패: ${err.message}`);
  process.exit(1);
});
timers.push(setInterval(safe('연결 신호', heartbeat), config.heartbeatMs));

const unsubscribe = onPendingCommands(
  (id, data) => enqueue(() => handleCommand(id, data)).catch((err) => log(`명령 처리 오류: ${err.message}`)),
  (err) => log(`명령 구독 오류: ${err.message}`),
);
log('사이트 명령 대기 중');

const tick = safe('자동 실행', autorunTick);
tick();
timers.push(setInterval(tick, config.tickMs));
timers.push(setInterval(safe('시세 갱신', () => enqueue(refreshPrices)), config.priceRefreshMs));

function shutdown() {
  log('매매 프로그램 종료');
  timers.forEach(clearInterval);
  unsubscribe();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => log(`처리 안 된 오류: ${err?.message || err}`));
