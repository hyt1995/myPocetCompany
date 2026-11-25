import { findDepartment } from '../../../../lib/departments';
import { guarded, readJson, requireMember } from '../../../../lib/http';
import { getMessages, getResults, updateMember } from '../../../../lib/members';
import { listProposals } from '../../../../lib/proposals';

export const dynamic = 'force-dynamic';

// 직원 정보만 (가볍게). ?include=chat 이면 최근 채팅·결과·확인 카드도 같이.
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const include = new URL(request.url).searchParams.get('include');
  if (include !== 'chat') return Response.json({ member });

  const trading = Boolean(findDepartment(member.departmentId)?.trading);
  const [messages, results, proposals] = await Promise.all([
    getMessages(id),
    getResults(id),
    trading ? listProposals(id) : [],
  ]);
  return Response.json({ member, messages, results, proposals });
});

// 직원 정보·지침·프로그램 설정(모드, 자동 실행, 스케줄, 모의 자금) 저장
export const PUT = guarded(async (request, { id }) => {
  await requireMember(id);
  const body = await readJson(request);
  // 승인 전략 버전은 전략 승인으로만 바뀐다.
  delete body.activeStrategyVersion;
  const member = await updateMember(id, body);
  return Response.json({ member });
});
