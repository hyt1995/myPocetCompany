// /api/marketing/members/{memberId} — 마케팅 직원의 이름·역할·모델 등급·지침 수정

import { guarded, readJson } from '../core/server';
import { updateMarketingMember } from '../server/team';

export const PUT = guarded(async (request, { memberId }) => {
  const body = await readJson(request);
  const member = await updateMarketingMember(memberId, body);
  return Response.json({ member });
});
