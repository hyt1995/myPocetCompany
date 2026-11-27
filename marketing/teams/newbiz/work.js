// 신사업팀 주간 업무 실행 (서버).
//
// mpc_mkt_work/newbiz_{주}  (예: newbiz_2026-W48)
//   steps.briefing / explore / directive / deep / meeting / report — 단계별 결과
//
// 한 번의 요청 = 한 단계의 한 부분 (자료 모으기 / 글쓰기 / 회의 발언 1번).
// 화면이 순서대로 부르고, 서버는 주기적으로 아무것도 하지 않는다. (월요일 브리핑만 Vercel Cron 이 깨운다)
// 비용: 자료 모으기 = Haiku + 웹 검색(최대 8~10번, 번당 $0.01), 글쓰기·회의 = 직원 모델 등급(기본 Sonnet).

import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { callClaude, getTodaySpend, httpError, MODELS, publishPost, requireDb, webSearchTool } from '../../core/server';
import { MKT_COL } from '../../server/collections';
import { buildMarketingSystemPrompt, listTeam } from '../../server/team';
import * as P from './prompts';
import { checkRefs, lastTag, markInvalidRefs, notesWithRefs, numberSources, sectionFirstLine, sourceList } from './sources';
import {
  blockedReason,
  DIRECTIVE_DECISIONS,
  findStep,
  MAX_ROUNDS,
  nextSpeaker,
  OWNER_DECISIONS,
  VERDICTS,
} from './steps';
import { isWeekKey, kstToday, weekKeyOf, weekRange } from './week';

const TEAM_ID = 'newbiz';
const MEMBER_OF = { planner: 'mkt-planner', analyst: 'mkt-analyst', lead: 'mkt-lead' };
const SEARCH_LIMITS = { briefing: 8, explore: 10, deep: 10 }; // 웹 검색 최대 횟수 (비용 상한)
const MAX_NOTE = 1000;

const workRef = (weekKey) => doc(requireDb(), MKT_COL.work, `${TEAM_ID}_${weekKey}`);

function requireWeekKey(weekKey) {
  if (!isWeekKey(weekKey)) throw httpError(400, '주 표기가 잘못됐어요. (예: 2026-W48)');
  return weekKey;
}

export async function getWeek(weekKey) {
  requireWeekKey(weekKey);
  const snap = await getDoc(workRef(weekKey));
  const d = snap.exists() ? snap.data() : {};
  return { team: TEAM_ID, weekKey, range: weekRange(weekKey), steps: d.steps || {}, updatedAt: d.updatedAt || null };
}

export async function getWeekWithSpend(weekKey) {
  const [week, spend] = await Promise.all([getWeek(weekKey), getTodaySpend().catch(() => null)]);
  return { week, spend, currentWeek: weekKeyOf() };
}

async function saveStep(weekKey, stepId, value, exists) {
  const ref = workRef(weekKey);
  if (!exists) {
    await setDoc(ref, { team: TEAM_ID, weekKey, steps: {}, createdAt: serverTimestamp(), updatedAt: Date.now() }, { merge: true });
  }
  // 'steps.{단계}' 필드를 통째로 바꾼다 (예전 결과가 섞이지 않게).
  await updateDoc(ref, { [`steps.${stepId}`]: value, updatedAt: Date.now() });
}

async function teamMembers() {
  const members = await listTeam(); // 직원이 DB에 없으면 이때 만든다
  return Object.fromEntries(members.map((m) => [m.id, m]));
}

const modelOf = (member) => MODELS[member.model] || MODELS.smart;
const allSources = (steps, ids) => ids.flatMap((id) => steps[id]?.sources || []);
const sum = (...xs) => xs.reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);

// ── 자료 모으기 ─────────────────────────────────────────────

async function collect(week, step, members, body) {
  const range = week.range;
  const today = kstToday();
  const directive = week.steps.directive;
  let prompt;
  if (step.id === 'briefing') prompt = P.briefingCollect({ today, range });
  else if (step.id === 'explore') prompt = P.exploreCollect({ today, range });
  else prompt = P.deepCollect({ today, directive: directive?.text, ownerNote: directive?.ownerNote });

  const r = await callClaude({
    department: 'marketing',
    memberId: step.who,
    purpose: `newbiz:${step.id}:collect`,
    model: MODELS.cheap,
    system: P.COLLECT_SYSTEM,
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 3500,
    tools: [webSearchTool({ maxUses: SEARCH_LIMITS[step.id] })],
  });

  const sources = numberSources(r.sources, step.prefix, r.content);
  if (!sources.length) {
    throw httpError(502, '웹 검색 결과가 하나도 없어요. Claude Console 에서 웹 검색이 켜져 있는지 확인해 주세요.');
  }
  return {
    status: 'collected',
    notes: notesWithRefs(r.content, sources) || r.reply,
    sources,
    searches: r.searches,
    by: members[step.who]?.name || '',
    collectedAt: Date.now(),
    collectCostUsd: r.costUsd,
    ownerNote: body.ownerNote ?? week.steps[step.id]?.ownerNote ?? '',
  };
}

// ── 글쓰기 ──────────────────────────────────────────────────

function writeInput(week, step, body) {
  const s = week.steps;
  const mine = s[step.id] || {};
  const range = week.range;
  const block = (title, text) => ({ title, body: text ? P.clip(text) : '' });
  const srcBlock = (ids) => block('출처 목록', sourceList(allSources(s, ids)));

  switch (step.id) {
    case 'briefing':
      return {
        ...P.briefingWrite({ range }),
        parts: [block('모은 자료', mine.notes), srcBlock(['briefing'])],
        allowed: ['briefing'],
      };
    case 'explore':
      return {
        ...P.exploreWrite({ range }),
        parts: [block('모은 자료', mine.notes), srcBlock(['explore'])],
        allowed: ['explore'],
      };
    case 'directive': {
      const ownerNote = cleanNote(body.ownerNote ?? mine.ownerNote);
      return {
        ...P.directiveWrite(),
        ownerNote,
        parts: [
          block('데이터 분석가: 이번 주 시장 신호', s.explore?.text),
          block('사장님(감사) 지시', ownerNote || '없음'),
          srcBlock(['explore']),
        ],
        allowed: ['explore'],
      };
    }
    case 'deep':
      return {
        ...P.deepWrite(),
        parts: [
          block('팀장 지시', s.directive?.text),
          block('새로 모은 자료', mine.notes),
          block('이번 주 시장 신호 (앞 단계)', P.clip(s.explore?.text, 3000)),
          srcBlock(['deep', 'explore']),
        ],
        allowed: ['deep', 'explore'],
      };
    case 'report': {
      const m = s.meeting;
      const last = (who) => [...(m?.turns || [])].reverse().find((t) => t.who === who)?.text;
      return {
        ...P.reportWrite({ weekKey: week.weekKey, range }),
        parts: [
          block('월요일 경제 브리핑', P.clip(s.briefing?.text, 3000)),
          block('이번 주 시장 신호', s.explore?.text),
          block('팀장 지시', s.directive?.text),
          block('사장님(감사) 지시', s.directive?.ownerNote),
          block('심층 조사', s.deep?.status === 'done' ? s.deep.text : '이번 주는 심층 조사 없음'),
          block(
            '회의 결과',
            m?.status === 'done'
              ? `최종 판정: ${m.verdict || '판정 없음'} (${m.turns.length}번 발언)\n\n[기획자 마지막 제안]\n${P.clip(last('planner'), 2000)}\n\n[분석가 마지막 검증]\n${P.clip(last('analyst'), 1500)}\n\n[팀장 마지막 심사]\n${P.clip(last('lead'), 2000)}`
              : '이번 주는 회의를 하지 않았음',
          ),
          srcBlock(['briefing', 'explore', 'deep']),
        ],
        allowed: ['briefing', 'explore', 'deep'],
      };
    }
    default:
      throw httpError(400, '글쓰기가 없는 단계예요.');
  }
}

function cleanNote(text) {
  return String(text ?? '').trim().slice(0, MAX_NOTE);
}

async function write(week, step, members, body) {
  const mine = week.steps[step.id] || {};
  if (step.phases.includes('collect') && !mine.notes) throw httpError(400, '먼저 자료를 모아 주세요.');

  const member = members[step.who];
  const input = writeInput(week, step, body);
  const system = await buildMarketingSystemPrompt(member, input.extra);
  const r = await callClaude({
    department: 'marketing',
    memberId: member.id,
    purpose: `newbiz:${step.id}:write`,
    model: modelOf(member),
    system,
    messages: [{ role: 'user', content: P.materials(input.parts) || '(자료 없음)' }],
    maxTokens: 4000,
  });

  const allowed = allSources(week.steps, input.allowed);
  const { used, invalid } = checkRefs(r.reply, allowed);
  // 다시 쓰면 예전 글에 붙어 있던 사장님 결정·게시판 번호는 버린다.
  const { ownerDecision: _oldDecision, postId: _oldPost, ...kept } = mine;
  const result = {
    ...kept,
    status: 'done',
    text: markInvalidRefs(r.reply, invalid),
    usedRefs: used,
    invalidRefs: invalid,
    by: member.name,
    model: r.model,
    writtenAt: Date.now(),
    writeCostUsd: r.costUsd,
  };
  if (step.id === 'directive') {
    result.ownerNote = input.ownerNote;
    result.decision = lastTag(r.reply, '결정', DIRECTIVE_DECISIONS) || '심층조사';
  }
  return result;
}

// ── 회의 ────────────────────────────────────────────────────

async function meetingTurn(week, members, body) {
  const s = week.steps;
  const meeting = body.restart ? { turns: [] } : s.meeting || { turns: [] };
  const speaker = nextSpeaker(meeting);
  if (!speaker) throw httpError(400, '회의가 이미 끝났어요. 다시 하려면 [회의 다시]를 눌러 주세요.');

  const member = members[MEMBER_OF[speaker.who]];
  const turns = meeting.turns || [];
  const lastOf = (who) => [...turns].reverse().find((t) => t.who === who && t.round === speaker.round)?.text;
  const prevLead = [...turns].reverse().find((t) => t.who === 'lead')?.text;
  const data = [
    { title: '이번 주 시장 신호', body: P.clip(s.explore?.text, 4500) },
    { title: '팀장 지시', body: P.clip(s.directive?.text, 1500) },
    { title: '사장님(감사) 지시', body: s.directive?.ownerNote || '' },
    { title: '심층 조사', body: s.deep?.status === 'done' ? P.clip(s.deep.text, 5000) : '' },
  ];

  let prompt;
  let parts;
  if (speaker.who === 'planner') {
    prompt = P.plannerTurn({ round: speaker.round, lastLead: speaker.round > 1 ? prevLead : '' });
    parts = data;
  } else if (speaker.who === 'analyst') {
    prompt = P.analystTurn({ round: speaker.round });
    parts = [{ title: '사업 기획자 제안', body: lastOf('planner') }, ...data];
  } else {
    prompt = P.leadTurn({ round: speaker.round, maxRounds: MAX_ROUNDS });
    parts = [
      { title: '사업 기획자 제안', body: lastOf('planner') },
      { title: '데이터 분석가 검증', body: lastOf('analyst') },
      ...data.slice(0, 1).map((d) => ({ ...d, body: P.clip(d.body, 2500) })),
      ...data.slice(2),
    ];
  }

  const system = await buildMarketingSystemPrompt(member, prompt.extra);
  const r = await callClaude({
    department: 'marketing',
    memberId: member.id,
    purpose: `newbiz:meeting:${speaker.who}`,
    model: modelOf(member),
    system,
    messages: [{ role: 'user', content: P.materials([...parts, { title: '출처 목록', body: sourceList(allSources(s, ['explore', 'deep'])) }]) }],
    maxTokens: speaker.who === 'analyst' ? 1500 : 2000,
  });

  const { invalid } = checkRefs(r.reply, allSources(s, ['explore', 'deep']));
  const turn = {
    round: speaker.round,
    who: speaker.who,
    name: member.name,
    text: markInvalidRefs(r.reply, invalid),
    invalidRefs: invalid,
    costUsd: r.costUsd,
    at: Date.now(),
  };
  if (speaker.who === 'lead') turn.verdict = lastTag(r.reply, '판정', VERDICTS);

  const next = { status: 'running', turns: [...turns, turn], startedAt: meeting.startedAt || Date.now() };
  if (!nextSpeaker(next)) {
    next.status = 'done';
    next.verdict = turn.verdict || '판정 없음';
    next.endedAt = Date.now();
  }
  return next;
}

// ── 게시판에 올리기 ─────────────────────────────────────────

function postId(weekKey, kind) {
  return `marketing-newbiz-${weekKey.toLowerCase()}-${kind}`;
}

async function publish(week, stepId, result) {
  const kind = stepId === 'briefing' ? 'briefing' : 'report';
  const used = new Set(result.usedRefs || []);
  const ids = stepId === 'briefing' ? ['briefing'] : ['briefing', 'explore', 'deep'];
  const sources = allSources(week.steps, ids).filter((src) => stepId === 'briefing' || used.has(src.ref));
  const decision = result.ownerDecision;
  const body = decision
    ? `${result.text}\n\n## 사장님(감사) 결정\n- ${OWNER_DECISIONS[decision.decision]}${decision.memo ? `: ${decision.memo}` : ''}`
    : result.text;
  const range = week.range;
  return publishPost({
    id: postId(week.weekKey, kind),
    kind,
    title:
      kind === 'briefing'
        ? `주간 경제 브리핑 (${range.prevMonday.slice(5)} ~ ${range.prevSunday.slice(5)})`
        : `신사업팀 주간 보고서 ${week.weekKey}`,
    summary: sectionFirstLine(result.text, kind === 'briefing' ? '한 줄 요약' : '한 줄 결론'),
    body,
    sources,
    author: { department: '마케팅사업부', team: '신사업팀', name: result.by },
    weekKey: week.weekKey,
    link: `/dept/marketing/team/newbiz?week=${week.weekKey}`,
  });
}

// ── 입구 ────────────────────────────────────────────────────

// action: collect | write | turn | decide
export async function runStep(weekKey, stepId, action, body = {}) {
  requireWeekKey(weekKey);
  const step = findStep(stepId);
  if (!step) throw httpError(404, '모르는 단계예요.');

  const snap = await getDoc(workRef(weekKey));
  const week = { weekKey, range: weekRange(weekKey), steps: snap.exists() ? snap.data().steps || {} : {} };

  if (action === 'decide') {
    // 사장님(감사) 결정: AI 없음
    if (stepId !== 'report' || week.steps.report?.status !== 'done') throw httpError(400, '주간 보고서가 나온 뒤에 결정할 수 있어요.');
    if (!OWNER_DECISIONS[body.decision]) throw httpError(400, '결정은 승인·보류·반려 중 하나예요.');
    const result = { ...week.steps.report, ownerDecision: { decision: body.decision, memo: cleanNote(body.memo), at: Date.now() } };
    week.steps.report = result;
    const post = await publish(week, 'report', result);
    await saveStep(weekKey, 'report', { ...result, postId: post.id }, true);
    return getWeekWithSpend(weekKey);
  }

  const phase = action === 'turn' ? 'turn' : action;
  if (!step.phases.includes(phase)) throw httpError(400, `'${step.label}'에는 '${action}'이(가) 없어요.`);
  const blocked = blockedReason(stepId, week);
  if (blocked) throw httpError(400, blocked);

  const members = await teamMembers();
  let result;
  if (phase === 'collect') result = await collect(week, step, members, body);
  else if (phase === 'turn') result = await meetingTurn(week, members, body);
  else result = await write(week, step, members, body);

  if (phase === 'write' && (stepId === 'briefing' || stepId === 'report')) {
    week.steps[stepId] = result;
    const post = await publish(week, stepId, result);
    result.postId = post.id;
  }
  if (phase === 'write') result.costUsd = sum(result.collectCostUsd, result.writeCostUsd);

  await saveStep(weekKey, stepId, result, snap.exists());
  if (stepId === 'directive' && phase === 'write') {
    // 팀장이 넘어가기로 하면 심층 조사는 '건너뜀'. 다시 심층조사로 바뀌면 건너뜀 표시를 지운다.
    const deep = week.steps.deep;
    if (result.decision === '넘어감' && deep?.status !== 'done') await saveStep(weekKey, 'deep', { status: 'skipped' }, true);
    if (result.decision === '심층조사' && deep?.status === 'skipped') await saveStep(weekKey, 'deep', {}, true);
  }
  return getWeekWithSpend(weekKey);
}

// 월요일 아침 자동 브리핑 (Vercel Cron). 이미 썼으면 건너뛴다.
export async function runMondayBriefing() {
  const weekKey = weekKeyOf();
  const { week } = await getWeekWithSpend(weekKey);
  if (week.steps.briefing?.status === 'done') return { weekKey, skipped: true };
  if (week.steps.briefing?.status !== 'collected') await runStep(weekKey, 'briefing', 'collect');
  await runStep(weekKey, 'briefing', 'write');
  return { weekKey, skipped: false };
}
