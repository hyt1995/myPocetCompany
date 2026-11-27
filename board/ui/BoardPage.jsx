'use client';

// /board — 회사 게시판. 부서가 쓴 보고서를 회사 전체가 같이 본다. (열 때 한 번 읽는다)

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatTime, PasscodeGate, useApi } from '../core/client';

export default function BoardPage() {
  return (
    <main className="page">
      <Link href="/" className="back">
        ← 조직도
      </Link>
      <header className="top">
        <h1>회사 게시판</h1>
        <p>부서 보고서를 회사 전체가 같이 봐요. (신사업팀 주간 보고서 · 월요일 경제 브리핑)</p>
      </header>
      <PasscodeGate>
        <PostList />
      </PasscodeGate>
    </main>
  );
}

function PostList() {
  const api = useApi();
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState('');
  const [kind, setKind] = useState('all');

  useEffect(() => {
    api('/api/board/posts')
      .then((d) => setPosts(d.posts))
      .catch((err) => setError(err.message));
  }, [api]);

  if (error) return <p className="msg error">{error}</p>;
  if (!posts) return <p className="hint">불러오는 중…</p>;

  const kinds = [...new Set(posts.map((p) => p.kind))];
  const shown = kind === 'all' ? posts : posts.filter((p) => p.kind === kind);

  return (
    <section className="panel">
      {kinds.length > 1 && (
        <div className="chips" style={{ marginBottom: 8 }}>
          {['all', ...kinds].map((k) => (
            <button
              key={k}
              type="button"
              className={k === kind ? 'chip chip-on' : 'chip'}
              style={{ border: 0, font: 'inherit', cursor: 'pointer' }}
              onClick={() => setKind(k)}
            >
              {k === 'all' ? '전체' : posts.find((p) => p.kind === k)?.kindLabel}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 && <p className="empty">아직 글이 없어요. 신사업팀이 보고서를 쓰면 여기에 올라와요.</p>}
      <div className="member-list">
        {shown.map((p) => (
          <Link key={p.id} href={`/board/${p.id}`} className="member-card" style={{ display: 'block', color: 'inherit' }}>
            <span className="member-card-top">
              <span className="member-name">{p.title}</span>
              <span className="chip">{p.kindLabel}</span>
            </span>
            {p.summary && (
              <span className="hint" style={{ display: 'block' }}>
                {p.summary}
              </span>
            )}
            <span className="hint" style={{ display: 'block' }}>
              {[p.author?.team, p.author?.name].filter(Boolean).join(' · ')} · {formatTime(p.updatedAt || p.at)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
