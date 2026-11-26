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
- 매매 프로그램: `worker/` (Node.js, ccxt + Firebase 웹 SDK). **사장님 노트북(Ubuntu 20.04)**에서 pm2로 돌아간다.
  사이트와는 Firestore로만 주고받는다. 규격은 `WORKER_PROTOCOL.md` — 규격을 바꾸면 문서, 사이트 `lib/`, `worker/src/`를 같이 고친다.
  기존 파이썬 봇(선물·레버리지·물타기)은 쓰지 않고 새로 만들었다. RSI·이동평균 계산은 기존 GetRSI/GetMA와 같은 값 (테스트로 확인).
  순수 로직(indicators, strategy, paper, signature)은 외부 의존 없이 `cd worker && npm test` 로 테스트한다.
  바이낸스 실전 주문은 기본 테스트넷(`BINANCE_TESTNET=true`), 실전 허용 기본 꺼짐 — 노트북 `.env`에서만 바꿀 수 있다.
  **폴링하지 않는다:** 명령·직원 설정은 Firestore 리스너로 받고, 자동 실행은 직원별 알람(타이머). 연결 신호만 5분마다.
  DB 무료 한도(읽기 5만/쓰기 2만 per day)를 focus-app 과 같이 쓰므로, 주기적으로 읽는 코드를 넣지 않는다.
- 전략 = 규칙표(JSON). 노트북 프로그램이 할 수 있는 일은 `lib/capabilities.js` = `worker/src/capabilities.js` (같은 파일, 같이 고친다) 한 곳에 정의.
  전략 AI는 그 설명을 받고 요청이 실행 가능한지 먼저 판단한다. 못 하는 부분은 바꿔 넣지 않고 '실행 불가'(승인 불가). 규칙 검사는 엄격(모르는 항목이 있으면 실패)하고 사이트 승인 때·노트북 실행 때 둘 다 한다.
  프로그램 동작을 바꾸거나 기능을 추가하면 capabilities.js 의 표·동작 설명·못 하는 일 목록을 같이 고친다.
- 스케줄: 직원의 `schedule` (전략 기본 / N분마다 / 매일 정해진 시각, 한국 시간). `lib/schedule.js` = `worker/src/schedule.js` (같은 파일, 같이 고친다).
- 채팅 확인 카드: 매매 직원은 Claude 도구(`lib/proposals.js`)로 주문·설정·지금 실행 '제안'만 만든다.
  사장님이 카드 [실행]을 눌러야 명령이 생긴다. 실전 카드는 확인창 + 서명. 30분 지난 카드는 실행 불가.

## 환경변수 (Vercel에만 저장, 코드·GitHub에 절대 넣지 않는다)
- `ANTHROPIC_API_KEY` — Claude API 키
- `APP_PASSCODE` — 로그인 대신 쓰는 비밀번호. 비용이 들거나 데이터를 바꾸는 API는 전부 확인
- `FIREBASE_API_KEY`, `FIREBASE_APPID` — Firebase 웹 설정 (프로젝트 ID 기본값 `focus-app-76679`, `FIREBASE_PROJECT_ID`로 변경 가능)
- `COMMAND_SIGNING_SECRET` — 실전 주문 명령 서명키. 노트북 `.env`와 같은 값. 없으면 실제 매수/매도 버튼이 꺼짐
- 시장조사 프로그램(`research/`): `NAVER_SEARCHAD_CUSTOMER_ID`, `NAVER_SEARCHAD_ACCESS_LICENSE`, `NAVER_SEARCHAD_SECRET_KEY` (네이버 검색광고 → 도구 → API 사용 관리),
  `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` (NAVER API HUB, 네이버 클라우드 콘솔. 2026-07-31 이후 새 키는 HUB 에서만 발급).
  예전 개발자센터 키를 쓰면 `NAVER_API_LEGACY=true`. 키 상태는 `/research` 화면에서 확인 (값은 안 보여 줌)

## 규칙
- 로그인은 없다. API 라우트는 `lib/http.js`의 `guarded()`로 감싸서 비밀번호를 먼저 확인한다.
- 모델 차등: 단순 작업·자료 정리는 `MODELS.cheap`(Haiku), 전략 만들기 등 판단은 `MODELS.smart`(Sonnet).
- 모델 단가는 `lib/pricing.js` 한 곳에서 관리한다.
- **실제 돈은 사장님이 [실제 매수/매도] 버튼이나 실전 확인 카드로 보낸 서명된 명령으로만 움직인다.**
  자동 실행 모드는 정지/모의만 있다. AI 직원은 주문을 내지 않는다 (확인 카드를 만들 뿐).
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
- 마케팅사업부: `mpc_mkt_members` (직원), `mpc_mkt_settings/department` (부서 공통 지침), `mpc_mkt_research` (시장조사 안건) — `marketing/` 모듈만 쓴다
- 시장조사 프로그램: `mpc_rsh_runs` (조사 1번 = 문서 1개: 키워드·결과 rows·진행 cursor) — `research/` 모듈만 쓴다

## 부서
- 비서 (`/dept/secretary`): 일정(구글 캘린더), API 크레딧·토큰 비용, 매출·비용·순수익 보고. 지침 편집 가능.
- 마케팅사업부 (`/dept/marketing`): **별도 모듈 `marketing/`** (아래 '분리된 모듈' 참고).
  팀: 직원1 데이터 분석가 · 직원2 사업 기획자 · 팀장(부장), 감사는 사장님. 시장조사 → 회의 → 사업 계획서 → 사장님 승인.
  시장조사(주제 → 후보 키워드 → 프로그램 조사 → 분석가 보고서)는 됨. 회의실은 준비 중.
- 시장조사 프로그램 (`/research`): 키 상태·연결 테스트·직접 조사·조사 기록. 마케팅사업부 화면에서 링크.
- 투자운영사업부 (`/dept/investment`): **매매 방법 1개 = 직원 1명 = 매매 프로그램 1개.** 바이낸스 현물.
  직원 화면 탭: 학습(사진·URL·글) → 전략(버전·승인) → 프로그램(모드, 지금 실행, 모의/실제 매매) → 현황(수익률·보유·내역) → 대화·지침.
  부서 화면: 직원 목록(모의 수익률 순), [+ 직원 추가], 부서 공통 지침, 노트북 연결 상태.

## 분리된 모듈 (marketing/, research/)
- **다른 기능을 고칠 때 모듈 폴더는 건드리지 않는다. 모듈을 고칠 때는 그 폴더 안에서만 고친다.**
- `marketing/` = 마케팅사업부 (화면·API·데이터·지침). 구조는 `marketing/README.md`.
- `research/` = 시장조사 프로그램 (네이버 숫자를 재는 고정 프로그램, AI 없음). 구조는 `research/README.md`.
  할 수 있는 일·못 하는 일은 `research/capabilities.js` 한 곳. 동작을 바꾸면 같이 고친다 (투자부 capabilities 와 같은 원칙).
- 공용 코드는 각 모듈의 `core/server.js`·`core/client.js` 로만 가져온다. 공용 코드 사용법이 바뀌면 이 파일들만 고친다.
- 모듈끼리는 공개 입구만: 마케팅 → `research/index.js`·`research/client.js` (마케팅의 `core/` 를 거쳐서).
- 공용 코드가 모듈을 가져오는 곳은 `lib/departments.js` → `marketing/department.js` 하나뿐 (조직도 등록).
  부서 정보의 `ownModule: true` → 공용 직원 코드(`lib/members.js`, `/api/departments`, `/api/members`, `app/dept/[id]`)는 그 부서를 다루지 않는다.
- Next.js 위치(`app/dept/marketing/`, `app/api/marketing/`, `app/research/`, `app/api/research/`)에는 연결선 한 줄짜리 파일만 둔다.
- 컬렉션 접두사: 마케팅 `mpc_mkt_`, 시장조사 `mpc_rsh_`. 공용 `COL` 에 넣지 않는다.
- 경계 검사 `scripts/check-module-boundaries.mjs` 가 `npm run build` 전(prebuild)에 돈다. 어기면 배포되지 않는다.
  새 모듈을 만들면 이 스크립트의 `MODULES` 에 추가한다.
- 테스트: `npm run test:marketing`, `npm run test:research`

## 다음 할 일
- 노트북에 worker 설치·실행 (worker/README.md) → 모의매매 확인 → 테스트넷 → 소액 실전
- 비서: API 크레딧·토큰 비용 보고 (충전액 $8 − 누적 비용) → 매출·비용 장부 → 구글 캘린더 → 아침 텔레그램 브리핑
