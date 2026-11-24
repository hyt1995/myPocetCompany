import { guarded, httpError, readJson, requireMember } from '../../../../../lib/http';
import { createCommand, isLive } from '../../../../../lib/trading';

export const dynamic = 'force-dynamic';

// 프로그램 명령: [지금 실행], [모의 매수/매도], [실제 매수/매도]
// 실제 돈 명령은 confirmLive: true 가 있어야 하고, 서버가 서명해서 저장한다.
export const POST = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const body = await readJson(request);
  if (isLive(body.type) && body.confirmLive !== true) {
    throw httpError(400, '실제 주문은 확인이 필요해요.');
  }
  const command = await createCommand(member, body);
  return Response.json({ command: { ...command, signature: undefined } });
});
