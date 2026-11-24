import { callClaude, ClaudeError, MODELS } from '../../../lib/claude';
import { isValidPasscode } from '../../../lib/passcode';

// '내 비서'에게 질문 하나를 보내고 답을 받는다.
// 다음 단계에서 일정·비용·손익 데이터를 함께 넘겨 실제 숫자로 답하게 한다.

export const dynamic = 'force-dynamic';

const MAX_INPUT_CHARS = 500;

const SYSTEM_PROMPT =
  "너는 '내 손안의 회사'의 비서 AI다. 사장님(사용자)의 질문에 한국어로 짧고 정확하게 답한다. 모르는 것은 모른다고 말한다.";

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
    const result = await callClaude({
      department: 'secretary',
      purpose: 'chat',
      model: MODELS.cheap,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: question }],
      maxTokens: 300,
    });
    return Response.json(result);
  } catch (err) {
    const status = err instanceof ClaudeError ? err.status : 500;
    return Response.json({ error: err.message || '알 수 없는 오류' }, { status });
  }
}
