import { callClaude, ClaudeError, MODELS } from '../../../../../lib/claude';
import { addMessage, addResult, getMember, getMessages } from '../../../../../lib/members';
import { rejectIfBadPasscode } from '../../../../../lib/passcode';

// 팀원에게 업무 지시 → 팀원의 지침(시스템 프롬프트)과 최근 대화를 바탕으로 답 → 결과물로 저장

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_INPUT_CHARS = 4000;
const HISTORY_MESSAGES = 10; // 이전 대화는 최근 10개만 넘긴다 (토큰 절약)
const MAX_OUTPUT_TOKENS = 2000;

export async function POST(request, { params }) {
  const denied = rejectIfBadPasscode(request);
  if (denied) return denied;

  const { id } = await params;
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }

  const task = String(body?.message || '').trim().slice(0, MAX_INPUT_CHARS);
  if (!task) return Response.json({ error: '지시할 내용을 입력해 주세요.' }, { status: 400 });

  try {
    const member = await getMember(id);
    if (!member) return Response.json({ error: '팀원을 찾을 수 없어요.' }, { status: 404 });

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
      system: member.systemPrompt,
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
  } catch (err) {
    const status = err instanceof ClaudeError ? err.status : 500;
    return Response.json({ error: err.message || '알 수 없는 오류' }, { status });
  }
}
