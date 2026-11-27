// 모든 Claude 호출은 이 함수 하나만 거친다. (나중의 F6 재무 게이트웨이 자리)
// - 호출할 때마다 모델, 토큰, 비용을 Firestore 'mpc_ai_calls'에 기록한다.
// - 킬 스위치: 호출 전에 오늘(한국 날짜) 쓴 비용을 확인하고, 하루 한도를 넘으면 호출하지 않는다.
//   한도는 Vercel 환경변수 AI_DAILY_LIMIT_USD (없으면 $2). 0 으로 두면 모든 AI 호출이 멈춘다.
//   비용 합계는 'mpc_ai_budget/{YYYY-MM-DD}' 한 문서에 더해 간다. (호출마다 읽기 1번·쓰기 1번)
// - 웹 검색 도구(web_search)를 쓰면 검색 1번당 $0.01 이 더해지고, 출처(URL)를 같이 돌려준다.

import { addDoc, collection, doc, getDoc, increment, serverTimestamp, setDoc } from 'firebase/firestore';
import { COL, getDb } from './firebase';
import { costUsd } from './pricing';

export const MODELS = {
  cheap: 'claude-haiku-5-5', // 가성비: 단순 작업
  smart: 'claude-sonnet-5-5', // 고성능: 판단·검토
};

const DEFAULT_DAILY_LIMIT_USD = 2;
const MAX_CONTINUES = 3; // 웹 검색이 길어져 API가 잠깐 멈추면(pause_turn) 이어서 부르는 최대 횟수

export class ClaudeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// 웹 검색 도구 정의. maxUses = 이 호출에서 검색할 수 있는 최대 횟수 (비용 상한).
export function webSearchTool({ maxUses = 5, country = 'KR', timezone = 'Asia/Seoul', allowedDomains } = {}) {
  const tool = {
    type: 'web_search_20250305',
    name: 'web_search',
    max_uses: maxUses,
    user_location: { type: 'approximate', country, timezone },
  };
  if (Array.isArray(allowedDomains) && allowedDomains.length) tool.allowed_domains = allowedDomains;
  return tool;
}

export function dailyLimitUsd() {
  const raw = process.env.AI_DAILY_LIMIT_USD;
  if (raw === undefined || raw === '') return DEFAULT_DAILY_LIMIT_USD;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT_USD;
}

function kstDate(ms = Date.now()) {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);
}

// 오늘(한국 날짜) 쓴 AI 비용. 화면에 보여 줄 때도 쓴다.
export async function getTodaySpend() {
  const db = getDb();
  const limit = dailyLimitUsd();
  const date = kstDate();
  if (!db) return { date, spentUsd: 0, calls: 0, limitUsd: limit };
  const snap = await getDoc(doc(db, COL.aiBudget, date));
  const d = snap.exists() ? snap.data() : {};
  return { date, spentUsd: d.spentUsd || 0, calls: d.calls || 0, limitUsd: limit };
}

async function assertBudget() {
  const limit = dailyLimitUsd();
  if (limit === 0) throw new ClaudeError('AI 호출이 꺼져 있어요 (AI_DAILY_LIMIT_USD = 0).', 429);
  let spent = 0;
  try {
    spent = (await getTodaySpend()).spentUsd;
  } catch (err) {
    // 장부를 못 읽어도 호출은 막지 않는다 (한도는 안전장치일 뿐, DB 장애로 모든 일이 멈추면 안 된다)
    console.error('[ai_budget] 읽기 실패:', err.message);
  }
  if (spent >= limit) {
    throw new ClaudeError(
      `오늘 AI 비용 한도($${limit})를 다 썼어요. (오늘 $${spent.toFixed(3)}) 내일 다시 하거나 Vercel 의 AI_DAILY_LIMIT_USD 를 올려 주세요.`,
      429,
    );
  }
}

async function addSpend(cost) {
  const db = getDb();
  if (!db || !cost) return;
  try {
    await setDoc(
      doc(db, COL.aiBudget, kstDate()),
      { spentUsd: increment(cost), calls: increment(1), updatedAt: Date.now() },
      { merge: true },
    );
  } catch (err) {
    console.error('[ai_budget] 기록 실패:', err.message);
  }
}

function addUsage(total, u = {}) {
  for (const key of ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens']) {
    total[key] = (total[key] || 0) + (u[key] || 0);
  }
  const searches = u.server_tool_use?.web_search_requests || 0;
  if (searches) {
    total.server_tool_use = { web_search_requests: (total.server_tool_use?.web_search_requests || 0) + searches };
  }
  return total;
}

// 웹 검색 결과 블록에서 출처 목록(중복 없이, 나온 순서대로)을 꺼낸다.
function searchSources(content) {
  const seen = new Map();
  for (const block of content) {
    if (block.type !== 'web_search_tool_result' || !Array.isArray(block.content)) continue;
    for (const r of block.content) {
      if (r?.type !== 'web_search_result' || !r.url || seen.has(r.url)) continue;
      seen.set(r.url, { url: r.url, title: r.title || r.url, pageAge: r.page_age || null });
    }
  }
  return [...seen.values()];
}

function friendlyError(message, status) {
  if (/web.?search/i.test(message) && /(enable|not allowed|disabled|permission)/i.test(message)) {
    return `웹 검색이 꺼져 있어요. Claude Console → Settings → Privacy(또는 Organization) 에서 Web search 를 켜 주세요. (${message})`;
  }
  if (status === 402 || /credit balance/i.test(message)) return `Claude API 크레딧이 부족해요. Console 에서 충전해 주세요. (${message})`;
  return message;
}

export async function callClaude({
  department,
  memberId,
  purpose,
  model = MODELS.cheap,
  system,
  messages,
  maxTokens = 300,
  tools, // 선택: 직원이 쓸 수 있는 도구 (예: 주문 확인 카드 만들기, 웹 검색). 직원 도구는 '제안'만 하고 실행하지 않는다.
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeError('ANTHROPIC_API_KEY가 등록돼 있지 않아요.', 500);

  await assertBudget();

  const base = { model, max_tokens: maxTokens };
  if (system && system.trim()) base.system = system;
  if (Array.isArray(tools) && tools.length) base.tools = tools;

  let convo = messages;
  const content = [];
  const usage = {};
  let usedModel = model;
  let stopReason = null;

  for (let i = 0; i <= MAX_CONTINUES; i += 1) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ ...base, messages: convo }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      // 앞에서 이미 쓴 비용은 기록하고 실패를 알린다.
      if (content.length) await finish();
      const message = data?.error?.message || `Claude API 오류 (HTTP ${res.status})`;
      throw new ClaudeError(friendlyError(message, res.status), 502);
    }

    usedModel = data?.model || usedModel;
    addUsage(usage, data?.usage);
    const blocks = data?.content || [];
    content.push(...blocks);
    stopReason = data?.stop_reason || null;

    // 서버 도구(웹 검색)가 길어지면 API가 중간에 멈춘다 → 받은 내용을 그대로 돌려보내 이어서 하게 한다.
    if (stopReason !== 'pause_turn') break;
    convo = [...convo, { role: 'assistant', content: blocks }];
  }

  const cost = costUsd(usedModel, usage);
  const logged = await finish();

  async function finish() {
    const c = costUsd(usedModel, usage);
    await addSpend(c);
    return logCall({ department, memberId, purpose, model: usedModel, usage, cost: c });
  }

  const textBlocks = content.filter((block) => block.type === 'text');
  const reply = textBlocks.map((block) => block.text).join('');

  const toolUses = content
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ name: block.name, input: block.input || {} }));

  return {
    reply,
    toolUses,
    content, // 원본 블록 (웹 검색 결과·인용 포함)
    sources: searchSources(content), // 웹 검색으로 본 페이지들
    searches: usage.server_tool_use?.web_search_requests || 0,
    stopReason,
    model: usedModel,
    usage,
    costUsd: cost,
    logged,
  };
}

async function logCall({ department, memberId, purpose, model, usage, cost }) {
  const db = getDb();
  if (!db) return false;
  try {
    await addDoc(collection(db, COL.aiCalls), {
      department: department || 'unknown',
      memberId: memberId || null,
      purpose: purpose || null,
      model,
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      webSearches: usage.server_tool_use?.web_search_requests || 0,
      costUsd: cost,
      at: Date.now(),
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[ai_calls] 기록 실패:', err.message);
    return false;
  }
}
