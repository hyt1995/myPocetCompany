// 데이터랩 조회 기간. 이번 달은 아직 안 끝났으니 빼고, 지난달까지 TREND_MONTHS 개월. (한국 시간 기준)

import { TREND_MONTHS } from './capabilities.js';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');

// 반환: { startDate: 'YYYY-MM-01', endDate: 'YYYY-MM-DD'(지난달 말일), months: ['YYYY-MM-01', ...] }
export function trendRange(nowMs = Date.now(), monthsCount = TREND_MONTHS) {
  const kst = new Date(nowMs + KST_OFFSET_MS);
  // 지난달 = 마지막으로 다 끝난 달
  const endYear = kst.getUTCMonth() === 0 ? kst.getUTCFullYear() - 1 : kst.getUTCFullYear();
  const endMonth = kst.getUTCMonth() === 0 ? 12 : kst.getUTCMonth(); // 1~12

  const months = [];
  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const total = endYear * 12 + (endMonth - 1) - i;
    months.push(`${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`);
  }
  const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
  return { startDate: months[0], endDate: `${endYear}-${pad(endMonth)}-${pad(lastDay)}`, months };
}
