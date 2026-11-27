'use client';

// 마케팅사업부 부서 화면: 팀 카드(신사업팀·운영팀 …), 회사 게시판 링크, 부서 공통 지침.
// 팀을 누르면 팀 화면(/dept/marketing/team/{팀})으로 간다.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatTime, useApi } from '../core/client';
import { TEAM_STATUS_LABELS, TEAMS } from '../org';

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

  return (
    <>
      <section className="panel">
        <div className="section-head">
          <h2>팀</h2>
          <span className="hint">팀을 눌러 일 시키기</span>
        </div>
        <div className="member-list">
          {TEAMS.map((t) => {
            const members = data.members.filter((m) => m.teamId === t.id);
            return (
              <Link
                key={t.id}
                href={`/dept/marketing/team/${t.id}`}
                className="member-card"
                style={{ display: 'block', color: 'inherit' }}
              >
                <span className="member-card-top">
                  <span className="member-name">{t.name}</span>
                  <span className={t.status === 'active' ? 'badge on' : 'badge'}>
                    <span className="dot" aria-hidden="true" />
                    {TEAM_STATUS_LABELS[t.status]}
                  </span>
                </span>
                <span className="hint" style={{ display: 'block' }}>
                  {t.role}
                </span>
                {members.length > 0 && (
                  <span className="chips">
                    {members.map((m) => (
                      <span key={m.id} className="chip">
                        {m.title} {m.name}
                      </span>
                    ))}
                    <span className="chip">감사 사장님</span>
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <h2>회사 게시판</h2>
        <p className="hint">신사업팀의 월요일 경제 브리핑과 주간 보고서가 올라가요. 회사 전체가 참고해요.</p>
        <Link href="/board" className="enter">
          게시판 열기 →
        </Link>
      </section>

      <CommonGuideline initial={data.settings} />
    </>
  );
}

function CommonGuideline({ initial }) {
  const api = useApi();
  const [saved, setSaved] = useState(initial.commonGuideline);
  const [text, setText] = useState(initial.commonGuideline);
  const [notice, setNotice] = useState(initial.isDefault ? '아직 기본 규칙이에요.' : '');
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
        <summary>부서 공통 지침 (모든 팀 공통 규칙)</summary>
        <form onSubmit={save} className="ask">
          <p className="hint">
            마케팅사업부의 모든 팀·직원이 일할 때마다 먼저 읽는 지침이에요. 모두에게 같은 내용만 적어요.
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
