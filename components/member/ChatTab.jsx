'use client';

import { useEffect, useRef, useState } from 'react';
import { formatCost, formatTime } from '../format';
import { useApi } from '../passcode';

const MODEL_LABELS = { cheap: '가성비 (Haiku)', smart: '고성능 (Sonnet)' };

// 대화·지침 탭: 직원 지침(학습) 편집 + 업무 채팅 + 결과
export default function ChatTab({ member, trading, onMemberChanged }) {
  const api = useApi();
  const [messages, setMessages] = useState([]);
  const [results, setResults] = useState([]);
  const [proposals, setProposals] = useState({}); // id → 확인 카드
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const chatEndRef = useRef(null);

  const addProposals = (list = []) =>
    setProposals((prev) => ({ ...prev, ...Object.fromEntries(list.map((p) => [p.id, p])) }));

  useEffect(() => {
    api(`/api/members/${member.id}?include=chat`)
      .then((data) => {
        setMessages(data.messages || []);
        setResults(data.results || []);
        addProposals(data.proposals);
      })
      .catch((err) => setError(err.message));
  }, [member.id, api]);

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
      const data = await api(`/api/members/${member.id}/chat`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      addProposals(data.proposals);
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${now}-a`,
          role: 'assistant',
          content: data.reply,
          proposalIds: (data.proposals || []).map((p) => p.id),
          at: Date.now(),
        },
      ]);
      setResults((prev) => [
        { id: data.resultId, task: text, output: data.reply, model: data.model, costUsd: data.costUsd, status: 'new', at: Date.now() },
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
      await api(`/api/members/${member.id}/results/${result.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setResults((prev) => prev.map((r) => (r.id === result.id ? { ...r, status } : r)));
    } catch (err) {
      setError(err.message);
    }
  }

  function askRevision(result) {
    const short = result.task.length > 30 ? `${result.task.slice(0, 30)}…` : result.task;
    setInput(`방금 결과("${short}")를 이렇게 수정해 줘: `);
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: 'center' });
  }

  return (
    <>
      <MemberSettings member={member} trading={trading} onSaved={onMemberChanged} />

      <section className="panel">
        <h2>업무 채팅</h2>
        <p className="hint">{member.name}에게 일을 시키세요. 최근 대화 10개를 기억하고 이어서 일합니다.</p>
        <div className="chat-log">
          {messages.length === 0 && <p className="hint">아직 대화가 없어요.</p>}
          {messages.map((m) => (
            <div key={m.id} className="chat-item">
              <div className={m.role === 'user' ? 'bubble me' : 'bubble ai'}>{m.content}</div>
              {(m.proposalIds || []).map((pid) =>
                proposals[pid] ? (
                  <ProposalCard
                    key={pid}
                    proposal={proposals[pid]}
                    memberId={member.id}
                    onChange={(p) => addProposals([p])}
                  />
                ) : null,
              )}
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
            placeholder={trading ? '예: 지금 전략의 약점을 정리해줘' : '예: 오늘 할 일 정리해줘'}
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
                {formatTime(r.at)} · {r.model} · {formatCost(r.costUsd)}
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

const PROPOSAL_STATUS = { executed: '실행함', cancelled: '취소함', invalid: '만들 수 없음' };

// 채팅 확인 카드. [실행]을 눌러야 명령·설정 변경이 일어난다. 실제 돈은 확인창을 한 번 더 거친다.
function ProposalCard({ proposal: p, memberId, onChange }) {
  const api = useApi();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const live = p.kind === 'order' && p.params?.mode === 'live';
  const open = p.status === 'proposed' && !p.expired;

  async function act(action) {
    if (action === 'execute' && live && !window.confirm(`실제 돈으로 주문합니다.\n${p.summary}\n계속할까요?`)) return;
    setBusy(true);
    setNote('');
    try {
      const r = await api(`/api/members/${memberId}/proposals/${p.id}`, {
        method: 'POST',
        body: JSON.stringify({ action, confirmLive: live && action === 'execute' ? true : undefined }),
      });
      onChange({ ...p, status: r.status });
      setNote(r.message || '');
    } catch (err) {
      setNote(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`proposal ${live ? 'live' : ''} ${p.status}`}>
      <div className="proposal-head">
        <strong>{p.summary}</strong>
        {!open && <span className="chip">{p.expired ? '만료' : PROPOSAL_STATUS[p.status] || p.status}</span>}
      </div>
      {p.error && <p className="hint">{p.error}</p>}
      {open && (
        <div className="result-actions">
          <button type="button" className={live ? 'live' : ''} disabled={busy} onClick={() => act('execute')}>
            {live ? '실제로 실행' : '실행'}
          </button>
          <button type="button" className="secondary" disabled={busy} onClick={() => act('cancel')}>
            취소
          </button>
        </div>
      )}
      {note && <p className="hint">{note}</p>}
    </div>
  );
}

function MemberSettings({ member, trading, onSaved }) {
  const api = useApi();
  const pick = (m) => ({ name: m.name, role: m.role, method: m.method, model: m.model, systemPrompt: m.systemPrompt });
  const [form, setForm] = useState(pick(member));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const original = pick(member);
  const changed = Object.keys(form).some((k) => form[k] !== original[k]);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const data = await api(`/api/members/${member.id}`, { method: 'PUT', body: JSON.stringify(form) });
      onSaved(data.member);
      setForm(pick(data.member));
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
      <h2>직원 지침 (학습시키기)</h2>
      <p className="hint">
        {member.role || '역할 미정'} · {MODEL_LABELS[member.model]}
      </p>
      <details className="settings">
        <summary>이름·역할·모델·지침 편집</summary>
        <form onSubmit={save} className="ask">
          <label>
            이름
            <input value={form.name} onChange={set('name')} />
          </label>
          <label>
            역할
            <input value={form.role} onChange={set('role')} />
          </label>
          {trading && (
            <label>
              매매 방법
              <input value={form.method} onChange={set('method')} />
            </label>
          )}
          <label>
            모델 등급 (대화에 사용. 전략 만들기는 항상 고성능)
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
            저장해 두면 이 직원이 일할 때마다 항상 먼저 읽어요. 부서 공통 지침도 함께 읽어요.
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
