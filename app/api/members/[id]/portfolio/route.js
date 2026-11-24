import { guarded, requireMember } from '../../../../../lib/http';
import { getPortfolio } from '../../../../../lib/trading';

export const dynamic = 'force-dynamic';

// 현황 탭: 보유 코인, 매매 내역, 모의·실전 수익률
export const GET = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const portfolio = await getPortfolio(member);
  return Response.json(portfolio);
});
