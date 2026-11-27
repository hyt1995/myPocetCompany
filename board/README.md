# 회사 게시판 모듈 (`board/`)

부서가 쓴 보고서를 회사 전체가 같이 보는 곳. 화면 `/board`.
지금은 마케팅사업부 신사업팀의 **월요일 경제 브리핑**과 **주간 보고서**가 올라온다.
다른 기능을 고쳐도 이 폴더는 바뀌지 않게 분리해 두었다 (`scripts/check-module-boundaries.mjs`).

| 위치 | 내용 |
| --- | --- |
| `index.js` | **서버용 공개 입구.** `publishPost`, `listPosts`, `getPost`, `POST_KINDS` |
| `client.js` | **화면용 공개 입구.** `Markdown` (보고서 본문 표시) |
| `fields.js` | 글 값 검사 (엄격: 모르는 종류·잘못된 id 는 저장 안 함). 글 종류 `POST_KINDS` |
| `server/posts.js` | Firestore `mpc_board_posts/{postId}`. 같은 id 로 다시 쓰면 덮어쓴다 |
| `api/posts.js` | 목록·글 하나 (비밀번호 확인) |
| `ui/` | 목록·글 화면, 마크다운 표시기 |
| `core/` | 공용 코드와의 연결선 |

- 읽기: 목록 화면을 열 때 최근 30개, 글을 열 때 1개. 주기적으로 읽지 않는다.
- 글은 부서 모듈이 `publishPost()` 로만 쓴다. 게시판 화면에서 직접 쓰는 기능은 없다.
- 테스트: `npm run test:board`
