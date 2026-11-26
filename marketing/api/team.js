// /api/marketing/team — 마케팅사업부 화면 데이터 (직원 + 부서 공통 지침)

import { guarded, readJson } from '../core/server';
import { getMarketingSettings, listTeam, updateMarketingSettings } from '../server/team';

// 부서 화면을 열 때 한 번 부른다.
export const GET = guarded(async () => {
  const [members, settings] = await Promise.all([listTeam(), getMarketingSettings()]);
  return Response.json({ members, settings });
});

// 부서 공통 지침(회의 규칙) 저장
export const PUT = guarded(async (request) => {
  const body = await readJson(request);
  const settings = await updateMarketingSettings({ commonGuideline: body.commonGuideline });
  return Response.json({ settings });
});
