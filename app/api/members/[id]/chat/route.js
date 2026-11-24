import { callClaude, MODELS } from '../../../../../lib/claude';
import { guarded, httpError, readJson, requireMember } from '../../../../../lib/http';
import { addMessage, addResult, buildSystemPrompt, getMessages } from '../../../../../lib/members';
import { getActiveStrategy } from '../../../../../lib/strategies';

// 직원에게 업무 지시 → (부서 공통 지침 + 직원 지침 + 승인된 전략 요약 + 최근 대화)로 답 → 결과물로 저장

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_INPUT_CHARS = 4000;
const HISTORY_MESSAGES = 10; // 이전 대화는 최근 10개만 넘긴다 (토큰 절약)
const MAX_OUTPUT_TOKENS = 2000;

export const POST = guarded(async (request, { id }) => {
  const body = await readJson(request);
  const task = String(body.message || '').trim().slice(0, MAX_INPUT_CHARS);
  if (!task) throw httpError(400, '지시할 내용을 입력해 주세요.');

  const member = await requireMember(id);
  const strategy = await getActiveStrategy(member);
  const system = await buildSystemPrompt(
    member,
    strategy && `[현재 승인된 내 전략 v${strategy.version}] ${strategy.name}: ${strategy.summary}`,
  );

  const history = await getMessages(id, HISTORY_MESSAGES);
  const messages = history.map((m) => ({ role: m.role, content: m.content }));
  // Claude API는 user 메시지로 시작해야 한다.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  messages.push({ role: 'user', content: task });

  const result = await callClaude({
    department: member.departmentId,
    memberId: id,
    purpose: 'task',
    model: MODELS[member.model] || MODELS.cheap,
    system,
    messages,
    maxTokens: MAX_OUTPUT_TOKENS,
  });

  const now = Date.now();
  await addMessage(id, { role: 'user', content: task, at: now });
  await addMessage(id, { role: 'assistant', content: result.reply, at: now + 1 });
  const resultId = await addResult(id, {
    task,
    output: result.reply,
    model: result.model,
    costUsd: result.costUsd,
  });

  return Response.json({ ...result, resultId });
});
