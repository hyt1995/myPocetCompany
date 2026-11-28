// /api/research/runs            GET 최근 조사 목록, POST 새 조사 (사장님이 시장조사 화면에서 직접)
// /api/research/runs/{runId}    GET 조사 결과, PUT 줄 세우기 기준 바꾸기 { ranking }
// /api/research/runs/{runId}/step POST 다음 묶음 처리

import { guarded, httpError, readJson } from '../core/server';
import { splitKeywords } from '../plan.js';
import { createRun, getRun, listRuns, runNextBatch, updateRunRanking } from '../server/runs.js';

export const listHandler = guarded(async () => Response.json({ runs: await listRuns(10) }));

export const createHandler = guarded(async (request) => {
  const body = await readJson(request);
  const keywords = Array.isArray(body.keywords) ? body.keywords : splitKeywords(body.keywordsText);
  const run = await createRun({ title: body.title, keywords, ranking: body.ranking }, { module: 'research', refId: null });
  return Response.json({ run });
});

export const getHandler = guarded(async (request, { runId }) => {
  const run = await getRun(runId);
  if (!run) throw httpError(404, '조사를 찾을 수 없어요.');
  return Response.json({ run });
});

export const stepHandler = guarded(async (request, { runId }) => {
  const body = await readJson(request);
  const run = await runNextBatch(runId, body.expectedCursor);
  return Response.json({ run });
});

export const rankingHandler = guarded(async (request, { runId }) => {
  const body = await readJson(request);
  return Response.json({ run: await updateRunRanking(runId, body.ranking) });
});
