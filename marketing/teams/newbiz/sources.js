// 웹 검색 출처 번호 붙이기·검사. DB·외부 의존 없음 → marketing/test 에서 테스트
//
// 단계마다 접두어가 다르다: 브리핑 B1, B2… / 시장 탐색 E1… / 심층 조사 D1…
// 그래서 한 주의 보고서에서 [E3] 과 [D2] 를 섞어 써도 어느 자료인지 헷갈리지 않는다.

export const MAX_SOURCES_PER_STEP = 40;

// callClaude 가 돌려준 sources([{url,title}]) 에 번호를 붙인다.
// content(원본 블록)를 주면 본문에서 실제로 인용한 페이지를 앞 번호로 둔다.
export function numberSources(sources, prefix, content) {
  const cited = new Set();
  for (const block of content || []) {
    for (const c of block.citations || []) if (c.url) cited.add(c.url);
  }
  const list = [...(sources || [])];
  list.sort((a, b) => Number(cited.has(b.url)) - Number(cited.has(a.url))); // 안정 정렬: 나온 순서 유지
  return list.slice(0, MAX_SOURCES_PER_STEP).map((s, i) => ({
    ref: `${prefix}${i + 1}`,
    url: s.url,
    title: s.title || s.url,
  }));
}

// 수집 단계의 답(본문 블록 + 인용)을 '출처 번호가 붙은 메모'로 바꾼다.
// 인용(citations)이 달린 문장 뒤에 그 페이지의 번호를 붙인다. 번호는 numbered 목록 기준.
export function notesWithRefs(content, numbered) {
  const byUrl = new Map(numbered.map((s) => [s.url, s.ref]));
  let out = '';
  for (const block of content || []) {
    if (block.type !== 'text') continue;
    out += block.text;
    const refs = [
      ...new Set((block.citations || []).map((c) => byUrl.get(c.url)).filter(Boolean)),
    ];
    if (refs.length) out += ` ${refs.map((r) => `[${r}]`).join('')}`;
  }
  return out.trim();
}

export function sourceList(numbered) {
  return numbered.map((s) => `[${s.ref}] ${s.title} — ${s.url}`).join('\n');
}

// 글에 쓰인 출처 번호 검사. allowed 에 없는 번호(지어낸 출처)는 invalid 로 돌려준다.
export function checkRefs(text, allowed) {
  const ok = new Set((allowed || []).map((s) => s.ref));
  const used = [...new Set([...String(text || '').matchAll(/\[([A-Z]\d{1,3})\]/g)].map((m) => m[1]))];
  return { used: used.filter((r) => ok.has(r)), invalid: used.filter((r) => !ok.has(r)) };
}

// 지어낸 출처 번호는 글에서 '[출처 없음]' 으로 바꿔 눈에 띄게 한다.
export function markInvalidRefs(text, invalid) {
  if (!invalid.length) return text;
  const bad = new Set(invalid);
  return String(text).replace(/\[([A-Z]\d{1,3})\]/g, (m, r) => (bad.has(r) ? '[출처 없음]' : m));
}

// 보고서 끝의 '판정:' / '결정:' 같은 마지막 줄 읽기. 없으면 null.
export function lastTag(text, label, options) {
  const lines = String(text || '').split('\n').reverse();
  for (const line of lines) {
    const m = line.replace(/[*#>`]/g, '').trim().match(new RegExp(`^${label}\\s*[:：]\\s*(.+)$`));
    if (!m) continue;
    const value = m[1].trim();
    return options.find((o) => value.startsWith(o)) || null;
  }
  return null;
}

// '## 한 줄 결론' 같은 제목 바로 아래 첫 줄 (게시판 목록의 요약). 없으면 첫 글 줄.
export function sectionFirstLine(text, heading) {
  const lines = String(text || '').split('\n').map((l) => l.trim());
  const at = lines.findIndex((l) => /^#{1,4}\s/.test(l) && l.includes(heading));
  const pick = (from) => lines.slice(from).find((l) => l && !/^#{1,4}\s/.test(l)) || '';
  const line = at >= 0 ? pick(at + 1) : pick(0);
  return line.replace(/^[-*•]\s*/, '').replace(/\[[A-Z]\d{1,3}\]/g, '').replace(/\*\*/g, '').trim().slice(0, 200);
}
