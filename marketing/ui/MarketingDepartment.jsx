'use client';

// 마케팅사업부 부서 화면: 팀 구성(직원1·직원2·팀장 + 감사), 회의실(준비 중), 부서 공통 지침(회의 규칙).

import { useCallback, useEffect, useState } from 'react';
import { formatTime, useApi } from '../core/client';

const MODEL_LABELS = { cheap: '가성비 (Haiku)', smart: '고성능 (Sonnet)' };

// 공용 globals.css 를 고치지 않으려고 마케팅 화면 전용 모양은 여기 둔다.
const CARD_BUTTON = {
  display: 'block',
  width: '100%',
  padding: 0,
  border: 0,
  background: 'none',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

export default function MarketingDepartment() {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    return api('/api/marketing/team')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  function replaceMember(updated) {
    setData((prev) => ({ ...prev, members: prev.members.map((m) => (m.id === updated.id ? updated : m)) }));
  }

  return (
    <>
      <section className="panel">
        <div className="section-head">
          <h2>팀 구성</h2>
          <span className="hint">직원을 눌러 지침 수정</span>
        </div>
        <div className="member-list">
          {data.members.map((m) => (
            <MemberCard key={m.id} member={m} onSaved={replaceMember} />
          ))}
          <div className="member-card">
            <div className="member-card-top">
              <span className="member-name">사장님</span>
              <span className="chip">감사</span>
            </div>
            <p className="hint">회의의 관문마다 승인·반려합니다. 최종 결정은 언제나 사장님이 합니다.</p>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>회의실</h2>
        <p className="hint">
          준비 중이에요. 시장조사 프로그램이 생기면 여기서 안건을 올리고, 데이터 분석가 → 사업 기획자 → 팀장
          순서로 회의한 뒤 사장님이 사업 계획서를 승인해요.
        </p>
      </section>

      <CommonGuideline initial={data.settings} />
    </>
  );
}

function MemberCard({ member, onSaved }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => pick(member));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setForm(pick(member));
  }, [member]);

  const changed = JSON.stringify(form) !== JSON.stringify(pick(member));
  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  async function save(body) {
    setSaving(true);
    setNotice('');
    try {
      const data = await api(`/api/marketing/members/${member.id}`, { method: 'PUT', body: JSON.stringify(body) });
      onSaved(data.member);
      setNotice(`저장됨 · ${formatTime(Date.now())}`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="member-card">
      <button type="button" style={CARD_BUTTON} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="member-card-top">
          <span className="member-name">{member.name}</span>
          <span className="chip">{member.title || '직원'}</span>
        </span>
        <span className="hint" style={{ display: 'block' }}>
          {member.role || '역할 미정'}
        </span>
        <span className="chips">
          <span className="chip">{MODEL_LABELS[member.model]}</span>
          <span className="chip">{member.isDefaultPrompt ? '기본 지침' : '수정한 지침'}</span>
        </span>
      </button>

      {open && (
        <form
          className="ask add-form"
          onSubmit={(e) => {
            e.preventDefault();
            save(form);
          }}
        >
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
              <option value="smart">{MODEL_LABELS.smart}</option>
              <option value="cheap">{MODEL_LABELS.cheap}</option>
            </select>
          </label>
          <label>
            지침 (이 직원의 전공·관점·지켜야 할 것)
            <textarea rows={14} value={form.systemPrompt} onChange={set('systemPrompt')} />
          </label>
          <div className="row">
            <button type="submit" disabled={saving || !changed}>
              {saving ? '저장 중…' : '저장'}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={saving || member.isDefaultPrompt}
              onClick={() => {
                if (window.confirm('지침을 처음 기본 지침으로 되돌릴까요?')) save({ resetPrompt: true });
              }}
            >
              기본 지침으로
            </button>
          </div>
          {notice && <p className="hint">{notice}</p>}
        </form>
      )}
    </div>
  );
}

function pick(m) {
  return { name: m.name, role: m.role, model: m.model, systemPrompt: m.systemPrompt };
}

function CommonGuideline({ initial }) {
  const api = useApi();
  const [saved, setSaved] = useState(initial.commonGuideline);
  const [text, setText] = useState(initial.commonGuideline);
  const [notice, setNotice] = useState(initial.isDefault ? '아직 기본 회의 규칙이에요.' : '');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const data = await api('/api/marketing/team', {
        method: 'PUT',
        body: JSON.stringify({ commonGuideline: text }),
      });
      setSaved(data.settings.commonGuideline);
      setNotice(`저장됨 · ${formatTime(Date.now())}`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel">
      <details>
        <summary>부서 공통 지침 (회의 규칙)</summary>
        <form onSubmit={save} className="ask">
          <p className="hint">
            마케팅사업부의 모든 직원이 일할 때마다 먼저 읽는 지침이에요. 회의 규칙처럼 모두에게 같은 내용만 적어요.
          </p>
          <textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" disabled={saving || text === saved}>
            {saving ? '저장 중…' : '공통 지침 저장'}
          </button>
          {notice && <p className="hint">{notice}</p>}
        </form>
      </details>
    </section>
  );
}
