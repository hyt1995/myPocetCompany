// 화면에서 받은 값을 저장 가능한 형태로 정리한다. (DB·외부 의존 없음 → marketing/test 에서 테스트)

export const MAX_PROMPT_CHARS = 8000;
export const MODEL_GRADES = ['cheap', 'smart'];

// 직원 정보 수정: 이름·역할·모델 등급·지침만 바꿀 수 있다. 모르는 항목은 버린다.
export function cleanMemberPatch(fields = {}) {
  const patch = {};
  if (typeof fields.name === 'string') patch.name = fields.name.trim().slice(0, 40) || '이름 없음';
  if (typeof fields.role === 'string') patch.role = fields.role.trim().slice(0, 120);
  if (MODEL_GRADES.includes(fields.model)) patch.model = fields.model;
  if (typeof fields.systemPrompt === 'string') patch.systemPrompt = fields.systemPrompt.slice(0, MAX_PROMPT_CHARS);
  return patch;
}

export function cleanGuideline(text) {
  return String(text ?? '').slice(0, MAX_PROMPT_CHARS);
}

// DB 문서 → 화면용 직원 정보. seed 는 marketing/team.js 의 기본값.
export function toMember(id, data = {}, seed = null) {
  return {
    id,
    teamId: data.teamId || seed?.teamId || 'newbiz',
    order: typeof data.order === 'number' ? data.order : seed?.order ?? 99,
    title: data.title || seed?.title || '',
    name: data.name || seed?.name || '이름 없음',
    role: data.role ?? seed?.role ?? '',
    model: MODEL_GRADES.includes(data.model) ? data.model : 'cheap',
    systemPrompt: data.systemPrompt ?? '',
    isDefaultPrompt: Boolean(seed) && (data.systemPrompt ?? '') === seed.systemPrompt,
    updatedAt: data.updatedAt || null,
  };
}
