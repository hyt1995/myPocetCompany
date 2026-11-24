'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePasscode } from './usePasscode';

const MODEL_LABELS = { cheap: '가성비 (Haiku)', smart: '고성능 (Sonnet)' };

export default function DepartmentRoom({ departmentId }) {
  const { passcode, setPasscode, ready } = usePasscode();
  const [draftPasscode, setDraftPasscode] = useState('');
  const [members, setMembers] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [error, setError] = useState('');

  const api = useCallback(
    async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'content-type': 'application/json',
          'x-passcode': encodeURIComponent(passcode),
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setPasscode('');
        throw new Error('비밀번호가 맞지 않아요. 다시 입력해 주세요.');
      }
      if (!res.ok) throw new Error(data.error || `오류 (HTTP ${res.status})`);
      return data;
    },
    [passcode, setPasscode],
  );

  useEffect(() => {
    if (!ready || !passcode) return;
    setError('');
    api(`/api/departments/${departmentId}/members`)
      .then((data) => {
        setMembers(data.members || []);
        setSelectedId((current) => current || data.members?.[0]?.id || null);
      })
      .catch((err) => setError(err.message));
  }, [ready, passcode, departmentId, api]);

  if (!ready) return null;

  if (!passcode) {
    return (
      <form
        className="panel ask"
        onSubmit={(e) => {
          e.preventDefault();
          setPasscode(draftPasscode);
        }}
      >
        <p className="hint">부서에 들어가려면 비밀번호(APP_PASSCODE)를 입력하세요.</p>
        {error && <p className="msg error">{error}</p>}
        <input
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={draftPasscode}
          onChange={(e) => setDraftPasscode(e.target.value)}
        />
        <button type="submit" disabled={!draftPasscode}>
          들어가기
        </button>
      </form>
    );
  }

  return (
    <>
      {error && <p className="msg error">{error}</p>}

      {members.length > 1 && (
        <div className="tabs">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className={m.id === selectedId ? 'tab active' : 'tab'}
              onClick={() => setSelectedId(m.id)}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {selectedId && <MemberWorkspace key={selectedId} memberId={selectedId} api={api} />}
    </>
  );
}

function MemberWorkspace({ memberId, api }) {
  const [member, setMember] = useState(null);
  const [messages, setMessages] = useState([]);
  const [results, setResults] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);

  useEffect(() => {
    api(`/api/members/${memberId}`)
      .then((data) => {
        setMember(data.member);
        setMessages(data.messages || []);
        setResults(data.results || []);
      })
      .catch((err) => setError(err.message));
  }, [memberId, api]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages, sending]);

  async function send(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setSending(true);
    setError('');
    const now = Date.now();
    setMessages((prev) => [...prev, { id: `local-${now}`, role: 'user', content: text, at: now }]);
    setInput('');
    try {
      const data = await api(`/api/members/${memberId}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      setMessages((prev) => [
        ...prev,
        { id: `local-${now}-a`, role: 'assistant', content: data.reply, at: Date.now() },
      ]);
      setResults((prev) => [
        {
          id: data.resultId,
          task: text,
          output: data.reply,
          model: data.model,
          costUsd: data.costUsd,
          status: 'new',
          at: Date.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => prev.filter((m) => m.id !== `local-${now}`));
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  async function toggleApprove(result) {
    const status = result.status === 'approved' ? 'new' : 'approved';
    try {
      await api(`/api/members/${memberId}/results/${result.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setResults((prev) => prev.map((r) => (r.id === result.id ? { ...r, status } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  function askRevision(result) {
    setInput(`방금 결과("${shorten(result.task, 30)}")를 이렇게 수정해 줘: `);
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center' });
  }

  if (!member) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  return (
    <>
      <MemberSettings member={member} api={api} onSaved={setMember} />

      <section className="panel">
        <h2>업무 채팅</h2>
        <p className="hint">
          {member.name}에게 일을 시키세요. 최근 대화 10개를 기억하고 이어서 일합니다.
        </p>
        <div className="chat-log">
          {messages.length === 0 && <p className="hint">아직 대화가 없어요.</p>}
          {messages.map((m) => (
            <div key={m.id} className={m.role === 'user' ? 'bubble me' : 'bubble ai'}>
              {m.content}
            </div>
          ))}
          {sending && <div className="bubble ai pending">작업 중…</div>}
          <div ref={chatEndRef} />
        </div>
        {error && <p className="msg error">{error}</p>}
        <form onSubmit={send} className="ask">
          <textarea
            ref={inputRef}
            rows={3}
            placeholder="예: 비트코인 지금 사도 될지 판단 기준을 정리해줘"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? '작업 중…' : '지시하기'}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>결과</h2>
        {results.length === 0 && <p className="hint">아직 결과물이 없어요.</p>}
        <div className="results">
          {results.map((r) => (
            <article key={r.id} className={r.status === 'approved' ? 'result approved' : 'result'}>
              <p className="result-task">지시: {r.task}</p>
              <div className="result-output">{r.output}</div>
              <p className="result-meta">
                {formatTime(r.at)} · {r.model} · {formatUsd(r.costUsd)}
                {r.status === 'approved' && ' · 승인됨'}
              </p>
              <div className="result-actions">
                <button type="button" onClick={() => toggleApprove(r)}>
                  {r.status === 'approved' ? '승인 취소' : '승인'}
                </button>
                <button type="button" className="secondary" onClick={() => askRevision(r)}>
                  수정 지시
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function MemberSettings({ member, api, onSaved }) {
  const [form, setForm] = useState({
    name: member.name,
    role: member.role,
    model: member.model,
    systemPrompt: member.systemPrompt,
  });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const changed =
    form.name !== member.name ||
    form.role !== member.role ||
    form.model !== member.model ||
    form.systemPrompt !== member.systemPrompt;

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const data = await api(`/api/members/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onSaved(data.member);
      setNotice(`저장됨 · ${formatTime(Date.now())}`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <section className="panel">
      <div className="member-head">
        <div>
          <h2>{member.name}</h2>
          <p className="hint">
            {member.role} · {MODEL_LABELS[member.model]}
          </p>
        </div>
      </div>

      <details className="settings">
        <summary>팀원 지침 (학습시키기)</summary>
        <form onSubmit={save} className="ask">
          <label>
            이름
            <input value={form.name} onChange={set('name')} />
          </label>
          <label>
            역할
            <input value={form.role} onChange={set('role')} />
          </label>
          <label>
            모델 등급
            <select value={form.model} onChange={set('model')}>
              <option value="cheap">{MODEL_LABELS.cheap}</option>
              <option value="smart">{MODEL_LABELS.smart}</option>
            </select>
          </label>
          <label>
            지침 (시스템 프롬프트)
            <textarea rows={12} value={form.systemPrompt} onChange={set('systemPrompt')} />
          </label>
          <p className="hint">
            여기 적은 내용은 저장해 두면 이 팀원이 일할 때마다 항상 먼저 읽습니다. 매번 다시
            설명할 필요가 없어요.
          </p>
          <button type="submit" disabled={saving || !changed}>
            {saving ? '저장 중…' : '지침 저장'}
          </button>
          {notice && <p className="hint">{notice}</p>}
        </form>
      </details>
    </section>
  );
}

function formatTime(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatUsd(value) {
  if (typeof value !== 'number') return '비용 계산 불가';
  return `$${value.toFixed(4)}`;
}

function shorten(text, n) {
  return text.length > n ? `${text.slice(0, n)}…` : text;
}
