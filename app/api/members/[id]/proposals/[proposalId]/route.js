import { guarded, readJson, requireMember } from '../../../../../../lib/http';
import { handleProposal } from '../../../../../../lib/proposals';

export const dynamic = 'force-dynamic';

// 채팅 확인 카드 [실행] / [취소]. body: { action: 'execute' | 'cancel', confirmLive?: true }
export const POST = guarded(async (request, { id, proposalId }) => {
  const member = await requireMember(id);
  const body = await readJson(request);
  const result = await handleProposal(member, proposalId, body);
  return Response.json(result);
});
