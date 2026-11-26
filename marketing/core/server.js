// 마케팅 모듈 ↔ 공용 코드 연결선 (서버용). 마케팅 모듈은 공용 코드를 이 파일로만 가져다 쓴다.
//
// 공용 코드(lib/)의 함수 이름이나 사용법이 바뀌면 이 파일 하나만 고치면 된다.
// 마케팅 모듈의 다른 파일에서 '../../lib/...' 처럼 공용 코드를 직접 가져오면
// 빌드 전에 scripts/check-module-boundaries.mjs 가 막는다.
//
// callClaude 를 공유하는 이유: 모든 AI 호출의 비용 기록과 (나중의) 킬 스위치는 회사 전체에 똑같이 적용돼야 한다.

export { callClaude, ClaudeError, MODELS } from '../../lib/claude';
export { guarded, httpError, readJson } from '../../lib/http';
export { requireDb } from '../../lib/firebase';

// 시장조사 프로그램 (research/ 모듈) — 공개 입구만 쓴다. 숫자를 재는 건 프로그램, 해석은 마케팅 직원.
export {
  createRun,
  getRun,
  isValidKeyword,
  MAX_KEYWORDS,
  normalizeKeyword,
  RESEARCH_CAPABILITIES,
  splitKeywords,
  tableForAi,
  validatePlan,
} from '../../research/index.js';
