import { timingSafeEqual } from 'node:crypto';

// APP_PASSCODE와 같은지 확인한다. 돈이 나가는 API는 전부 이걸 먼저 통과해야 한다.
export function isValidPasscode(input) {
  const expected = process.env.APP_PASSCODE;
  if (!expected || typeof input !== 'string') return false;

  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
