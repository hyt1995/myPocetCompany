// 회사 게시판 모듈의 서버용 공개 입구. 다른 모듈은 이 파일만 가져온다.
//
// publishPost({ id, kind, title, summary, body, sources, author, weekKey, link })
//   id: 소문자·숫자·-·_ (예: 'marketing-newbiz-2026-w48-report'), 같은 id 면 덮어쓴다.
//   kind: fields.js 의 POST_KINDS 중 하나.

export { publishPost, listPosts, getPost } from './server/posts';
export { POST_KINDS } from './fields';
