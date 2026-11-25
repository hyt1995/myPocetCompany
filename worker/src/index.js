// 내 손안의 회사 — 노트북 매매 프로그램
// 실행: npm start   (설정은 .env, 설명은 README.md)
//
// 평소에는 아무것도 하지 않고 기다린다. 움직이는 때는 세 가지뿐이다:
//   1. 사이트에서 명령이 생겼을 때 (Firestore 리스너가 알려준다)
//   2. 직원의 스케줄·모드·전략이 바뀌었을 때 (Firestore 리스너가 알려준다) → 알람 다시 맞춤
//   3. 알람(스케줄) 시각이 됐을 때 → 승인 전략으로 모의매매
// 그리고 5분마다 연결 신호를 한 번 쓴다.

import { handleCommand } from './commands.js';
import { checkConfig, config } from './config.js';
import { heartbeat, initDb, onPendingCommands, onTradingMembers } from './db.js';
import { log } from './log.js';
import { enqueue } from './queue.js';
import { stopAll, syncMembers } from './scheduler.js';

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

await heartbeat().catch((err) => {
  console.error(`Firestore 연결 실패: ${err.message}`);
  process.exit(1);
});
const beat = setInterval(() => heartbeat().catch((err) => log(`연결 신호 오류: ${err.message}`)), config.heartbeatMs);

const stopCommands = onPendingCommands(
  (id, data) => enqueue(() => handleCommand(id, data)).catch((err) => log(`명령 처리 오류: ${err.message}`)),
  (err) => log(`명령 구독 오류: ${err.message}`),
);
const stopMembers = onTradingMembers(syncMembers, (err) => log(`직원 구독 오류: ${err.message}`));
log('사이트 명령과 직원 설정 변경을 기다리는 중');

function shutdown() {
  log('매매 프로그램 종료');
  clearInterval(beat);
  stopAll();
  stopCommands();
  stopMembers();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('unhandledRejection', (err) => log(`처리 안 된 오류: ${err?.message || err}`));
