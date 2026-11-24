# 내 손안의 회사 — 작업 규칙

AI 부서들이 일하고, 사장님은 폰으로 확인·지시하는 1인 회사 운영 사이트.
지금은 사장님 혼자 쓴다. 수익이 나면 나중에 제품화한다.

## 스택
- Next.js (App Router, JavaScript) on Vercel. GitHub `main`에 push하면 실제 사이트에 자동 배포.
- DB: Firebase Firestore. **서버에서 Admin SDK로만** 접근 (`lib/firebase.js`).
  브라우저 접근은 `firestore.rules`로 전부 막는다.
- AI: Claude API. 호출은 반드시 `lib/claude.js`의 `callClaude()` 하나만 거친다.
  (호출마다 비용을 `ai_calls`에 기록. 나중에 비용 한도·킬 스위치도 여기에 넣는다.)

## 환경변수 (Vercel에만 저장, 코드·GitHub에 절대 넣지 않는다)
- `ANTHROPIC_API_KEY` — Claude API 키
- `APP_PASSCODE` — 돈이 나가는 API를 막는 비밀번호 (로그인 대신)
- `FIREBASE_SERVICE_ACCOUNT` — Firebase 서비스 계정 JSON 전체

## 규칙
- 로그인은 없다. 대신 AI 호출 등 비용이 드는 API는 전부 `isValidPasscode()`를 먼저 통과해야 한다.
- 모델 차등: 단순 작업은 `MODELS.cheap`(Haiku), 판단·검토는 `MODELS.smart`(Sonnet).
- 모델 단가는 `lib/pricing.js` 한 곳에서 관리한다.
- 작업은 기능별 브랜치(`feat/...`)에 push → Vercel 미리보기로 확인 → 사장님 컨펌 후 `main`에 머지.
- push 전에 무엇을 바꿨는지 짧게 요약해서 보고한다.
- 화면은 폰 우선. 부서는 이름이 적힌 사각형 카드로 보여준다.

## 부서
- 비서: 일정(구글 캘린더), API 크레딧·토큰 비용, 매출·비용·순수익 보고. 재무팀 전까지 비용 관리 겸임.
- 마케팅사업부: 인스타·쓰레드 자동 운영과 기획, 재택업무 수익모델 탐색·개발. (준비 중)
- 투자운영사업부: 주식·비트코인 운용과 현황 보고. (준비 중)

## 비서 개발 단계
1. 부서 3개 카드 + Firestore 연결 + Claude 호출 기록  ← 현재
2. API 크레딧·토큰 비용 보고 (충전액 − 누적 비용, 시작 충전액 $8)
3. 매출·비용 장부와 순수익
4. 구글 캘린더 일정 연동 (비공개 iCal 주소, 읽기 전용)
5. 비서 대화가 위 데이터를 보고 답하기
6. 매일 아침 텔레그램 브리핑
