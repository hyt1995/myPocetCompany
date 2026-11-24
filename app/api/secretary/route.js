import { callClaude, ClaudeError, MODELS } from '../../../lib/claude';
import { buildSystemPrompt, getMember } from '../../../lib/members';
import { isValidPasscode } from '../../../lib/passcode';

// 조직도 비서 카드의 빠른 질문. 비서 직원(secretary-1)의 지침을 그대로 쓴다.
// 지침은 비서 부서 화면에서 고칠 수 있다.

export const dynamic = 'force-dynamic';

const MAX_INPUT_CHARS = 500;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: '요청 형식이 잘못됐어요.' }, { status: 400 });
  }

  if (!isValidPasscode(body?.passcode)) {
    return Response.json({ error: '비밀번호가 맞지 않아요.' }, { status: 401 });
  }

  const question = String(body?.message || '').trim().slice(0, MAX_INPUT_CHARS);
  if (!question) {
    return Response.json({ error: '질문을 입력해 주세요.' }, { status: 400 });
  }

  try {
    const member = await getMember('secretary-1');
    const system = member
      ? await buildSystemPrompt(member)
      : "너는 '내 손안의 회사'의 비서다. 한국어로 짧고 정확하게 답한다.";

    const result = await callClaude({
      department: 'secretary',
      memberId: 'secretary-1',
      purpose: 'quick-chat',
      model: MODELS[member?.model] || MODELS.cheap,
      system,
      messages: [{ role: 'user', content: question }],
      maxTokens: 300,
    });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ClaudeError ? err.status : 500;
    return Response.json({ error: err.message || '알 수 없는 오류' }, { status });
  }
}
