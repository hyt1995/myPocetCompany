// 네이버 검색광고 키워드도구 (/keywordstool): 최근 30일 검색수, 광고 경쟁 정도.
// 한 번에 키워드 5개까지. 띄어쓰기는 빼고 보낸다 (검색광고 키워드는 띄어쓰기가 없다).
// 연관 키워드도 같이 오지만 우리가 넣은 키워드 것만 쓴다.

import { compactKeyword } from '../plan.js';
import { searchadSignature } from '../sign.js';
import { readKeys } from './keys.js';

const BASE_URL = 'https://api.searchad.naver.com';
const URI = '/keywordstool';
export const SEARCHAD_PER_CALL = 5;

// 반환: Map(compactKeyword → keywordList 항목)
export async function fetchKeywordStats(keywords) {
  const { customerId, accessLicense, secretKey } = readKeys().searchad;
  if (!customerId || !accessLicense || !secretKey) throw new Error('검색광고 API 키가 없어요.');
  if (keywords.length > SEARCHAD_PER_CALL) throw new Error(`검색광고는 한 번에 ${SEARCHAD_PER_CALL}개까지예요.`);

  const hints = keywords.map((k) => k.replace(/ /g, ''));
  const timestamp = String(Date.now());
  const url = `${BASE_URL}${URI}?hintKeywords=${encodeURIComponent(hints.join(','))}&showDetail=1`;

  const res = await fetch(url, {
    headers: {
      'X-Timestamp': timestamp,
      'X-API-KEY': accessLicense,
      'X-Customer': customerId,
      'X-Signature': searchadSignature(timestamp, 'GET', URI, secretKey),
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`검색광고 API 오류 (HTTP ${res.status}) ${data?.title || data?.message || ''}`.trim());

  const wanted = new Set(keywords.map(compactKeyword));
  const found = new Map();
  for (const item of data?.keywordList || []) {
    const key = compactKeyword(item.relKeyword);
    if (wanted.has(key) && !found.has(key)) found.set(key, item);
  }
  return found;
}
