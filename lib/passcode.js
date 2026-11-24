import { timingSafeEqual } from 'node:crypto';

// APP_PASSCODE와 같은지 확인한다. 돈이 나가거나 데이터를 바꾸는 API는 전부 이걸 먼저 통과해야 한다.
export function isValidPasscode(input) {
  const expected = process.env.APP_PASSCODE;
  if (!expected || typeof input !== 'string') return false;

  const a = Buffer.from(input);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// 헤더 'x-passcode'(encodeURIComponent 된 값)로 확인한다. 틀리면 401 응답을, 맞으면 null을 돌려준다.
export function rejectIfBadPasscode(request) {
  let value = request.headers.get('x-passcode') || '';
  try {
    value = decodeURIComponent(value);
  } catch {
    // 디코딩이 안 되면 원래 값으로 비교
  }
  if (isValidPasscode(value)) return null;
  return Response.json({ error: '비밀번호가 맞지 않아요.' }, { status: 401 });
}
