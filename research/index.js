// 시장조사 프로그램의 공개 입구 (서버용). 다른 모듈은 이 파일만 가져다 쓴다.
// (예: marketing/core/server.js → research/index.js) 내부 파일을 직접 가져오면 경계 검사가 막는다.

export { MAX_KEYWORDS, RESEARCH_CAPABILITIES } from './capabilities.js';
export { isValidKeyword, normalizeKeyword, splitKeywords, validatePlan } from './plan.js';
export { tableForAi } from './metrics.js';
export { keyStatus } from './sources/keys.js';
export { createRun, getRun, listRuns, runNextBatch } from './server/runs.js';
