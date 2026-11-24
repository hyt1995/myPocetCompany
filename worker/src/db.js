// Firestore 읽기·쓰기. 컬렉션과 필드는 WORKER_PROTOCOL.md 와 사이트 lib/ 와 같다.

import { initializeApp } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { config } from './config.js';

const COL = {
  members: 'mpc_members',
  commands: 'mpc_commands',
  trades: 'mpc_trades',
  positions: 'mpc_positions',
  worker: 'mpc_worker',
};

let db;

export function initDb() {
  const { apiKey, appId, projectId } = config.firebase;
  const app = initializeApp({ apiKey, appId, projectId, authDomain: `${projectId}.firebaseapp.com` });
  db = getFirestore(app);
}

// ---- 연결 상태 ----
export function heartbeat(extra = {}) {
  return setDoc(
    doc(db, COL.worker, 'status'),
    {
      lastSeenAt: Date.now(),
      version: config.version,
      host: config.host,
      liveEnabled: config.live.enabled,
      testnet: config.binance.testnet,
      ...extra,
    },
    { merge: true },
  );
}

// ---- 직원·전략 ----
export async function getMember(id) {
  const snap = await getDoc(doc(db, COL.members, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function listTradingMembers() {
  const snap = await getDocs(query(collection(db, COL.members), where('departmentId', '==', 'investment')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function getApprovedStrategy(member) {
  if (!member?.activeStrategyVersion) return null;
  const snap = await getDoc(doc(db, COL.members, member.id, 'strategies', `v${member.activeStrategyVersion}`));
  if (!snap.exists()) return null;
  const s = snap.data();
  return s.status === 'approved' && s.rules ? { id: snap.id, ...s } : null;
}

// ---- 명령 ----
// 대기 중 명령을 실시간으로 받는다. 처음 연결할 때 이미 쌓여 있던 대기 명령도 들어온다.
export function onPendingCommands(handler, onError) {
  return onSnapshot(
    query(collection(db, COL.commands), where('status', '==', 'pending')),
    (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === 'added') handler(change.doc.id, change.doc.data());
      }
    },
    onError,
  );
}

// 같은 명령을 두 번 실행하지 않도록 pending → processing 을 트랜잭션으로 잡는다.
export async function claimCommand(id) {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, COL.commands, id);
    const snap = await tx.get(ref);
    if (!snap.exists() || snap.data().status !== 'pending') return null;
    tx.update(ref, { status: 'processing', processingAt: Date.now(), worker: config.host });
    return snap.data();
  });
}

export function finishCommand(id, { status, result = null, error = null }) {
  return updateDoc(doc(db, COL.commands, id), { status, result, error, handledAt: Date.now() });
}

// ---- 포지션·체결 ----
const positionId = (memberId, mode, symbol) => `${memberId}_${mode}_${symbol}`;

export async function getPosition(memberId, mode, symbol) {
  const snap = await getDoc(doc(db, COL.positions, positionId(memberId, mode, symbol)));
  return snap.exists() ? snap.data() : null;
}

export function savePosition(memberId, mode, symbol, position) {
  return setDoc(
    doc(db, COL.positions, positionId(memberId, mode, symbol)),
    { ...position, memberId, mode, symbol, updatedAt: Date.now() },
    { merge: true },
  );
}

export async function listPositions(memberId, mode) {
  const snap = await getDocs(query(collection(db, COL.positions), where('memberId', '==', memberId)));
  return snap.docs.map((d) => d.data()).filter((p) => !mode || p.mode === mode);
}

export async function listOpenPositions() {
  const snap = await getDocs(collection(db, COL.positions));
  return snap.docs.map((d) => d.data()).filter((p) => Number(p.quantity) > 0);
}

export async function addTrade(trade) {
  const ref = await addDoc(collection(db, COL.trades), { ...trade, at: Date.now() });
  return ref.id;
}

// 오늘(노트북 기준 자정 이후) 실전 매수 합계
export async function liveBuyTotalSince(sinceMs) {
  const snap = await getDocs(query(collection(db, COL.trades), where('mode', '==', 'live')));
  return snap.docs
    .map((d) => d.data())
    .filter((t) => t.side === 'buy' && t.at >= sinceMs)
    .reduce((sum, t) => sum + Number(t.quoteAmountUsdt || 0), 0);
}
