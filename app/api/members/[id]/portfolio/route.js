import { guarded, requireMember } from '../../../../../lib/http';
import { getPortfolio, getWorkerStatus } from '../../../../../lib/trading';

export const dynamic = 'force-dynamic';

// 현황 탭: 보유 코인, 매매 내역, 모의·실전 수익률 + 노트북 연결 여부(현재가 갱신 요청용)
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const [portfolio, worker] = await Promise.all([getPortfolio(member), getWorkerStatus()]);
  return Response.json({ ...portfolio, workerOnline: worker.online });
});
