// 화면 표시용 숫자·시간 포맷

export function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCost(value) {
  if (typeof value !== 'number') return '비용 계산 불가';
  return `$${value.toFixed(4)}`;
}

export function formatUsdt(value, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })} USDT`;
}

export function formatPct(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function pnlClass(value) {
  if (typeof value !== 'number' || value === 0) return '';
  return value > 0 ? 'up' : 'down';
}

export function formatNumber(value, digits = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export const MODE_LABELS = { stopped: '정지', paper: '모의' };

export const COMMAND_LABELS = {
  run: '지금 실행',
  paper_buy: '모의 매수',
  paper_sell: '모의 매도',
  live_buy: '실제 매수',
  live_sell: '실제 매도',
};

export const COMMAND_STATUS_LABELS = {
  pending: '대기 중',
  processing: '처리 중',
  done: '완료',
  failed: '실패',
  rejected: '거절',
  expired: '만료',
};
