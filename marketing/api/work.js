// /api/marketing/teams/[teamId]/weeks/[weekKey]               GET  — 그 주의 팀 업무 (+ 오늘 AI 비용)
// /api/marketing/teams/[teamId]/weeks/[weekKey]/steps/[step]  POST — 단계 실행 { action, ownerNote, decision, memo, restart }
//
// 지금 업무가 있는 팀은 신사업팀(newbiz)뿐이다. 다른 팀은 업무 코드가 생기면 여기 연결한다.

import { guarded, httpError, readJson } from '../core/server';
import { getWeekWithSpend, runStep } from '../teams/newbiz/work';

const ACTIONS = ['collect', 'write', 'turn', 'decide'];

function requireTeam(teamId) {
  if (teamId !== 'newbiz') throw httpError(404, '이 팀은 아직 업무가 없어요.');
}

export const weekHandler = guarded(async (_request, { teamId, weekKey }) => {
  requireTeam(teamId);
  return Response.json(await getWeekWithSpend(weekKey));
});

export const stepHandler = guarded(async (request, { teamId, weekKey, step }) => {
  requireTeam(teamId);
  const body = await readJson(request);
  if (!ACTIONS.includes(body.action)) throw httpError(400, '모르는 실행 방법이에요.');
  return Response.json(await runStep(weekKey, step, body.action, body));
});
