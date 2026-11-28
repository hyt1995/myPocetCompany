// 마케팅사업부 시장조사 안건 (회의 ①·②단계)
//
// ① 사장님이 주제를 주면 데이터 분석가가 '조사 계획'(후보 키워드)을 만든다.   → AI: Haiku 1번
// ② 사장님이 후보를 고치고 [조사 시작] → 시장조사 프로그램(research/)이 숫자를 잰다. → AI 없음
// ③ 데이터 분석가가 프로그램이 준 표만 보고 보고서를 쓴다.                       → AI: 직원 모델 등급 1번
//
// mpc_mkt_research/{agendaId}: topic, candidates[], status, runId, report

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import {
  callClaude,
  createRun,
  describeRanking,
  getRun,
  httpError,
  isValidKeyword,
  MAX_KEYWORDS,
  MODELS,
  normalizeKeyword,
  RESEARCH_CAPABILITIES,
  requireDb,
  splitKeywords,
  tableForAi,
  validateRanking,
} from '../core/server';
import { MKT_COL } from './collections';
import { buildMarketingSystemPrompt, getMarketingMember } from './team';

const ANALYST_ID = 'mkt-analyst';
export const CANDIDATE_COUNT = 50; // 데이터 분석가가 처음 만드는 후보 수 (사장님이 고칠 수 있다)
const MAX_TOPIC = 200;

// status: draft(후보 작성됨) → researching(프로그램 조사 중) → reported(보고서 완료)
function toAgenda(id, d) {
  return {
    id,
    topic: d.topic,
    candidates: d.candidates || [],
    dropped: d.dropped || [],
    ranking: d.ranking || null, // 데이터 분석가가 고른 줄 세우기 기준 (조사 시작 전). 시작 후에는 조사(run)의 기준이 기준이다
    rankingWhy: d.rankingWhy || '',
    status: d.status,
    runId: d.runId || null,
    report: d.report || null,
    at: d.at,
    updatedAt: d.updatedAt,
  };
}

async function requireAnalyst() {
  const analyst = await getMarketingMember(ANALYST_ID);
  if (!analyst) throw httpError(400, '데이터 분석가가 아직 없어요. 마케팅사업부 화면을 한 번 열어 주세요.');
  return analyst;
}

export async function listAgendas(count = 10) {
  const snap = await getDocs(query(collection(requireDb(), MKT_COL.research), orderBy('at', 'desc'), limitTo(count)));
  return snap.docs.map((d) => toAgenda(d.id, d.data()));
}

export async function getAgenda(agendaId) {
  const snap = await getDoc(doc(requireDb(), MKT_COL.research, agendaId));
  if (!snap.exists()) throw httpError(404, '안건을 찾을 수 없어요.');
  return toAgenda(snap.id, snap.data());
}

// AI 답에서 키워드 목록·줄 세우기 기준 꺼내기: {"keywords":[...], "ranking":{...}} 를 먼저 찾고, 안 되면 줄 단위로.
// 기준이 프로그램이 모르는 것이면 쓰지 않고 기본 기준으로 둔다 (바꿔 넣지 않는다).
export function parseCandidates(reply) {
  let list = [];
  let ranking = null;
  let rankingWhy = '';
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(reply.slice(start, end + 1));
      if (Array.isArray(parsed.keywords)) list = parsed.keywords.map(String);
      if (parsed.ranking) {
        const checked = validateRanking(parsed.ranking);
        ranking = checked.ok ? checked.ranking : null;
        rankingWhy = checked.ok
          ? String(parsed.rankingWhy || '').slice(0, 300)
          : `분석가가 고른 기준을 프로그램이 할 수 없어 기본 기준으로 둠 (${checked.errors[0]})`;
      }
    } catch {
      // 아래에서 줄 단위로
    }
  }
  if (list.length === 0) list = splitKeywords(reply.replace(/^[\s\-*\d.)]+/gm, ''));

  const seen = new Set();
  const keywords = [];
  const dropped = [];
  for (const raw of list) {
    const k = normalizeKeyword(raw);
    if (!k) continue;
    if (!isValidKeyword(k)) {
      dropped.push(k.slice(0, 40));
      continue;
    }
    const key = k.replace(/ /g, '').toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(k);
  }
  return { keywords: keywords.slice(0, MAX_KEYWORDS), dropped, ranking, rankingWhy };
}

// ① 안건 만들기 + 데이터 분석가가 후보 키워드 작성
export async function createAgenda(topicInput) {
  const topic = normalizeKeyword(topicInput).slice(0, MAX_TOPIC);
  if (!topic) throw httpError(400, '조사할 주제를 적어 주세요.');
  const analyst = await requireAnalyst();

  const system = await buildMarketingSystemPrompt(analyst, RESEARCH_CAPABILITIES);
  const { reply } = await callClaude({
    department: 'marketing',
    memberId: analyst.id,
    purpose: 'research-plan',
    model: MODELS.cheap, // 후보 만들기는 단순 작업 → 가성비 모델
    system,
    maxTokens: 1500,
    messages: [
      {
        role: 'user',
        content: `[안건] ${topic}

이 안건을 시장조사 프로그램으로 재기 위한 네이버 검색 키워드 후보를 ${CANDIDATE_COUNT}개 만들어라.
- 실제 사람들이 네이버에 검색할 법한 2~4단어 한국어 표현
- 한글·영문·숫자·띄어쓰기만, 30자 이내
- 업종 × 반복 업무·불편을 조합하고, '대행', '외주', '프로그램', '자동화', '비용'처럼 돈을 낼 의사가 보이는 표현을 섞는다
- 같은 수요를 다른 말로 부르는 표현도 몇 개 넣는다 (묶어서 볼 수 있게)
그리고 이 안건의 목적에 맞는 '줄 세우기 기준'을 위 [줄 세우기 기준]에서만 고른다.
(예: 빈 시장 찾기 → competition, 시장 크기 → monthly, 뜨는 것 → yoy, 돈 낼 의사 → adClicks, 잘 모르겠으면 score)
출력은 JSON 한 줄만: {"keywords":["...", "..."], "ranking":{"sortBy":"score","top":40}, "rankingWhy":"한 줄 이유"}`,
      },
    ],
  });

  const { keywords, dropped, ranking, rankingWhy } = parseCandidates(reply);
  if (keywords.length === 0) throw httpError(502, '후보 키워드를 만들지 못했어요. 다시 시도해 주세요.');

  const now = Date.now();
  const ref = await addDoc(collection(requireDb(), MKT_COL.research), {
    topic,
    candidates: keywords,
    dropped,
    ranking: ranking || validateRanking(null).ranking,
    rankingWhy,
    status: 'draft',
    runId: null,
    report: null,
    at: now,
    updatedAt: now,
    createdAt: serverTimestamp(),
  });
  return getAgenda(ref.id);
}

// ② 사장님이 고친 후보·기준으로 [조사 시작] → 시장조사 프로그램에 조사를 맡긴다
export async function startAgendaResearch(agendaId, keywordsText, rankingInput) {
  const agenda = await getAgenda(agendaId);
  if (agenda.runId) throw httpError(400, '이미 조사를 시작한 안건이에요.');
  const keywords = typeof keywordsText === 'string' ? splitKeywords(keywordsText) : agenda.candidates;

  const ranking = rankingInput ?? agenda.ranking ?? undefined;
  const run = await createRun({ title: agenda.topic, keywords, ranking }, { module: 'marketing', refId: agendaId });
  await updateDoc(doc(requireDb(), MKT_COL.research, agendaId), {
    candidates: keywords.map(normalizeKeyword),
    ranking: run.ranking,
    runId: run.id,
    status: 'researching',
    updatedAt: Date.now(),
  });
  return getAgenda(agendaId);
}

// ③ 데이터 분석가 보고서: 프로그램이 준 표만 근거로
export async function writeAgendaReport(agendaId) {
  const agenda = await getAgenda(agendaId);
  if (!agenda.runId) throw httpError(400, '아직 조사를 시작하지 않았어요.');
  const run = await getRun(agenda.runId);
  if (!run) throw httpError(404, '조사 결과를 찾을 수 없어요.');
  if (run.status !== 'done') throw httpError(400, `조사가 아직 끝나지 않았어요 (${run.done}/${run.total}).`);

  const analyst = await requireAnalyst();
  const system = await buildMarketingSystemPrompt(analyst, RESEARCH_CAPABILITIES);
  const { reply, model, costUsd } = await callClaude({
    department: 'marketing',
    memberId: analyst.id,
    purpose: 'research-report',
    model: MODELS[analyst.model] || MODELS.smart,
    system,
    maxTokens: 1800,
    messages: [
      {
        role: 'user',
        content: `[안건] ${agenda.topic}
[조사 기간] 추세 ${run.range?.startDate} ~ ${run.range?.endDate}, 키워드 ${run.total}개
[줄 세우기 기준] ${describeRanking(run.ranking)} — 표는 이 기준으로 정렬·걸러졌다. 기준이 보여 주는 관점에서 해석한다.
[조사 결과 표 — 이 표의 숫자만 근거로 쓴다]
${tableForAi(run.ranked, run.ranking)}
${run.errors?.length ? `\n[조회 실패] ${run.errors.slice(-5).join(' / ')}` : ''}

데이터 분석가로서 보고서를 써라.
1) 의미 있는 신호 5개 — 근거 숫자와 신뢰도(상·중·하)
2) 이슈성 급등과 구조적 성장의 구분
3) 이 데이터로는 알 수 없는 것
4) 사업 기획자에게 넘길 키워드 10개 — 각각 한 줄 이유
표에 없는 숫자는 쓰지 말고 '확인 못 함'이라고 쓴다. 1,500자 안으로.`,
      },
    ],
  });

  await updateDoc(doc(requireDb(), MKT_COL.research, agendaId), {
    report: { text: reply, model, costUsd, at: Date.now(), by: analyst.name, rankingLabel: describeRanking(run.ranking) },
    status: 'reported',
    updatedAt: Date.now(),
  });
  return getAgenda(agendaId);
}
