import { guarded, httpError, readJson, requireMember } from '../../../../../../lib/http';
import { approveStrategy } from '../../../../../../lib/strategies';

export const dynamic = 'force-dynamic';

// 전략 승인. version 은 'v3' 또는 '3'
export const PATCH = guarded(async (request, { id, version }) => {
  const member = await requireMember(id);
  const body = await readJson(request);
  if (body.action !== 'approve') throw httpError(400, '알 수 없는 요청이에요.');
  const n = Number(String(version).replace(/^v/, ''));
  if (!Number.isInteger(n) || n < 1) throw httpError(400, '전략 버전이 올바르지 않아요.');
  await approveStrategy(member, n);
  return Response.json({ ok: true, activeVersion: n });
});
