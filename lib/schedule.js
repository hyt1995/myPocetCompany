// 자동 실행 스케줄 계산. 노트북 프로그램 worker/src/schedule.js 와 똑같은 파일 (둘 다 같이 고친다).
// 서버·화면 양쪽에서 쓴다.
// schedule:
//   { type: 'strategy' }                       승인 전략의 checkEveryMinutes 마다
//   { type: 'interval', minutes: 30 }          N분마다 (시계 기준으로 맞춤: 30분이면 :00, :30)
//   { type: 'times', times: ['09:00', '21:00'] } 매일 정해진 시각 (한국 시간)

const KST_OFFSET_MS = 9 * 3600e3; // 한국은 서머타임이 없다
const DAY_MS = 24 * 3600e3;

export function normalizeSchedule(input) {
  if (!input || typeof input !== 'object') return { type: 'strategy' };
  if (input.type === 'interval') {
    const minutes = Math.round(Number(input.minutes));
    if (!(minutes >= 1 && minutes <= 1440)) throw new Error('간격은 1~1440분 사이여야 해요.');
    return { type: 'interval', minutes };
  }
  if (input.type === 'times') {
    const list = Array.isArray(input.times) ? input.times : String(input.times || '').split(/[,\s]+/);
    const times = [...new Set(list.map(toHHMM).filter(Boolean))].sort();
    if (times.length === 0) throw new Error('시각을 09:00 처럼 하나 이상 넣어 주세요.');
    if (times.length > 24) throw new Error('시각은 24개까지 넣을 수 있어요.');
    return { type: 'times', times };
  }
  return { type: 'strategy' };
}

function toHHMM(s) {
  const m = String(s).trim().match(/^(\d{1,2}):?(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

// now 이후 첫 실행 시각 (ms)
export function nextRunAt(schedule, strategyEveryMinutes, now = Date.now()) {
  const s = normalizeSchedule(schedule);
  if (s.type === 'times') {
    const kstDayStart = Math.floor((now + KST_OFFSET_MS) / DAY_MS) * DAY_MS - KST_OFFSET_MS;
    for (const day of [0, 1]) {
      for (const t of s.times) {
        const [h, m] = t.split(':').map(Number);
        const at = kstDayStart + day * DAY_MS + (h * 60 + m) * 60e3;
        if (at > now) return at;
      }
    }
  }
  const minutes = s.type === 'interval' ? s.minutes : Math.max(Math.round(Number(strategyEveryMinutes) || 60), 1);
  const step = minutes * 60e3;
  // 한국 시간 자정을 기준으로 맞춘다 (30분 → :00, :30 / 4시간 → 0, 4, 8시 …)
  const base = now + KST_OFFSET_MS;
  return Math.floor(base / step) * step + step - KST_OFFSET_MS;
}

export function describeSchedule(schedule, strategyEveryMinutes) {
  const s = normalizeSchedule(schedule);
  if (s.type === 'times') return `매일 ${s.times.join(', ')}`;
  const m = s.type === 'interval' ? s.minutes : Number(strategyEveryMinutes) || 60;
  const label = m % 60 === 0 ? `${m / 60}시간` : `${m}분`;
  return s.type === 'interval' ? `${label}마다` : `${label}마다 (전략 기본값)`;
}
