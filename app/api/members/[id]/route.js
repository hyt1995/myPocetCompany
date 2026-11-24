import { guarded, readJson, requireMember } from '../../../../lib/http';
import { getMessages, getResults, updateMember } from '../../../../lib/members';

export const dynamic = 'force-dynamic';

// 직원 정보 + 최근 채팅 + 결과물
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const [messages, results] = await Promise.all([getMessages(id), getResults(id)]);
  return Response.json({ member, messages, results });
});

// 직원 정보·지침·프로그램 설정 저장
export const PUT = guarded(async (request, { id }) => {
  await requireMember(id);
  const body = await readJson(request);
  // 승인 전략 버전은 전략 승인으로만 바뀐다.
  delete body.activeStrategyVersion;
  const member = await updateMember(id, body);
  return Response.json({ member });
});
