# 마케팅사업부 모듈 (`marketing/`)

마케팅사업부의 화면·API·데이터·지침은 전부 이 폴더에 있다.
다른 부서를 고쳐도 이 폴더는 바뀌지 않고, 이 폴더를 고쳐도 다른 부서는 바뀌지 않게 나눠 두었다.

## 폴더
| 위치 | 내용 |
| --- | --- |
| `team.js` | 팀 구성(직원1 데이터 분석가·직원2 사업 기획자·팀장)과 기본 지침, 부서 공통 지침(회의 규칙). 감사는 사장님 |
| `department.js` | 조직도에 보이는 부서 정보. 공용 코드(`lib/departments.js`)가 가져가는 유일한 파일 |
| `core/server.js`, `core/client.js` | **공용 코드와의 연결선.** 공용 함수(callClaude, guarded, requireDb, useApi …)는 여기로만 가져온다 |
| `server/` | Firestore 저장·읽기. 컬렉션은 `mpc_mkt_` 로 시작 (`server/collections.js`) |
| `api/` | API 처리 함수 |
| `ui/` | 화면 |
| `test/` | 순수 로직 테스트 (`npm run test:marketing`) |

Next.js 가 정해 둔 위치에는 **연결선 한 줄짜리 파일**만 있다.
- `app/dept/marketing/page.jsx` → `marketing/ui/DepartmentPage.jsx`
- `app/api/marketing/team/route.js` → `marketing/api/team.js`
- `app/api/marketing/members/[memberId]/route.js` → `marketing/api/member.js`

## 경계 규칙 (빌드 전에 자동 검사)
`scripts/check-marketing-boundary.mjs` 가 `npm run build` 전에 돈다. 어기면 빌드가 실패해서 배포되지 않는다.
1. `marketing/` 안의 파일은 `marketing/` 안의 파일만 가져온다. 공용 코드는 `marketing/core/` 로만 가져온다.
2. 공용 코드(lib/, components/, app/ 의 다른 곳)는 마케팅 코드를 가져오지 않는다. 예외: `lib/departments.js` → `marketing/department.js`.
3. 연결선 파일은 `marketing/` 안의 파일만 가져온다.

공용 코드의 사용법이 바뀌면 `marketing/core/` 의 두 파일만 고친다.
`callClaude` 는 일부러 공유한다 — 비용 기록과 킬 스위치는 회사 전체에 똑같이 적용돼야 한다.

## 데이터 (Firestore)
- `mpc_mkt_members/{memberId}` — 직원 (title, name, role, model, systemPrompt, order). 처음 열 때 `team.js` 로 만든다
- `mpc_mkt_settings/department` — 부서 공통 지침 (없으면 기본 회의 규칙을 보여 준다)

## 다음 단계
시장조사 프로그램(네이버 API) → 회의실(안건 → 데이터 분석가 → 사업 기획자 → 팀장 → 사장님 승인) → 사업 장부·회고
