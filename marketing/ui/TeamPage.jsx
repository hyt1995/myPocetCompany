'use client';

// /dept/marketing/team/[teamId] — 마케팅사업부 팀 화면.
// 신사업팀: 주간 업무 → 팀 구성(지침 수정) → 키워드 조사(네이버 숫자).
// 업무 화면이 아직 없는 팀(운영팀 등)은 '준비 중'으로 보인다.

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { PasscodeGate, useApi } from '../core/client';
import { findTeam, TEAM_STATUS_LABELS } from '../org';
import WeeklyWork from '../teams/newbiz/ui/WeeklyWork';
import MarketResearch from './MarketResearch';
import MemberCard from './MemberCard';

// 팀 id → 팀 업무 화면. 새 팀의 업무 화면을 만들면 여기에 연결한다.
const TEAM_WORK = {
  newbiz: { Work: WeeklyWork, extras: [MarketResearch] },
};

export default function TeamPage() {
  const { teamId } = useParams();
  const team = findTeam(teamId);

  return (
    <main className="page">
      <Link href="/dept/marketing" className="back">
        ← 마케팅사업부
      </Link>
      {team ? (
        <>
          <header className="top">
            <h1>{team.name}</h1>
            <p>
              {TEAM_STATUS_LABELS[team.status]} · {team.role}
            </p>
          </header>
          <PasscodeGate>
            <TeamBody team={team} />
          </PasscodeGate>
        </>
      ) : (
        <p className="msg error">없는 팀이에요.</p>
      )}
    </main>
  );
}

function TeamBody({ team }) {
  const api = useApi();
  const [members, setMembers] = useState(null);
  const [error, setError] = useState('');
  const [initialWeek, setInitialWeek] = useState(undefined);

  const load = useCallback(
    () =>
      api('/api/marketing/team')
        .then((d) => setMembers(d.members.filter((m) => m.teamId === team.id)))
        .catch((err) => setError(err.message)),
    [api, team.id],
  );

  useEffect(() => {
    load();
    // 게시판에서 '작업 화면 열기'로 오면 ?week=2026-W48
    try {
      setInitialWeek(new URLSearchParams(window.location.search).get('week') || null);
    } catch {
      setInitialWeek(null);
    }
  }, [load]);

  if (!members || initialWeek === undefined) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  const work = TEAM_WORK[team.id];
  const byId = Object.fromEntries(members.map((m) => [m.id, m]));
  const replace = (updated) => setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  return (
    <>
      {work ? (
        <work.Work members={byId} initialWeek={initialWeek} />
      ) : (
        <section className="panel">
          <h2>준비 중</h2>
          <ul className="hint" style={{ paddingLeft: 20 }}>
            {team.duties.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        </section>
      )}

      {members.length > 0 && (
        <section className="panel">
          <div className="section-head">
            <h2>팀 구성</h2>
            <span className="hint">직원을 눌러 지침 수정</span>
          </div>
          <div className="member-list">
            {members.map((m) => (
              <MemberCard key={m.id} member={m} onSaved={replace} />
            ))}
            <div className="member-card">
              <div className="member-card-top">
                <span className="member-name">사장님</span>
                <span className="chip">감사</span>
              </div>
              <p className="hint">팀장 지시에 사장님 지시를 넣고, 주간 보고서를 승인·보류·반려해요. 최종 결정은 언제나 사장님이 해요.</p>
            </div>
          </div>
        </section>
      )}

      {(work?.extras || []).map((Extra, i) => (
        <Extra key={i} />
      ))}
    </>
  );
}
