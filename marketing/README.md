# 마케팅사업부 모듈 (`marketing/`)

마케팅사업부의 화면·API·데이터·지침은 전부 이 폴더에 있다.
다른 부서를 고쳐도 이 폴더는 바뀌지 않고, 이 폴더를 고쳐도 다른 부서는 바뀌지 않게 나눠 두었다.

## 조직
마케팅사업부 안에 **팀**이 계속 생긴다. 팀 목록은 `org.js` 한 곳.
- **신사업팀** (`newbiz`, 운영 중): 팀원1 데이터 분석가 · 팀원2 사업 기획자 · 팀장. 감사는 사장님.
- **운영팀** (`ops`, 준비 중): 신사업팀이 찾고 사장님이 승인한 사업을 운영한다.

새 팀을 만들 때: `org.js` 에 팀 추가 → `team.js` 의 `TEAM` 에 직원(`teamId`) 추가 → 업무 코드는 `teams/<팀 id>/` → `ui/TeamPage.jsx` 의 `TEAM_WORK` 에 연결.

## 폴더
| 위치 | 내용 |
| --- | --- |
| `org.js` | 팀 목록 (이름·상태·역할·맡을 일) |
| `team.js` | 직원(팀별)과 기본 지침, 부서 공통 지침. 예전 기본 지침 지문(고친 적 없으면 새 지침으로 자동 교체) |
| `department.js` | 조직도에 보이는 부서 정보. 공용 코드(`lib/departments.js`)가 가져가는 유일한 파일 |
| `core/server.js`, `core/client.js` | **공용 코드·다른 모듈과의 연결선.** callClaude·webSearchTool·guarded·requireDb·useApi, 시장조사 프로그램, 회사 게시판(publishPost·Markdown) |
| `server/` | 직원·지침·키워드 조사 안건 저장. 컬렉션은 `mpc_mkt_` 로 시작 (`server/collections.js`) |
| `teams/newbiz/` | 신사업팀 주간 업무 (아래) |
| `api/` | API 처리 함수 (`work.js` = 팀 주간 업무, `cron.js` = 월요일 자동 브리핑) |
| `ui/` | 부서 화면(팀 카드), 팀 화면, 직원 카드, 키워드 조사 |
| `test/` | 순수 로직 테스트 (`npm run test:marketing`) |

Next.js 위치에는 **연결선 한 줄짜리 파일**만 있다.
- `app/dept/marketing/page.jsx` → `ui/DepartmentPage.jsx`
- `app/dept/marketing/team/[teamId]/page.jsx` → `ui/TeamPage.jsx`
- `app/api/marketing/team`, `members/[memberId]`, `research/...` → `api/team.js`, `api/member.js`, `api/research.js`
- `app/api/marketing/teams/[teamId]/weeks/[weekKey]` (GET), `.../steps/[step]` (POST) → `api/work.js`
- `app/api/marketing/cron/weekly` → `api/cron.js` (`vercel.json` 의 crons 가 매주 월요일 07:00 한국 시간에 부른다)

## 신사업팀 주간 업무 (`teams/newbiz/`)
| 파일 | 내용 |
| --- | --- |
| `steps.js` | 단계 정의·순서 검사·회의 발언 순서 (화면·서버 공용, 순수) |
| `week.js` | 한국 시간 ISO 주 (`2026-W48`), 주 범위 (순수) |
| `sources.js` | 웹 검색 출처 번호 붙이기·지어낸 번호 잡기·판정 줄 읽기 (순수) |
| `prompts.js` | 단계별 지시문과 보고서 형식 |
| `work.js` | 실행·저장 (Firestore `mpc_mkt_work/newbiz_{주}`), 게시판 올리기 |
| `ui/WeeklyWork.jsx` | 주간 업무 화면 |

| 단계 | 누가 | 하는 일 | AI |
| --- | --- | --- | --- |
| ① 월요일 경제 브리핑 | 팀원1 | 지난주 경제·증시·비트코인·환율·정치 이슈·핫 검색어, 이슈 → 시장 반응. **게시판** | 자료: Haiku+웹 검색(최대 8번) / 글: 직원 모델 |
| ② 이번 주 시장 탐색 | 팀원1 | 크몽·숨고·SNS·일본/동남아/중국/미국 쇼핑몰에서 '누가 얼마를 내나' 신호 카드 | Haiku+웹 검색(최대 10번) / 직원 모델 |
| ③ 팀장 지시 | 팀장 | 더 팔 신호와 질문, 또는 '넘어감'. 사장님 지시 반영 | 직원 모델 |
| ④ 심층 조사 | 팀원1 | 질문별 답, 돈 흐름 표, 월 100만 원 계산 | Haiku+웹 검색(최대 10번) / 직원 모델 |
| ⑤ 회의 | 팀 | 기획자 제안 → 분석가 검증 → 팀장 판정, 반려면 다시 (최대 3라운드) | 발언마다 직원 모델 |
| ⑥ 주간 보고서 | 팀장 | 아이템이 없어도 매주. 사장님 결정(승인·보류·반려)이 붙는다. **게시판** | 직원 모델 |

- 한 요청 = 한 단계의 한 부분. 화면이 순서대로 부른다 (서버가 혼자 돌지 않음, 폴링 없음). 월요일 브리핑만 Cron.
- 출처: 단계마다 접두어 B·E·D. 글에 목록에 없는 번호가 있으면 `[출처 없음]` 으로 바꾸고 화면에 경고.
- 비용: 한 주 전체 약 $0.6~1. 모든 호출은 `callClaude()` → 하루 한도(킬 스위치)와 비용 기록이 적용된다.

## 경계 규칙 (빌드 전에 자동 검사)
`scripts/check-module-boundaries.mjs` 가 `npm run build` 전에 돈다. 어기면 빌드가 실패해서 배포되지 않는다.
1. `marketing/` 안의 파일은 `marketing/` 안의 파일만 가져온다. 공용 코드와 다른 모듈은 `marketing/core/` 로만 가져온다.
   다른 모듈은 공개 입구만: `research/index.js`, `research/client.js`, `board/index.js`, `board/client.js`.
2. 공용 코드(lib/, components/, app/ 의 다른 곳)는 마케팅 코드를 가져오지 않는다. 예외: `lib/departments.js` → `marketing/department.js`.
3. 연결선 파일은 `marketing/` 안의 파일만 가져온다.

## 데이터 (Firestore)
- `mpc_mkt_members/{memberId}` — 직원 (teamId, title, name, role, model, systemPrompt, order). 처음 열 때 `team.js` 로 만든다
- `mpc_mkt_settings/department` — 부서 공통 지침 (없으면 기본 규칙)
- `mpc_mkt_research/{agendaId}` — 키워드 조사 안건: topic, candidates, status, runId(→ `mpc_rsh_runs`), report
- `mpc_mkt_work/{팀}_{주}` — 팀 주간 업무. `steps.{단계}` = status(collected/done/skipped/running), notes, sources[{ref,url,title}], text, invalidRefs, 비용, 시각. 회의는 turns[], verdict. 보고서는 ownerDecision

## 키워드 조사 (신사업팀 화면 아래)
주제 → 데이터 분석가가 후보 키워드 50개 (Haiku) → 사장님이 고치고 [조사 시작] → 시장조사 프로그램(`research/`)이 네이버 숫자 → 분석가 보고서.
