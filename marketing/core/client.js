// 마케팅 모듈 ↔ 공용 코드 연결선 (화면용). 마케팅 화면은 공용 화면 코드를 이 파일로만 가져다 쓴다.
// 서버 전용 코드(lib/claude 등)는 여기에 넣지 않는다 — 폰 화면 코드에 섞이면 안 된다.

export { PasscodeGate, useApi } from '../../components/passcode';
export { formatCost, formatTime } from '../../components/format';

// 시장조사 프로그램 (research/ 모듈) 화면 부품 — 공개 입구만 쓴다.
export {
  DEFAULT_RANKING,
  RankingPicker,
  ResearchProgress,
  ResearchTable,
  RunRankingEditor,
  useResearchRunner,
} from '../../research/client.js';

// 회사 게시판 (board/ 모듈) 화면 부품 — 보고서 본문 표시
export { Markdown } from '../../board/client.js';
