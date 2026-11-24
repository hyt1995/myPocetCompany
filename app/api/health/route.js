import { checkFirestore } from '../../../lib/firebase';

// 환경변수·DB 연결 상태만 알려준다. 키 값 자체는 절대 내보내지 않는다.
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    passcode: Boolean(process.env.APP_PASSCODE),
    firestore: await checkFirestore(), // 'missing' | 'ok' | 'error'
    version: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
  });
}
