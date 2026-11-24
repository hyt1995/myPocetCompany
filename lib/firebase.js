// Firestore 연결 (서버 전용).
//
// 로그인이 없는 사이트라서 브라우저가 Firestore에 직접 접근하면 안 된다.
// 그래서 Admin SDK(서비스 계정)로 서버 API에서만 읽고 쓴다.
// Firestore 보안 규칙은 firestore.rules 처럼 "브라우저 접근 전부 거부"로 둔다.
//
// 필요한 환경변수: FIREBASE_SERVICE_ACCOUNT
//   Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → "새 비공개 키 생성"으로 받은
//   JSON 파일 내용 전체를 그대로 붙여넣는다.

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let cachedDb = null;

export function getDb() {
  if (cachedDb) return cachedDb;

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    const serviceAccount = JSON.parse(raw);
    const app = getApps()[0] || initializeApp({ credential: cert(serviceAccount) });
    cachedDb = getFirestore(app);
    return cachedDb;
  } catch (err) {
    console.error('[firebase] 초기화 실패:', err.message);
    return null;
  }
}

// 상태 확인용: 'missing' | 'ok' | 'error'
export async function checkFirestore() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) return 'missing';
  const db = getDb();
  if (!db) return 'error';
  try {
    await db.collection('ai_calls').limit(1).get();
    return 'ok';
  } catch (err) {
    console.error('[firebase] 연결 확인 실패:', err.message);
    return 'error';
  }
}
