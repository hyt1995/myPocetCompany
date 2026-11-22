// 환경변수가 등록됐는지만 알려준다. 값 자체는 절대 내보내지 않는다.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    anthropicKey: Boolean(process.env.ANTHROPIC_API_KEY),
    passcode: Boolean(process.env.APP_PASSCODE),
    version: (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7),
  });
}
