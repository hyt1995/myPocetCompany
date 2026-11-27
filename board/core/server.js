// 회사 게시판 모듈 ↔ 공용 코드 연결선 (서버용). 게시판 모듈은 공용 코드를 이 파일로만 가져다 쓴다.
// 공용 코드의 사용법이 바뀌면 이 파일 하나만 고친다. (scripts/check-module-boundaries.mjs 가 검사)

export { guarded, httpError } from '../../lib/http';
export { requireDb } from '../../lib/firebase';
