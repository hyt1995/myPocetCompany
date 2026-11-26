// NAVER API HUB (네이버 클라우드): 데이터랩 검색어 트렌드 + 블로그 검색.
// 2026-07-31 이후 새 키는 API HUB 에서만 발급된다. 예전 개발자센터 키는 NAVER_API_LEGACY=true 로 예전 주소를 쓴다.

import { readKeys } from './keys.js';

export const DATALAB_PER_CALL = 5; // 데이터랩은 한 번에 주제어 그룹 5개까지

function endpoint(kind) {
  const { clientId, clientSecret, legacy } = readKeys().hub;
  if (!clientId || !clientSecret) throw new Error('NAVER API HUB 키가 없어요.');
  if (legacy) {
    return {
      url: kind === 'datalab' ? 'https://openapi.naver.com/v1/datalab/search' : 'https://openapi.naver.com/v1/search/blog.json',
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
    };
  }
  return {
    url:
      kind === 'datalab'
        ? 'https://naverapihub.apigw.ntruss.com/search-trend/v1/search'
        : 'https://naverapihub.apigw.ntruss.com/search/v1/blog',
    headers: { 'X-NCP-APIGW-API-KEY-ID': clientId, 'X-NCP-APIGW-API-KEY': clientSecret },
  };
}

async function readError(res, name) {
  const data = await res.json().catch(() => null);
  const detail = data?.errorMessage || data?.error?.message || data?.message || '';
  return new Error(`${name} 오류 (HTTP ${res.status}) ${detail}`.trim());
}

// 반환: Map(keyword → { 'YYYY-MM-01': ratio })
export async function fetchTrends(keywords, range) {
  if (keywords.length > DATALAB_PER_CALL) throw new Error(`데이터랩은 한 번에 ${DATALAB_PER_CALL}개까지예요.`);
  const { url, headers } = endpoint('datalab');
  const res = await fetch(url, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startDate: range.startDate,
      endDate: range.endDate,
      timeUnit: 'month',
      keywordGroups: keywords.map((k) => ({ groupName: k, keywords: [k] })),
    }),
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!res.ok) throw await readError(res, '데이터랩');
  const data = await res.json();

  const out = new Map();
  for (const result of data?.results || []) {
    const series = {};
    for (const point of result.data || []) series[String(point.period).slice(0, 7) + '-01'] = Number(point.ratio) || 0;
    out.set(result.title, series);
  }
  return out;
}

// 반환: 블로그 글 수 (total)
export async function fetchBlogTotal(keyword) {
  const { url, headers } = endpoint('blog');
  const res = await fetch(`${url}?query=${encodeURIComponent(keyword)}&display=1`, {
    headers,
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });
  if (!res.ok) throw await readError(res, '블로그 검색');
  const data = await res.json();
  const total = Number(data?.total);
  return Number.isFinite(total) ? total : null;
}
