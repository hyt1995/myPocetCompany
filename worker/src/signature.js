// 실전 명령 서명 확인. 사이트(lib/trading.js)의 canonicalString / sign 과 똑같아야 한다.

import { createHmac, timingSafeEqual } from 'node:crypto';

export function canonicalString(c, id) {
  return [
    id,
    c.memberId,
    c.type,
    c.symbol || '',
    c.quoteAmountUsdt ?? '',
    c.sellAll ? 'all' : c.quantity ?? '',
    c.createdAt,
    c.expiresAt,
  ].join('|');
}

export function verifySignature(command, id, secret) {
  if (!secret || !command.signature) return false;
  const expected = createHmac('sha256', secret).update(canonicalString(command, id)).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(command.signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
