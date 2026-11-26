// /api/research/keys   GET 키가 들어 있는지(값은 안 보냄), POST 연결 테스트 (키워드 '날씨' 1개로 각 API 1번씩)

import { guarded } from '../core/server';
import { trendRange } from '../dates.js';
import { keyStatus } from '../sources/keys.js';
import { fetchBlogTotal, fetchTrends } from '../sources/naverHub.js';
import { fetchKeywordStats } from '../sources/searchad.js';

export const statusHandler = guarded(async () => Response.json(keyStatus()));

async function attempt(fn) {
  try {
    const detail = await fn();
    return { ok: true, message: detail };
  } catch (err) {
    return { ok: false, message: err.message };
  }
}

export const testHandler = guarded(async () => {
  const status = keyStatus();
  const word = '날씨';
  const skipped = { ok: false, message: '키가 없어서 건너뜀' };

  const [searchad, datalab, blog] = await Promise.all([
    status.ready.searchad
      ? attempt(async () => {
          const found = await fetchKeywordStats([word]);
          const item = found.get(word);
          return item ? `'${word}' 월 검색수 PC ${item.monthlyPcQcCnt} · 모바일 ${item.monthlyMobileQcCnt}` : '응답은 왔지만 값이 없어요';
        })
      : skipped,
    status.ready.hub
      ? attempt(async () => {
          const trends = await fetchTrends([word], trendRange());
          return `'${word}' 추세 ${Object.keys(trends.get(word) || {}).length}개월 받음`;
        })
      : skipped,
    status.ready.hub ? attempt(async () => `'${word}' 블로그 글 ${await fetchBlogTotal(word)}개`) : skipped,
  ]);

  return Response.json({ searchad, datalab, blog });
});
