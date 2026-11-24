import { getMember, getMessages, getResults, updateMember } from '../../../../lib/members';
import { rejectIfBadPasscode } from '../../../../lib/passcode';

export const dynamic = 'force-dynamic';

// 팀원 정보 + 최근 채팅 + 결과물
export async function GET(request, { params }) {
  const denied = rejectIfBadPasscode(request);
  if (denied) return denied;

  const { id } = await params;
  try {
    const member = await getMember(id);
    if (!member) return Response.json({ error: '팀원을 찾을 수 없어요.' }, { status: 404 });
    const [messages, results] = await Promise.all([getMessages(id), getResults(id)]);
    return Response.json({ member, messages, results });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// 팀원 정보·지침(시스템 프롬프트) 저장
export async function PUT(request, { params }) {
  const denied = rejectIfBadPasscode(request);
  if (denied) return denied;

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }

  try {
    const existing = await getMember(id);
    if (!existing) return Response.json({ error: '팀원을 찾을 수 없어요.' }, { status: 404 });
    const member = await updateMember(id, body || {});
    return Response.json({ member });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
