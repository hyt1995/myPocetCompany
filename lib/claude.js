// 모든 Claude 호출은 이 함수 하나만 거친다. (나중의 F6 재무 게이트웨이 자리)
// - 호출할 때마다 모델, 토큰, 비용을 Firestore 'ai_calls'에 기록한다.
// - 다음 단계에서 비용 한도 확인(킬 스위치)을 호출 전에 여기에 넣는다.

import { FieldValue } from 'firebase-admin/firestore';
import { getDb } from './firebase';
import { costUsd } from './pricing';

export const MODELS = {
  cheap: 'claude-haiku-5-5', // 단순 작업
  smart: 'claude-sonnet-5-5', // 판단·검토
};

export class ClaudeError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function callClaude({
  department,
  purpose,
  model = MODELS.cheap,
  system,
  messages,
  maxTokens = 300,
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ClaudeError('ANTHROPIC_API_KEY가 등록돼 있지 않아요.', 500);

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
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

  const logged = await logCall({ department, purpose, model: usedModel, usage, cost });

  return { reply, model: usedModel, usage, costUsd: cost, logged };
}

async function logCall({ department, purpose, model, usage, cost }) {
  const db = getDb();
  if (!db) return false;
  try {
    await db.collection('ai_calls').add({
      department: department || 'unknown',
      purpose: purpose || null,
      model,
      inputTokens: usage.input_tokens || 0,
      outputTokens: usage.output_tokens || 0,
      cacheWriteTokens: usage.cache_creation_input_tokens || 0,
      cacheReadTokens: usage.cache_read_input_tokens || 0,
      costUsd: cost,
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error('[ai_calls] 기록 실패:', err.message);
    return false;
  }
}
