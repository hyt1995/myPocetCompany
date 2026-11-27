'use client';

// /board/[postId] — 게시글 한 개 (본문 + 출처 목록)

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { formatTime, PasscodeGate, useApi } from '../core/client';
import Markdown from './Markdown';

export default function PostPage() {
  const { postId } = useParams();
  return (
    <main className="page">
      <Link href="/board" className="back">
        ← 회사 게시판
      </Link>
      <PasscodeGate>
        <PostView postId={postId} />
      </PasscodeGate>
    </main>
  );
}

function PostView({ postId }) {
  const api = useApi();
  const [post, setPost] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api(`/api/board/posts/${encodeURIComponent(postId)}`)
      .then((d) => setPost(d.post))
      .catch((err) => setError(err.message));
  }, [api, postId]);

  if (error) return <p className="msg error">{error}</p>;
  if (!post) return <p className="hint">불러오는 중…</p>;

  const refLinks = Object.fromEntries(post.sources.filter((s) => s.ref).map((s) => [s.ref, s.url]));

  return (
    <>
      <header className="top">
        <h1>{post.title}</h1>
        <p>
          {post.kindLabel} · {[post.author?.team, post.author?.name].filter(Boolean).join(' · ')} ·{' '}
          {formatTime(post.updatedAt || post.at)}
        </p>
      </header>
      <section className="panel">
        <Markdown text={post.body} refLinks={refLinks} />
        {post.link && (
          <Link href={post.link} className="enter">
            작업 화면 열기 →
          </Link>
        )}
      </section>
      {post.sources.length > 0 && (
        <section className="panel">
          <details>
            <summary>출처 {post.sources.length}개</summary>
            <ol style={{ paddingLeft: 20, lineHeight: 1.6, fontSize: 13 }}>
              {post.sources.map((s) => (
                <li key={s.url} style={{ wordBreak: 'break-all' }}>
                  {s.ref && <strong>[{s.ref}] </strong>}
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </section>
      )}
    </>
  );
}
