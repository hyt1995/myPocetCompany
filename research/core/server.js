// 시장조사 모듈 ↔ 공용 코드 연결선 (서버용). 시장조사 모듈은 공용 코드를 이 파일로만 가져다 쓴다.
// 공용 코드의 사용법이 바뀌면 이 파일 하나만 고친다. (scripts/check-module-boundaries.mjs 가 검사)
//
// 시장조사 프로그램은 AI 를 부르지 않는다. 숫자만 잰다. (해석은 각 부서의 AI 직원이 한다)

export { guarded, httpError, readJson } from '../../lib/http';
export { requireDb } from '../../lib/firebase';
