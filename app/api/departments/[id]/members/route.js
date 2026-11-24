import { listMembers } from '../../../../../lib/members';
import { rejectIfBadPasscode } from '../../../../../lib/passcode';

export const dynamic = 'force-dynamic';

// 부서의 팀원 목록
export async function GET(request, { params }) {
  const denied = rejectIfBadPasscode(request);
  if (denied) return denied;

  const { id } = await params;
  try {
    const members = await listMembers(id);
    return Response.json({ members });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
