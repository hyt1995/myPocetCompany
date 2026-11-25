// 모든 Claude 호출은 이 함수 하나만 거친다. (나중의 F6 재무 게이트웨이 자리)
// - 호출할 때마다 모델, 토큰, 비용을 Firestore 'mpc_ai_calls'에 기록한다.
// - 다음 단계에서 비용 한도 확인(킬 스위치)을 호출 전에 여기에 넣는다.

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { COL, getDb } from './firebase';
import { costUsd } from './pricing';

export const MODELS = {
  cheap: 'claude-haiku-5-5', // 가성비: 단순 작업
  smart: 'claude-sonnet-5-5', // 고성능: 판단·검토
};

export class ClaudeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function callClaude({
  department,
  memberId,
  purpose,
  model = MODELS.cheap,
  system,
  messages,
  maxTokens = 300,
  tools, // 선택: 직원이 쓸 수 있는 도구 (예: 주문 확인 카드 만들기). 도구는 '제안'만 하고 실행하지 않는다.
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeError('ANTHROPIC_API_KEY가 등록돼 있지 않아요.', 500);

  const body = { model, max_tokens: maxTokens, messages };
  if (system && system.trim()) body.system = system;
  if (Array.isArray(tools) && tools.length) body.tools = tools;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || `Claude API 오류 (HTTP ${res.status})`;
    throw new ClaudeError(message, 502);
  }

  const reply = (data?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  const usage = data?.usage || {};
  const usedModel = data?.model || model;
  const cost = costUsd(usedModel, usage);

  const logged = await logCall({ department, memberId, purpose, model: usedModel, usage, cost });

  const toolUses = (data?.content || [])
    .filter((block) => block.type === 'tool_use')
    .map((block) => ({ name: block.name, input: block.input || {} }));

  return { reply, toolUses, model: usedModel, usage, costUsd: cost, logged };
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
