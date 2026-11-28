// /api/marketing/research                   GET 안건 목록, POST 새 안건 (데이터 분석가가 후보 키워드 작성)
// /api/marketing/research/{agendaId}        GET 안건, PUT 조사 시작 (사장님이 고친 후보)
// /api/marketing/research/{agendaId}/report POST 데이터 분석가 보고서

import { guarded, readJson } from '../core/server';
import { createAgenda, getAgenda, listAgendas, startAgendaResearch, writeAgendaReport } from '../server/research';

export const listHandler = guarded(async () => Response.json({ agendas: await listAgendas(10) }));

export const createHandler = guarded(async (request) => {
  const body = await readJson(request);
  return Response.json({ agenda: await createAgenda(body.topic) });
});

export const getHandler = guarded(async (request, { agendaId }) => Response.json({ agenda: await getAgenda(agendaId) }));

export const startHandler = guarded(async (request, { agendaId }) => {
  const body = await readJson(request);
  return Response.json({ agenda: await startAgendaResearch(agendaId, body.keywordsText, body.ranking) });
});

export const reportHandler = guarded(async (request, { agendaId }) =>
  Response.json({ agenda: await writeAgendaReport(agendaId) }),
);
