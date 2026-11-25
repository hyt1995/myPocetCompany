// 직원의 매매 전략. 사장님 요청·학습 자료를 읽고 직원(AI)이 '정해진 형식의 규칙'으로 만든다.
// 매매 프로그램은 승인된 버전의 rules 만 읽고 실행한다. (형식은 WORKER_PROTOCOL.md)
//
// 프로그램이 할 수 있는 일은 lib/capabilities.js 한 곳에 정의돼 있고, 직원은 그 설명을 받고 전략을 만든다.
// 요청 중 하나라도 프로그램이 그대로 할 수 없으면 비슷한 것으로 바꾸지 않고 '실행 불가'로 저장한다 (승인 불가).
//
// mpc_members/{memberId}/strategies/v{n}
//   version, status: 'draft' | 'approved' | 'archived' | 'not_executable', name, summary, rationale, risks[],
//   feasibility: 'ok'|'partial'|'impossible', understood, unsupported[{request,reason,alternative}],
//   assumptions[{item,value,why}], suggestedSchedule, capabilitiesVersion,
//   rules{...}|null, validationErrors[], materialIds[], note, model, costUsd, at, approvedAt

import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { CAPABILITIES_VERSION, capabilityGuide, judgeStrategyOutput, validateRules } from './capabilities';
import { callClaude, MODELS } from './claude';
import { COL, requireDb } from './firebase';
import { httpError } from './http';
import { listMaterials } from './materials';
import { buildSystemPrompt, updateMember } from './members';
import { normalizeSchedule } from './schedule';

export { validateRules };

const MAX_TOKENS = 3000;
const RETRY_IF_UNDER_MS = 25_000; // 형식 오류 고치기 재시도는 첫 호출이 빨리 끝났을 때만 (Vercel 60초 제한)

const STRATEGY_GUIDE = `${capabilityGuide()}

[일하는 순서]
1. 사장님 요청을 위 '할 수 있는 일'과 한 부분씩 대조한다. 요청이 없으면 내 매매 방법과 학습 자료의 핵심을 대조한다.
2. 요청의 모든 부분을 규칙으로 '뜻 그대로' 표현할 수 있을 때만 feasibility 를 "ok" 로 하고 rules 를 쓴다.
3. 한 부분이라도 뜻 그대로 표현할 수 없으면 feasibility 를 "partial"(일부만 가능) 또는 "impossible"(핵심이 불가능)로 하고 rules 는 null 로 둔다.
   절대로 비슷한 것으로 바꿔 넣거나, 못 하는 부분을 빼고 나머지만 만들지 않는다. (예: '매일 바뀌는 거래량 상위 10개'를 고정 10개로 바꾸지 않는다)
   대신 unsupported 에 요청한 부분, 못 하는 이유, 사장님이 고르면 실행할 수 있게 되는 구체적인 대안을 쓴다.
4. 요청이 두 가지 이상으로 읽히면 마음대로 고르지 않는다. "partial" 로 두고 unsupported 에 어떤 뜻인지 묻고, 대안에 선택지를 쓴다.
5. 요청에 없는 값(봉, 확인 주기, 손절, 금액, 보유 한도 등)은 정해도 되지만, 정한 값은 하나도 빠짐없이 assumptions 에 쓴다.
   손절이 요청에 없으면 보수적인 값을 정하고 assumptions 에 쓴다.
6. 확인 시각(예: 매일 오전 9시 5분)은 rules 가 아니라 schedule 로 제안한다. 이것은 실행 가능한 것으로 본다.
   '어제 하루'처럼 날짜 기준이면 일봉(1d) + price_change_pct(lookbackBars 1)를 쓰고, 일봉이 마감된 직후인 매일 09:05 를 schedule 로 제안한다.
7. 학습 자료 중 프로그램이 못 하는 내용(뉴스 등)은 규칙에 넣지 않고 rationale 에 무엇을 뺐는지 쓴다.
   단, 사장님이 직접 요청한 내용은 빼지 말고 3번처럼 unsupported 로 알린다.
8. 현재 승인된 전략이 있으면 참고하되, 사장님 요청이 있으면 요청이 우선이다.

[출력 형식]
반드시 아래 형식의 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 표시는 쓰지 않는다.
{
  "understood": "사장님 요청을 프로그램 동작으로 한 문장 요약",
  "feasibility": "ok | partial | impossible",
  "unsupported": [{ "request": "요청 중 해당 부분", "reason": "프로그램이 못 하는 이유", "alternative": "이렇게 바꿔 요청하면 가능" }],
  "assumptions": [{ "item": "손절", "value": "3%", "why": "요청에 없어서 보수적으로 정함" }],
  "schedule": null 또는 { "type": "times", "times": ["09:05"] } 또는 { "type": "interval", "minutes": 60 },
  "name": "전략 이름 (짧게)",
  "summary": "전략 한두 문장 요약",
  "rationale": "어떤 요청·학습 자료를 근거로 했는지, 뺀 내용이 있으면 무엇인지",
  "risks": ["이 전략의 위험 요소"],
  "materialIds": ["근거로 쓴 자료 id"],
  "rules": null 또는 {
    "market": "binance_spot",
    "symbols": ["BTCUSDT"],
    "timeframe": "1h",
    "checkEveryMinutes": 60,
    "entry": {
      "logic": "all",
      "conditions": [
        { "indicator": "rsi", "params": { "period": 14 }, "op": "<", "value": 30, "description": "RSI 30 미만" },
        { "indicator": "ema", "params": { "period": 20 }, "op": "crosses_above", "value": { "indicator": "ema", "params": { "period": 50 } }, "description": "20EMA가 50EMA 상향 돌파" }
      ]
    },
    "exit": { "takeProfitPct": 5, "stopLossPct": 2, "maxHoldHours": 72, "logic": "any", "conditions": [] },
    "position": { "quoteAmountUsdt": 100, "maxOpenPositions": 1 }
  }
}
- rules 에는 위 예시에 있는 항목만 쓴다. 다른 항목을 만들면 프로그램 검사에서 막힌다.
- feasibility 가 "ok" 가 아니면 unsupported 에 최소 1개를 쓰고 rules 는 null.
- 학습 자료에 없는 수치를 지어내지 않는다.`;

export async function listStrategies(memberId) {
  const db = requireDb();
  const snap = await getDocs(collection(db, COL.members, memberId, 'strategies'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.version - a.version);
}

export async function generateStrategy(member, note = '') {
  const materials = (await listMaterials(member.id)).filter((m) => m.status === 'ready');
  if (materials.length === 0 && !note) {
    throw httpError(400, '학습 자료나 추가 요청을 먼저 넣어 주세요.');
  }

  const existing = await listStrategies(member.id);
  const latestApproved = existing.find((s) => s.status === 'approved');
  const version = (existing[0]?.version || 0) + 1;

  const materialText = materials
    .map((m) => `<자료 id="${m.id}" 종류="${m.type}" 제목="${m.title}">\n${m.summary}\n</자료>`)
    .join('\n\n');

  const userText = [
    `바이낸스 현물 매매 전략을 만들어라. 먼저 노트북 프로그램이 그대로 실행할 수 있는지 판단한다.`,
    member.method && `내 매매 방법: ${member.method}`,
    note ? `<사장님 요청>\n${note}\n</사장님 요청>` : '사장님 요청: 없음 (매매 방법과 학습 자료로 만든다)',
    latestApproved &&
      `현재 승인된 전략(v${latestApproved.version}): ${JSON.stringify(latestApproved.rules)}`,
    materialText ? `학습 자료:\n${materialText}` : '학습 자료: 없음',
  ]
    .filter(Boolean)
    .join('\n\n');

  const system = await buildSystemPrompt(member, STRATEGY_GUIDE);
  const call = (messages) =>
    callClaude({
      department: member.departmentId,
      memberId: member.id,
      purpose: 'strategy',
      model: MODELS.smart,
      system,
      messages,
      maxTokens: MAX_TOKENS,
    });

  const started = Date.now();
  const messages = [{ role: 'user', content: userText }];
  let result = await call(messages);
  let costUsd = result.costUsd || 0;
  let parsed = parseJson(result.reply);
  let judged = judgeStrategyOutput(parsed);

  // 실행 가능하다고 했는데 형식 검사에서 막히면, 뜻은 그대로 두고 형식만 한 번 고치게 한다.
  if (parsed && judged.executable && judged.validationErrors.length && Date.now() - started < RETRY_IF_UNDER_MS) {
    messages.push({ role: 'assistant', content: result.reply });
    messages.push({
      role: 'user',
      content:
        `프로그램 규칙 검사에서 아래 오류가 났다. 요청의 뜻은 바꾸지 말고 형식만 고쳐서 같은 JSON 형식으로 다시 출력하라. ` +
        `뜻을 바꾸지 않고는 고칠 수 없으면 feasibility 를 "partial" 로, rules 를 null 로 하고 이유를 unsupported 에 쓴다.\n` +
        judged.validationErrors.map((e) => `- ${e}`).join('\n'),
    });
    const retry = await call(messages);
    costUsd += retry.costUsd || 0;
    const retryParsed = parseJson(retry.reply);
    if (retryParsed) {
      result = retry;
      parsed = retryParsed;
      judged = judgeStrategyOutput(parsed);
    }
  }

  if (!parsed) {
    throw new Error('직원이 전략을 정해진 형식으로 만들지 못했어요. 다시 시도해 주세요.');
  }

  let suggestedSchedule = null;
  try {
    const sch = parsed.schedule ? normalizeSchedule(parsed.schedule) : null;
    suggestedSchedule = sch && sch.type !== 'strategy' ? sch : null;
  } catch {
    suggestedSchedule = null;
  }

  const data = {
    version,
    status: judged.executable ? 'draft' : 'not_executable',
    feasibility: judged.feasibility,
    understood: judged.understood,
    unsupported: judged.unsupported,
    assumptions: judged.assumptions,
    suggestedSchedule,
    capabilitiesVersion: CAPABILITIES_VERSION,
    name: String(parsed.name || `전략 v${version}`).slice(0, 60),
    summary: String(parsed.summary || '').slice(0, 1000),
    rationale: String(parsed.rationale || '').slice(0, 3000),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 10) : [],
    materialIds: Array.isArray(parsed.materialIds) ? parsed.materialIds.map(String).slice(0, 50) : [],
    rules: judged.rules,
    validationErrors: judged.validationErrors,
    note: String(note || '').slice(0, 2000),
    model: result.model,
    costUsd,
    at: Date.now(),
    approvedAt: null,
  };

  const db = requireDb();
  await setDoc(doc(db, COL.members, member.id, 'strategies', `v${version}`), data);
  return { id: `v${version}`, ...data };
}

// 승인: 이 버전만 매매 프로그램이 사용한다. 이전 승인 버전은 archived.
// 실행 불가로 판정됐거나, 지금 규칙 검사를 통과 못 하면 승인할 수 없다.
export async function approveStrategy(member, version) {
  const db = requireDb();
  const ref = doc(db, COL.members, member.id, 'strategies', `v${version}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw httpError(404, '없는 전략 버전이에요.');
  const s = snap.data();
  if (s.status !== 'draft') throw httpError(400, '초안 상태인 전략만 승인할 수 있어요.');
  if (s.capabilitiesVersion == null) {
    throw httpError(400, '실행 가능 여부를 확인하기 전 방식으로 만든 전략이라 승인할 수 없어요. 새 버전을 만들어 주세요.');
  }
  if (s.feasibility !== 'ok' || s.unsupported?.length) {
    throw httpError(400, '프로그램이 실행할 수 없는 부분이 있는 전략은 승인할 수 없어요.');
  }
  const errors = validateRules(s.rules);
  if (errors.length) throw httpError(400, `프로그램 규칙 검사를 통과하지 못했어요: ${errors.join(' / ')}`);

  const all = await listStrategies(member.id);
  for (const other of all) {
    if (other.status === 'approved' && other.version !== version) {
      await updateDoc(doc(db, COL.members, member.id, 'strategies', other.id), { status: 'archived' });
    }
  }
  await updateDoc(ref, { status: 'approved', approvedAt: Date.now() });
  await updateMember(member.id, { activeStrategyVersion: version });
}

export async function getActiveStrategy(member) {
  if (!member.activeStrategyVersion) return null;
  const db = requireDb();
  const snap = await getDoc(doc(db, COL.members, member.id, 'strategies', `v${member.activeStrategyVersion}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function parseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
