'use client';

// 직원 카드: 누르면 이름·역할·모델 등급·지침을 고칠 수 있다.

import { useEffect, useState } from 'react';
import { formatTime, useApi } from '../core/client';

const MODEL_LABELS = { cheap: '가성비 (Haiku)', smart: '고성능 (Sonnet)' };

// 공용 globals.css 를 고치지 않으려고 마케팅 화면 전용 모양은 여기 둔다.
export const CARD_BUTTON = {
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

export default function MemberCard({ member, onSaved }) {
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
