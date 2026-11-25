// 사이트 ↔ 노트북 매매 프로그램 사이의 명령, 체결 기록, 보유 현황, 연결 상태.
// 자세한 규격은 WORKER_PROTOCOL.md.
//
// 실제 돈이 걸린 명령(live_buy, live_sell)에는 COMMAND_SIGNING_SECRET 으로 HMAC 서명을 붙인다.
// 매매 프로그램은 서명이 맞고 만료되지 않은 명령만 실행해야 한다.

import { createHmac } from 'node:crypto';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { COL, requireDb } from './firebase';

export const COMMAND_TYPES = ['run', 'refresh_prices', 'paper_buy', 'paper_sell', 'live_buy', 'live_sell'];
const LIVE_TYPES = ['live_buy', 'live_sell'];
const COMMAND_TTL_MS = 5 * 60 * 1000; // 실전 명령은 5분 안에 처리되지 않으면 무효
const WORKER_ONLINE_MS = 12 * 60 * 1000; // 매매 프로그램은 5분마다 신호. 12분 안에 신호가 있으면 '연결됨'

export function isLive(type) {
  return LIVE_TYPES.includes(type);
}

export function liveSigningReady() {
  return Boolean(process.env.COMMAND_SIGNING_SECRET);
}

// 서명할 문자열. 매매 프로그램도 똑같이 만들어서 비교한다.
export function canonicalString(c) {
  return [
    c.id,
    c.memberId,
    c.type,
    c.symbol || '',
    c.quoteAmountUsdt ?? '',
    c.sellAll ? 'all' : c.quantity ?? '',
    c.createdAt,
    c.expiresAt,
  ].join('|');
}

export function sign(c, secret = process.env.COMMAND_SIGNING_SECRET) {
  return createHmac('sha256', secret).update(canonicalString(c)).digest('hex');
}

export async function createCommand(member, input) {
  const type = input.type;
  if (!COMMAND_TYPES.includes(type)) throw new Error('알 수 없는 명령이에요.');

  const command = {
    memberId: member.id,
    departmentId: member.departmentId,
    type,
    strategyVersion: member.activeStrategyVersion,
    status: 'pending',
    createdAt: Date.now(),
    expiresAt: null,
    symbol: null,
    quoteAmountUsdt: null,
    quantity: null,
    sellAll: false,
    signature: null,
    result: null,
    error: null,
    handledAt: null,
  };

  if (type === 'run') {
    if (!member.activeStrategyVersion) throw new Error('승인된 전략이 없어요. 전략 탭에서 먼저 승인해 주세요.');
  } else if (type === 'refresh_prices') {
    // 대상은 이 직원의 보유 코인 전체. 추가 정보 없음.
  } else {
    const symbol = String(input.symbol || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,15}USDT$/.test(symbol)) throw new Error('종목은 BTCUSDT 같은 이름으로 넣어 주세요.');
    command.symbol = symbol;

    if (type.endsWith('_buy')) {
      const amount = Number(input.quoteAmountUsdt);
      if (!(amount > 0)) throw new Error('매수 금액(USDT)을 넣어 주세요.');
      command.quoteAmountUsdt = Math.round(amount * 100) / 100;
    } else {
      const qty = input.quantity === 'all' || input.quantity == null || input.quantity === '' ? null : Number(input.quantity);
      if (qty != null && !(qty > 0)) throw new Error('매도 수량이 올바르지 않아요.');
      command.quantity = qty;
      command.sellAll = qty == null;
    }
  }

  const db = requireDb();
  const ref = doc(collection(db, COL.commands));
  command.id = ref.id;

  if (isLive(type)) {
    if (!liveSigningReady()) {
      throw new Error('실전 서명키(COMMAND_SIGNING_SECRET)가 Vercel에 없어서 실제 주문을 보낼 수 없어요.');
    }
    command.expiresAt = command.createdAt + COMMAND_TTL_MS;
    command.signature = sign(command);
  }

  const { id, ...data } = command;
  await setDoc(ref, data);
  return command;
}

export async function listCommands(memberId, count = 20) {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, COL.commands), where('memberId', '==', memberId)));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data(), signature: undefined }))
    .filter((c) => c.type !== 'refresh_prices') // 현황 탭이 자동으로 보내는 가격 갱신은 목록에서 뺀다
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, count);
}

export async function getWorkerStatus() {
  const db = requireDb();
  const snap = await getDoc(doc(db, COL.worker, 'status'));
  if (!snap.exists()) {
    return { online: false, lastSeenAt: null, version: null, liveEnabled: false, testnet: true, nextRuns: {} };
  }
  const d = snap.data();
  const lastSeenAt = typeof d.lastSeenAt === 'number' ? d.lastSeenAt : null;
  return {
    online: lastSeenAt != null && Date.now() - lastSeenAt < WORKER_ONLINE_MS,
    lastSeenAt,
    version: d.version || null,
    liveEnabled: Boolean(d.liveEnabled),
    testnet: d.testnet !== false,
    nextRuns: d.nextRuns || {}, // 직원별 다음 자동 실행 시각 (매매 프로그램이 예약할 때 씀)
  };
}

async function byMember(col, memberId) {
  const db = requireDb();
  const snap = await getDocs(query(collection(db, col), where('memberId', '==', memberId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getPortfolio(member) {
  const [positions, trades] = await Promise.all([
    byMember(COL.positions, member.id),
    byMember(COL.trades, member.id),
  ]);
  trades.sort((a, b) => (b.at || 0) - (a.at || 0));
  return {
    positions,
    trades: trades.slice(0, 100),
    stats: {
      paper: computeStats(positions, trades, 'paper', member.paperCapitalUsdt),
      live: computeStats(positions, trades, 'live', null),
    },
  };
}

// 수익률 계산. 모의는 시작 가상자금 기준, 실전은 지금까지 실전 매수에 쓴 총액 기준.
// (realizedPnlUsdt 에는 매매 프로그램이 수수료를 이미 빼 두었다)
export function computeStats(positions, trades, mode, startCapital) {
  const pos = positions.filter((p) => p.mode === mode);
  const tr = trades.filter((t) => t.mode === mode);

  let unrealized = 0;
  let marketValue = 0;
  let costBasis = 0;
  for (const p of pos) {
    const qty = num(p.quantity);
    const avg = num(p.avgPrice);
    const last = num(p.lastPrice) || avg;
    unrealized += (last - avg) * qty;
    marketValue += last * qty;
    costBasis += avg * qty;
  }
  const realized = pos.reduce((s, p) => s + num(p.realizedPnlUsdt), 0);
  const fees = tr.reduce((s, t) => s + num(t.feeUsdt), 0);
  const totalPnl = realized + unrealized;
  const invested = tr.filter((t) => t.side === 'buy').reduce((s, t) => s + num(t.quoteAmountUsdt), 0);
  const base = startCapital || invested || costBasis;

  return {
    trades: tr.length,
    openPositions: pos.filter((p) => num(p.quantity) > 0).length,
    marketValueUsdt: round(marketValue),
    realizedPnlUsdt: round(realized),
    unrealizedPnlUsdt: round(unrealized),
    totalPnlUsdt: round(totalPnl),
    feesUsdt: round(fees),
    returnPct: base > 0 ? round((totalPnl / base) * 100) : null,
    startCapitalUsdt: startCapital,
  };
}

export async function getDepartmentStats(memberIds) {
  const db = requireDb();
  const [posSnap, trSnap] = await Promise.all([
    getDocs(collection(db, COL.positions)),
    getDocs(collection(db, COL.trades)),
  ]);
  const positions = posSnap.docs.map((d) => d.data());
  const trades = trSnap.docs.map((d) => d.data());
  return Object.fromEntries(
    memberIds.map(({ id, paperCapitalUsdt }) => [
      id,
      computeStats(
        positions.filter((p) => p.memberId === id),
        trades.filter((t) => t.memberId === id),
        'paper',
        paperCapitalUsdt,
      ),
    ]),
  );
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round(n) {
  return Math.round(n * 100) / 100;
}
