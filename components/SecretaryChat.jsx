'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'mpc-passcode';

function loadPasscode() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function savePasscode(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 저장이 안 되는 브라우저면 매번 입력하면 된다.
  }
}

export default function SecretaryChat() {
  const [health, setHealth] = useState(null);
  const [passcode, setPasscode] = useState('');
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPasscode(loadPasscode());
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => setHealth({ failed: true }));
  }, []);

  async function ask(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setAnswer(null);
    try {
      const res = await fetch('/api/secretary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passcode, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) savePasscode('');
        setError(data.error || '알 수 없는 오류');
      } else {
        savePasscode(passcode);
        setAnswer(data);
      }
    } catch {
      setError('서버에 연결하지 못했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat-box">
      <div className="checks">
        <span>{mark(health?.anthropicKey)} API 키</span>
        <span>{mark(health?.passcode)} 비밀번호</span>
        <span>{dbMark(health?.firestore)} DB</span>
      </div>

      <form onSubmit={ask} className="ask">
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          placeholder="비밀번호 (APP_PASSCODE)"
          value={passcode}
          onChange={(e) => setPasscode(e.target.value)}
        />
        <textarea
          rows={2}
          placeholder="비서에게 물어볼 것 (예: 오늘 할 일 정리해줘)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <button type="submit" disabled={loading || !passcode || !message.trim()}>
          {loading ? '답변 기다리는 중…' : '비서에게 물어보기'}
        </button>
      </form>

      {error && <p className="msg error">{error}</p>}

      {answer && (
        <div className="msg reply">
          <p>{answer.reply}</p>
          <small>
            {answer.model} · 입력 {answer.usage?.input_tokens ?? '?'} / 출력{' '}
            {answer.usage?.output_tokens ?? '?'} 토큰 · {formatUsd(answer.costUsd)} ·{' '}
            {answer.logged ? '비용 기록됨' : '비용 기록 안 됨 (DB 미연결)'}
          </small>
        </div>
      )}
    </div>
  );
}

function mark(ok) {
  if (ok === undefined) return '…';
  return ok ? '✓' : '✗';
}

function dbMark(state) {
  if (state === undefined) return '…';
  if (state === 'ok') return '✓';
  if (state === 'missing') return '✗ 미등록';
  return '✗ 오류';
}

function formatUsd(value) {
  if (typeof value !== 'number') return '비용 계산 불가';
  return `$${value.toFixed(6)}`;
}
