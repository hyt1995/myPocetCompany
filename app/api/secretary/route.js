import { isValidPasscode } from '../../../lib/passcode';

// '내 비서'에게 질문 하나를 보내고 답을 받는다. (연결 테스트용 최소 버전)
// 나중에 F6 재무 게이트웨이가 생기면 Claude 호출은 그쪽을 거치게 바꾼다.

export const dynamic = 'force-dynamic';

const MODEL = 'claude-haiku-5-5'; // 가성비 모델
const MAX_TOKENS = 300; // 한 번 호출 비용 상한을 작게 유지
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY가 등록돼 있지 않아요.' }, { status: 500 });
  }

  const question = String(body?.message || '').trim().slice(0, MAX_INPUT_CHARS);
  if (!question) {
    return Response.json({ error: '질문을 입력해 주세요.' }, { status: 400 });
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system:
        "너는 '내 손안의 회사'의 비서 AI다. 사장님(사용자)의 질문에 한국어로 짧고 정확하게 답한다. 모르는 것은 모른다고 말한다.",
      messages: [{ role: 'user', content: question }],
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error?.message || `Claude API 오류 (HTTP ${res.status})`;
    return Response.json({ error: message }, { status: 502 });
  }

  const reply = (data?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  return Response.json({
    reply,
    model: data?.model,
    usage: data?.usage,
  });
}
