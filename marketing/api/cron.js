// /api/marketing/cron/weekly — Vercel Cron 이 매주 월요일 07:00 (한국 시간) 에 부른다. (vercel.json)
// 신사업팀 월요일 경제 브리핑을 쓰고 회사 게시판에 올린다.
//
// 보호: Vercel 환경변수 CRON_SECRET 이 있어야 한다. Vercel 이 'Authorization: Bearer <CRON_SECRET>' 을 붙여 부른다.
// CRON_SECRET 이 없으면 아무도 부를 수 없다 (자동 브리핑 꺼짐, 화면의 버튼으로는 할 수 있다).

import { runMondayBriefing } from '../teams/newbiz/work';

export async function cronHandler(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    return Response.json({ ok: true, ...(await runMondayBriefing()) });
  } catch (err) {
    console.error('[cron] 월요일 브리핑 실패:', err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
