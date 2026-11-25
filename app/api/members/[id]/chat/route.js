import { callClaude, MODELS } from '../../../../../lib/claude';
import { findDepartment } from '../../../../../lib/departments';
import { guarded, httpError, readJson, requireMember } from '../../../../../lib/http';
import { addMessage, addResult, buildSystemPrompt, getMessages } from '../../../../../lib/members';
import { createProposals, TRADING_CHAT_GUIDE, TRADING_TOOLS } from '../../../../../lib/proposals';
import { getActiveStrategy } from '../../../../../lib/strategies';

// 직원에게 업무 지시 → (부서 공통 지침 + 직원 지침 + 승인된 전략 요약 + 최근 대화)로 답 → 결과물로 저장.
// 매매 부서 직원은 "사/팔아/스케줄 바꿔" 지시를 받으면 확인 카드(제안)를 만든다. 실행은 사장님이 카드에서.

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
  const trading = Boolean(findDepartment(member.departmentId)?.trading);
  const strategy = await getActiveStrategy(member);
  const system = await buildSystemPrompt(
    member,
    [
      strategy && `[현재 승인된 내 전략 v${strategy.version}] ${strategy.name}: ${strategy.summary}`,
      trading && TRADING_CHAT_GUIDE,
    ]
      .filter(Boolean)
      .join('\n\n'),
  );

  const history = await getMessages(id, HISTORY_MESSAGES);
  const messages = history.map((m) => ({ role: m.role, content: m.content || '(확인 카드)' }));
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
    tools: trading ? TRADING_TOOLS : undefined,
  });

  const proposals = result.toolUses.length ? await createProposals(member, result.toolUses) : [];
  const reply =
    result.reply.trim() ||
    (proposals.length ? '확인 카드를 만들었어요. 내용을 보고 [실행]을 눌러 주세요.' : '(답변 없음)');

  const now = Date.now();
  await addMessage(id, { role: 'user', content: task, at: now });
  await addMessage(id, { role: 'assistant', content: reply, at: now + 1, proposalIds: proposals.map((p) => p.id) });
  const resultId = await addResult(id, {
    task,
    output: [reply, ...proposals.map((p) => `[카드] ${p.summary}`)].join('\n'),
    model: result.model,
    costUsd: result.costUsd,
  });

  return Response.json({ ...result, reply, proposals, resultId });
});
