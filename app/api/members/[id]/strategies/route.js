import { guarded, readJson, requireMember } from '../../../../../lib/http';
import { generateStrategy, listStrategies } from '../../../../../lib/strategies';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 전략 버전 목록
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const strategies = await listStrategies(id);
  return Response.json({ strategies, activeVersion: member.activeStrategyVersion });
});

// 학습 자료로 새 전략 버전 만들기 (초안)
export const POST = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const body = await readJson(request);
  const strategy = await generateStrategy(member, String(body.note || '').trim());
  return Response.json({ strategy });
});
