'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatPct, formatTime, MODE_LABELS, pnlClass } from './format';
import { useApi } from './passcode';

export default function DepartmentOverview({ dept }) {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    return api(`/api/departments/${dept.id}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [api, dept.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  const members = [...data.members];
  if (dept.trading) {
    // 모의 수익률 순위 (기록이 없는 직원은 뒤로)
    members.sort((a, b) => (data.stats[b.id]?.returnPct ?? -Infinity) - (data.stats[a.id]?.returnPct ?? -Infinity));
  }

  return (
    <>
      {error && <p className="msg error">{error}</p>}
      {dept.trading && <WorkerStatus worker={data.worker} />}

      <section className="panel">
        <div className="section-head">
          <h2>직원 {members.length}명</h2>
          {dept.trading && <span className="hint">모의 수익률 순</span>}
        </div>
        <div className="member-list">
          {members.map((m, i) => {
            const stats = data.stats[m.id];
            return (
              <Link key={m.id} href={`/dept/${dept.id}/${m.id}`} className="member-card">
                <div className="member-card-top">
                  <span className="member-name">
                    {dept.trading && stats?.trades > 0 && <span className="rank">{i + 1}</span>}
                    {m.name}
                  </span>
                  {dept.trading && (
                    <span className={`pct ${pnlClass(stats?.returnPct)}`}>
                      {stats?.trades > 0 ? formatPct(stats.returnPct) : '기록 없음'}
                    </span>
                  )}
                </div>
                <p className="hint">{m.method || m.role || '역할 미정'}</p>
                {dept.trading && (
                  <div className="chips">
                    <span className="chip">{MODE_LABELS[m.mode]}</span>
                    <span className="chip">
                      {m.activeStrategyVersion ? `전략 v${m.activeStrategyVersion} 승인됨` : '승인된 전략 없음'}
                    </span>
                    {m.autoRun && <span className="chip">자동 실행</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
        <AddMember deptId={dept.id} trading={dept.trading} onAdded={load} />
      </section>

      <CommonGuideline deptId={dept.id} initial={data.settings.commonGuideline} />
    </>
  );
}

function WorkerStatus({ worker }) {
  const online = worker?.online;
  return (
    <section className={online ? 'panel worker on' : 'panel worker'}>
      <span className="dot" aria-hidden="true" />
      <div>
        <strong>노트북 매매 프로그램 {online ? '연결됨' : '연결 안 됨'}</strong>
        <p className="hint">
          {worker?.lastSeenAt
            ? `마지막 신호 ${formatTime(worker.lastSeenAt)}`
            : '아직 연결된 적이 없어요. 연결 전에도 전략 만들기와 명령 저장은 할 수 있어요.'}
        </p>
      </div>
    </section>
  );
}

function AddMember({ deptId, trading, onAdded }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', method: '', role: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api(`/api/departments/${deptId}/members`, { method: 'POST', body: JSON.stringify(form) });
      setForm({ name: '', method: '', role: '' });
      setOpen(false);
      await onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="add-btn" onClick={() => setOpen(true)}>
        + 직원 추가
      </button>
    );
  }

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  return (
    <form onSubmit={submit} className="ask add-form">
      <label>
        이름
        <input value={form.name} onChange={set('name')} placeholder="예: 돌파매매 직원" autoFocus />
      </label>
      {trading && (
        <label>
          매매 방법 (이 직원이 맡을 방법 하나)
          <input value={form.method} onChange={set('method')} placeholder="예: 거래량 급증 돌파 단타" />
        </label>
      )}
      <label>
        역할 (선택)
        <input value={form.role} onChange={set('role')} />
      </label>
      {error && <p className="msg error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving || !form.name.trim()}>
          {saving ? '추가 중…' : '추가'}
        </button>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>
          취소
        </button>
      </div>
    </form>
  );
}

function CommonGuideline({ deptId, initial }) {
  const api = useApi();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const data = await api(`/api/departments/${deptId}`, {
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
        <summary>부서 공통 지침</summary>
        <form onSubmit={save} className="ask">
          <p className="hint">
            이 부서의 모든 직원이 일할 때마다 먼저 읽는 지침이에요. 리스크 원칙, 보고 형식처럼 모두에게 같은
            내용만 적으세요. 직원마다 다른 내용은 각 직원의 지침에 적어요.
          </p>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
          <button type="submit" disabled={saving || text === saved}>
            {saving ? '저장 중…' : '공통 지침 저장'}
          </button>
          {notice && <p className="hint">{notice}</p>}
        </form>
      </details>
    </section>
  );
}
