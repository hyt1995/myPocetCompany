# 내 손안의 회사 — 작업 규칙

AI 부서들이 일하고, 사장님은 폰으로 확인·지시하는 1인 회사 운영 사이트.
지금은 사장님 혼자 쓴다. 수익이 나면 나중에 제품화한다.

## 스택
- Next.js (App Router, JavaScript) on Vercel. GitHub `main`에 push하면 실제 사이트에 자동 배포.
- DB: Firebase Firestore (기존 focus-app 프로젝트 공유). Firebase 웹 SDK를 **서버 API에서만** 사용 (`lib/firebase.js`).
  사장님 혼자 쓰는 단계라 규칙은 열어 둠(`firestore.rules`). 다른 사람이 쓰기 전에 반드시 닫는다.
  이 사이트의 컬렉션은 전부 `mpc_` 접두사 (focus-app 데이터와 안 섞이게). 목록은 `lib/firebase.js`의 `COL`.
- AI: Claude API. 호출은 반드시 `lib/claude.js`의 `callClaude()` 하나만 거친다.
  (호출마다 비용을 `mpc_ai_calls`에 기록. 나중에 비용 한도·킬 스위치도 여기에 넣는다.)
- 매매 프로그램: **사장님 노트북**에서 돌아간다 (사장님이 만든 기존 프로그램을 연결 예정).
  사이트와는 Firestore로만 주고받는다. 규격은 `WORKER_PROTOCOL.md` — 이 규격을 바꾸면 문서도 같이 고친다.

## 환경변수 (Vercel에만 저장, 코드·GitHub에 절대 넣지 않는다)
- `ANTHROPIC_API_KEY` — Claude API 키
- `APP_PASSCODE` — 로그인 대신 쓰는 비밀번호. 비용이 들거나 데이터를 바꾸는 API는 전부 확인
- `FIREBASE_API_KEY`, `FIREBASE_APPID` — Firebase 웹 설정 (프로젝트 ID 기본값 `focus-app-76679`, `FIREBASE_PROJECT_ID`로 변경 가능)
- `COMMAND_SIGNING_SECRET` — 실전 주문 명령 서명키. 노트북 `.env`와 같은 값. 없으면 실제 매수/매도 버튼이 꺼짐

## 규칙
- 로그인은 없다. API 라우트는 `lib/http.js`의 `guarded()`로 감싸서 비밀번호를 먼저 확인한다.
- 모델 차등: 단순 작업·자료 정리는 `MODELS.cheap`(Haiku), 전략 만들기 등 판단은 `MODELS.smart`(Sonnet).
- 모델 단가는 `lib/pricing.js` 한 곳에서 관리한다.
- **실제 돈은 사장님이 [실제 매수/매도] 버튼으로 보낸 서명된 명령으로만 움직인다.**
  자동 실행 모드는 정지/모의만 있다. AI 직원은 주문을 내지 않는다.
- 작업은 기능별 브랜치(`feat/...`)에 push → Vercel 미리보기로 확인 → 사장님 컨펌 후 `main`에 머지.
- push 전에 무엇을 바꿨는지 짧게 요약해서 보고한다.
- 화면은 폰 우선. 부서는 이름이 적힌 사각형 카드로 보여준다.

## 데이터 구조 (Firestore)
- `mpc_departments/{deptId}` — 부서 공통 지침
- `mpc_members/{id}` — 직원 (이름, 역할, 매매 방법, 모델, 지침, 모드, 자동실행, 모의 자금, 승인 전략 버전)
  - `messages`, `results` — 업무 채팅, 결과물(승인/수정 지시)
  - `materials` — 학습 자료 (사진·URL·글을 넣을 때 한 번만 AI가 정리한 summary 저장, 원본 사진은 저장 안 함)
  - `strategies/v{n}` — 전략 버전 (draft → approved, 이전 approved 는 archived). `rules` 형식은 WORKER_PROTOCOL.md
- `mpc_commands` — 사이트 → 매매 프로그램 명령, `mpc_trades` / `mpc_positions` / `mpc_worker` — 매매 프로그램이 씀
- 부서의 기본 직원은 `lib/departments.js`의 `defaultMembers`로 처음 열 때 생성된다.

## 부서
- 비서 (`/dept/secretary`): 일정(구글 캘린더), API 크레딧·토큰 비용, 매출·비용·순수익 보고. 지침 편집 가능.
- 마케팅사업부: 인스타·쓰레드 자동 운영과 기획, 재택업무 수익모델 탐색·개발. (준비 중)
- 투자운영사업부 (`/dept/investment`): **매매 방법 1개 = 직원 1명 = 매매 프로그램 1개.** 바이낸스 현물.
  직원 화면 탭: 학습(사진·URL·글) → 전략(버전·승인) → 프로그램(모드, 지금 실행, 모의/실제 매매) → 현황(수익률·보유·내역) → 대화·지침.
  부서 화면: 직원 목록(모의 수익률 순), [+ 직원 추가], 부서 공통 지침, 노트북 연결 상태.

## 다음 할 일
- 노트북 매매 프로그램 연결 (사장님이 기존 프로그램을 WORKER_PROTOCOL.md 에 맞게 수정)
- 비서: API 크레딧·토큰 비용 보고 (충전액 $8 − 누적 비용) → 매출·비용 장부 → 구글 캘린더 → 아침 텔레그램 브리핑
