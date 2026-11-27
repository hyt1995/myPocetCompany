// 게시글 값 정리 (DB·외부 의존 없음 → board/test 에서 테스트)

export const BOARD_COL = 'mpc_board_posts';
export const MAX_BODY = 60_000;
export const MAX_SOURCES = 80;

// 글 종류. 화면의 필터·배지에 쓴다. 새 종류를 쓰려면 여기에 먼저 추가한다.
export const POST_KINDS = {
  briefing: '경제 브리핑',
  report: '주간 보고서',
  note: '메모',
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{2,120}$/;

export function isPostId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function cleanSource(s) {
  if (!s || typeof s.url !== 'string' || !/^https?:\/\//.test(s.url)) return null;
  return {
    ref: typeof s.ref === 'string' ? s.ref.slice(0, 8) : null,
    url: s.url.slice(0, 1000),
    title: String(s.title || s.url).slice(0, 200),
  };
}

// 엄격: 모르는 종류·빈 제목·잘못된 id 는 저장하지 않는다.
export function cleanPost(input = {}) {
  if (!isPostId(input.id)) throw new Error('게시글 id 가 잘못됐어요.');
  if (!POST_KINDS[input.kind]) throw new Error(`모르는 글 종류예요: ${input.kind}`);
  const title = String(input.title || '').trim().slice(0, 120);
  if (!title) throw new Error('제목이 비어 있어요.');
  const body = String(input.body || '').slice(0, MAX_BODY);
  if (!body.trim()) throw new Error('본문이 비어 있어요.');
  const a = input.author || {};
  return {
    kind: input.kind,
    title,
    summary: String(input.summary || '').trim().slice(0, 300),
    body,
    sources: (Array.isArray(input.sources) ? input.sources : []).map(cleanSource).filter(Boolean).slice(0, MAX_SOURCES),
    author: {
      department: String(a.department || '').slice(0, 40),
      team: String(a.team || '').slice(0, 40),
      name: String(a.name || '').slice(0, 60),
    },
    weekKey: typeof input.weekKey === 'string' ? input.weekKey.slice(0, 10) : null,
    link: typeof input.link === 'string' && input.link.startsWith('/') ? input.link.slice(0, 200) : null,
  };
}

// 목록에는 본문을 빼고 보낸다 (화면 데이터 줄이기).
export function toListItem(id, d) {
  return {
    id,
    kind: d.kind,
    kindLabel: POST_KINDS[d.kind] || d.kind,
    title: d.title,
    summary: d.summary || '',
    author: d.author || {},
    weekKey: d.weekKey || null,
    at: d.at || null,
    updatedAt: d.updatedAt || null,
  };
}
