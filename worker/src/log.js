export function log(...args) {
  const t = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  console.log(`[${t}]`, ...args);
}
