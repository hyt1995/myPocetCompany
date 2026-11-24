// API 라우트 공통 처리: 비밀번호 확인, 오류 응답, 요청 본문 읽기.

import { ClaudeError } from './claude';
import { getMember } from './members';
import { rejectIfBadPasscode } from './passcode';

export function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

// 비밀번호(APP_PASSCODE)를 통과한 요청만 handler(request, params)로 넘긴다.
export function guarded(handler) {
  return async (request, ctx) => {
    const denied = rejectIfBadPasscode(request);
    if (denied) return denied;
    try {
      const params = ctx?.params ? await ctx.params : {};
      return await handler(request, params);
    } catch (err) {
      const status = err instanceof ClaudeError ? err.status : err.status || 500;
      if (status >= 500) console.error('[api]', err);
      return Response.json({ error: err.message || '알 수 없는 오류' }, { status });
    }
  };
}

export async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    throw httpError(400, '요청 형식이 잘못됐어요.');
  }
}

export async function requireMember(id) {
  const member = await getMember(id);
  if (!member) throw httpError(404, '직원을 찾을 수 없어요.');
  return member;
}
