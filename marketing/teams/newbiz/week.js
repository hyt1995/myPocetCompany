// 주(週) 계산. 한국 시간 기준 ISO 주 (월요일 시작). 예: '2026-W48'
// DB·외부 의존 없음 → marketing/test 에서 테스트

const KST_MS = 9 * 3600_000;
const DAY_MS = 86_400_000;
const WEEK_PATTERN = /^(\d{4})-W(\d{2})$/;

const ymd = (d) => d.toISOString().slice(0, 10);

// ms 의 한국 날짜(자정, UTC 로 표현)
function kstMidnight(ms) {
  const d = new Date(ms + KST_MS);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function kstToday(ms = Date.now()) {
  return ymd(kstMidnight(ms));
}

export function weekKeyOf(ms = Date.now()) {
  const d = kstMidnight(ms);
  const day = d.getUTCDay() || 7; // 월=1 … 일=7
  const thursday = new Date(d.getTime() + (4 - day) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = Math.ceil(((thursday.getTime() - jan1) / DAY_MS + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function isWeekKey(key) {
  const m = typeof key === 'string' && key.match(WEEK_PATTERN);
  if (!m) return false;
  const w = Number(m[2]);
  if (w < 1 || w > 53) return false;
  return weekKeyOf(mondayOf(key).getTime() - KST_MS) === key; // 53주가 없는 해 걸러내기
}

function mondayOf(key) {
  const [, y, w] = key.match(WEEK_PATTERN);
  const jan4 = new Date(Date.UTC(Number(y), 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  return new Date(jan4.getTime() - (jan4Day - 1) * DAY_MS + (Number(w) - 1) * 7 * DAY_MS);
}

// 주의 날짜 범위와 앞뒤 주. 월요일 브리핑은 '지난주(prev)'를 다룬다.
export function weekRange(key) {
  if (!isWeekKey(key)) throw new Error(`주 표기가 잘못됐어요: ${key}`);
  const monday = mondayOf(key);
  const sunday = new Date(monday.getTime() + 6 * DAY_MS);
  const prevMonday = new Date(monday.getTime() - 7 * DAY_MS);
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  return {
    key,
    monday: ymd(monday),
    sunday: ymd(sunday),
    prevKey: weekKeyOf(prevMonday.getTime() - KST_MS),
    nextKey: weekKeyOf(nextMonday.getTime() - KST_MS),
    prevMonday: ymd(prevMonday),
    prevSunday: ymd(new Date(monday.getTime() - DAY_MS)),
  };
}

// 화면 표시용: '11/23~11/29'
export function shortRange(from, to) {
  const f = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
  return `${f(from)}~${f(to)}`;
}
