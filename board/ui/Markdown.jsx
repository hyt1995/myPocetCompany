// 보고서 본문을 화면에 보여 주는 아주 작은 마크다운 표시기 (외부 패키지 없음).
// 지원: # 제목, - 목록, 1. 목록, | 표 |, **굵게**, [링크](https://…), 출처 번호 [E3]·[S1].
// HTML 은 해석하지 않는다 (React 가 글자로만 보여 준다).

const REF = /\[([A-Z])(\d{1,3})\]/;
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\[[A-Z]\d{1,3}\])/g;

function inline(text, key, refLinks) {
  const parts = String(text).split(INLINE);
  return parts.map((part, i) => {
    const k = `${key}-${i}`;
    if (!part) return null;
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={k}>{part.slice(2, -2)}</strong>;
    const link = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
    if (link) {
      return (
        <a key={k} href={link[2]} target="_blank" rel="noreferrer">
          {link[1]}
        </a>
      );
    }
    const ref = part.match(REF);
    if (ref && part.length <= 6) {
      const id = `${ref[1]}${ref[2]}`;
      const url = refLinks?.[id];
      return (
        <sup key={k}>
          {url ? (
            <a href={url} target="_blank" rel="noreferrer">
              [{id}]
            </a>
          ) : (
            `[${id}]`
          )}
        </sup>
      );
    }
    return part;
  });
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

// refLinks: { E3: 'https://…' } — 출처 번호를 누르면 그 페이지가 열린다.
export default function Markdown({ text, refLinks }) {
  const lines = String(text || '').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    const key = `l${i}`;
    if (!t) {
      i += 1;
      continue;
    }
    const h = t.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const Tag = h[1].length <= 2 ? 'h3' : 'h4';
      out.push(
        <Tag key={key} style={{ marginTop: 18 }}>
          {inline(h[2], key, refLinks)}
        </Tag>,
      );
      i += 1;
      continue;
    }
    if (t.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitRow(lines[i]);
        if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) rows.push(cells);
        i += 1;
      }
      const [head, ...body] = rows;
      out.push(
        <div key={key} className="table-wrap">
          <table className="table" style={{ whiteSpace: 'normal' }}>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j} style={{ textAlign: 'left' }}>
                    {inline(c, `${key}h${j}`, refLinks)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j} style={{ textAlign: 'left' }}>
                      {inline(c, `${key}r${ri}c${j}`, refLinks)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const bullet = /^([-*•]|\d+[.)])\s+/;
    if (bullet.test(t)) {
      const ordered = /^\d/.test(t);
      const items = [];
      while (i < lines.length && bullet.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(bullet, ''));
        i += 1;
      }
      const List = ordered ? 'ol' : 'ul';
      out.push(
        <List key={key} style={{ paddingLeft: 20, margin: '6px 0', lineHeight: 1.6 }}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `${key}i${j}`, refLinks)}</li>
          ))}
        </List>,
      );
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const p = lines[i].trim();
      if (!p || /^#{1,4}\s/.test(p) || p.startsWith('|') || bullet.test(p)) break;
      para.push(p);
      i += 1;
    }
    out.push(
      <p key={key} style={{ margin: '6px 0', lineHeight: 1.6, wordBreak: 'break-word' }}>
        {inline(para.join(' '), key, refLinks)}
      </p>,
    );
  }
  return <div>{out}</div>;
}
