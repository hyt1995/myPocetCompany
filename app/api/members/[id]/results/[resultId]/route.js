import { setResultStatus } from '../../../../../../lib/members';
import { rejectIfBadPasscode } from '../../../../../../lib/passcode';

export const dynamic = 'force-dynamic';

const STATUSES = ['new', 'approved'];

// 결과물 상태 변경 (승인 / 승인 취소)
export async function PATCH(request, { params }) {
  const denied = rejectIfBadPasscode(request);
  if (denied) return denied;

  const { id, resultId } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }

  if (!STATUSES.includes(body?.status)) {
    return Response.json({ error: '알 수 없는 상태예요.' }, { status: 400 });
  }

  try {
    await setResultStatus(id, resultId, body.status);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
