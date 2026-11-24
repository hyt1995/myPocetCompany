// 자동 실행: 모드가 '모의'이고 자동 실행이 켜진 직원의 승인 전략을 checkEveryMinutes 마다 확인한다.
// 자동 실행은 모의매매만 한다. 실제 돈은 사이트의 [실제 매수/매도] 버튼으로만 움직인다.

import { config } from './config.js';
import { getApprovedStrategy, listOpenPositions, listTradingMembers, savePosition } from './db.js';
import { log } from './log.js';
import { fetchPrice } from './market.js';
import { enqueue } from './queue.js';
import { runStrategy } from './trading.js';

const lastRun = new Map(); // memberId → 마지막 실행 시각
let targets = []; // [{ member, strategy }]
let loadedAt = 0;

async function refreshTargets() {
  const members = (await listTradingMembers()).filter(
    (m) => m.mode === 'paper' && m.autoRun && m.activeStrategyVersion,
  );
  const next = [];
  for (const member of members) {
    const strategy = await getApprovedStrategy(member);
    if (strategy) next.push({ member, strategy });
  }
  const before = targets.map((t) => `${t.member.id}:v${t.strategy.version}`).join(',');
  const after = next.map((t) => `${t.member.id}:v${t.strategy.version}`).join(',');
  if (before !== after) {
    log(`자동 실행 대상: ${next.length ? next.map((t) => `${t.member.name}(v${t.strategy.version})`).join(', ') : '없음'}`);
  }
  targets = next;
  loadedAt = Date.now();
}

export async function autorunTick() {
  if (Date.now() - loadedAt > config.memberRefreshMs) await refreshTargets();

  for (const { member, strategy } of targets) {
    const everyMs = Math.max(Number(strategy.rules.checkEveryMinutes) || 60, 1) * 60e3;
    if (Date.now() - (lastRun.get(member.id) || 0) < everyMs) continue;
    lastRun.set(member.id, Date.now());

    await enqueue(async () => {
      const messages = await runStrategy(member, strategy, { trigger: '자동' });
      log(`[자동] ${member.name} v${strategy.version}: ${messages.join(' / ')}`);
    });
  }
}

// 보유 중인 코인의 현재가를 갱신해서 사이트의 평가손익이 움직이게 한다.
export async function refreshPrices() {
  const positions = await listOpenPositions();
  const prices = new Map();
  for (const p of positions) {
    try {
      if (!prices.has(p.symbol)) prices.set(p.symbol, await fetchPrice(p.symbol));
      await savePosition(p.memberId, p.mode, p.symbol, { lastPrice: prices.get(p.symbol) });
    } catch (err) {
      log(`시세 갱신 실패 ${p.symbol}: ${err.message}`);
    }
  }
}
