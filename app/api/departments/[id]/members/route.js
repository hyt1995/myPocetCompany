import { findDepartment } from '../../../../../lib/departments';
import { guarded, httpError, readJson } from '../../../../../lib/http';
import { createMember, listMembers } from '../../../../../lib/members';

export const dynamic = 'force-dynamic';

// 부서의 직원 목록
export const GET = guarded(async (request, { id }) => {
  const members = await listMembers(id);
  return Response.json({ members });
});

// 직원 추가
export const POST = guarded(async (request, { id }) => {
  if (!findDepartment(id)) throw httpError(404, '없는 부서예요.');
  const body = await readJson(request);
  if (!String(body.name || '').trim()) throw httpError(400, '직원 이름을 넣어 주세요.');
  const member = await createMember(id, body);
  return Response.json({ member });
});
