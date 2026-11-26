# 시장조사 프로그램 모듈 (`research/`)

키워드 목록을 받아 네이버 숫자를 재고 기회 점수를 계산하는 **고정 프로그램**이다. AI 를 부르지 않는다.
해석은 이 프로그램을 쓰는 부서의 AI 직원이 한다 (지금은 마케팅사업부 데이터 분석가).
다른 기능을 고쳐도 이 폴더는 바뀌지 않게 분리해 두었다.

## 하는 일 / 못 하는 일
`capabilities.js` 한 곳에 정의한다. AI 직원은 이 설명(`RESEARCH_CAPABILITIES`)을 받고, 프로그램이 주지 않은 숫자는 '확인 못 함'으로 써야 한다.
프로그램 동작을 바꾸면 `capabilities.js` 의 숫자·설명·못 하는 일 목록을 같이 고친다.

| 출처 | 주는 것 | 키 |
| --- | --- | --- |
| 네이버 검색광고 키워드도구 | 최근 30일 검색수(PC·모바일), 광고 경쟁 정도, 광고 클릭수 | `NAVER_SEARCHAD_*` 3개 |
| NAVER API HUB 데이터랩 검색어 트렌드 | 최근 15개월 월별 추세 (상대값) | `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET` |
| NAVER API HUB 블로그 검색 | 블로그 글 수 (공급 대리 지표) | 위와 같음 |

계산: 월 검색수, 1년 성장률(최근 3개월 ÷ 1년 전 같은 3개월), 3개월 성장률, 경쟁비(블로그 글 ÷ 월 검색수),
기회 점수 = 월 검색수 ÷ (블로그 글 + 1) × 성장률(0.25~4) × 100, 월 검색수 100 미만은 0점.

## 폴더
| 위치 | 내용 |
| --- | --- |
| `index.js` | **서버용 공개 입구.** 다른 모듈은 이것만 가져온다 (`createRun`, `getRun`, `validatePlan`, `tableForAi` …) |
| `client.js` | **화면용 공개 입구** (`ResearchTable`, `ResearchProgress`, `useResearchRunner`) |
| `capabilities.js` | 할 수 있는 일·못 하는 일·한도 |
| `plan.js` | 조사 계획 검사 (엄격: 모르는 항목·특수문자·200개 초과면 실행 안 함) |
| `metrics.js`, `dates.js`, `sign.js` | 순수 계산 (테스트 `npm run test:research`) |
| `sources/` | 네이버 API 연결. `keys.js` 는 키를 환경변수에서만 읽고, 값은 밖으로 내보내지 않는다 |
| `server/` | Firestore 저장·묶음 실행 (`mpc_rsh_runs`) |
| `core/` | 공용 코드와의 연결선 (guarded, requireDb, useApi …) |
| `api/`, `ui/` | API 처리, 화면 (`/research`: 키 상태·연결 테스트·직접 조사·조사 기록) |

Next.js 위치의 연결선: `app/research/page.jsx`, `app/api/research/...`

## 실행 방식 (폴링 없음)
조사 1번 = `mpc_rsh_runs/{runId}` 문서 1개 (키워드, 결과 `rows`, 진행 `cursor`).
서버 시간 제한 때문에 키워드를 10개씩 나눠 처리한다. 화면이 [조사 시작] 후 `/step` 을 끝날 때까지 차례로 부른다.
화면을 닫으면 멈추고, 다시 열어 [이어서 조사]를 누르면 이어진다. 묶음 1개당 Firestore 읽기 1번·쓰기 1번.

## 경계 규칙
`scripts/check-module-boundaries.mjs` (빌드 전 자동). 이 모듈의 파일은 이 모듈 안만 가져오고, 공용 코드는 `core/` 로만.
다른 모듈은 `index.js`·`client.js` 만 쓸 수 있다. 공용 코드는 이 모듈을 가져오지 않는다.
