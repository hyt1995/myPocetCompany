// Firestore 연결. Firebase 웹 SDK를 서버(API 라우트)에서만 사용한다.
//
// 지금은 사장님 혼자 쓰므로 Firestore 규칙을 열어 둔 상태다 (firestore.rules).
// 기존 focus-app 프로젝트를 같이 쓰기 때문에, 이 사이트의 컬렉션 이름은 전부 'mpc_'로 시작한다.
//
// 환경변수: FIREBASE_API_KEY, FIREBASE_APPID, (선택) FIREBASE_PROJECT_ID

import { getApps, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore, limit, query } from 'firebase/firestore';

const DEFAULT_PROJECT_ID = 'focus-app-76679';

// 컬렉션 구조는 WORKER_PROTOCOL.md 에 정리되어 있다. (노트북 매매 프로그램도 같은 규격을 쓴다)
export const COL = {
  aiCalls: 'mpc_ai_calls',
  aiBudget: 'mpc_ai_budget', // 하루 AI 비용 합계 (문서 id = 한국 날짜 YYYY-MM-DD). 킬 스위치가 읽는다
  departments: 'mpc_departments', // 부서 공통 지침
  members: 'mpc_members', // 하위 컬렉션: messages, results, materials, strategies
  commands: 'mpc_commands', // 사이트 → 매매 프로그램 명령
  trades: 'mpc_trades', // 매매 프로그램 → 체결 기록
  positions: 'mpc_positions', // 매매 프로그램 → 보유 현황
  worker: 'mpc_worker', // 매매 프로그램 연결 상태 (문서 'status')
};

let cachedDb = null;

export function getDb() {
  if (cachedDb) return cachedDb;

  const apiKey = process.env.FIREBASE_API_KEY;
  if (!apiKey) return null;

  const projectId = process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const config = {
    apiKey,
    projectId,
    authDomain: `${projectId}.firebaseapp.com`,
    appId: process.env.FIREBASE_APPID,
  };

  try {
    const app = getApps()[0] || initializeApp(config);
    cachedDb = getFirestore(app);
    return cachedDb;
  } catch (err) {
    console.error('[firebase] 초기화 실패:', err.message);
    return null;
  }
}

export function requireDb() {
  const db = getDb();
  if (!db) throw new Error('DB(Firebase)가 연결돼 있지 않아요. FIREBASE_API_KEY를 확인해 주세요.');
  return db;
}

// 상태 확인용: 'missing' | 'ok' | 'error'
export async function checkFirestore() {
  if (!process.env.FIREBASE_API_KEY) return 'missing';
  const db = getDb();
  if (!db) return 'error';
  try {
    await withTimeout(getDocs(query(collection(db, COL.aiCalls), limit(1))), 6000);
    return 'ok';
  } catch (err) {
    console.error('[firebase] 연결 확인 실패:', err.message);
    return 'error';
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('시간 초과')), ms)),
  ]);
}
