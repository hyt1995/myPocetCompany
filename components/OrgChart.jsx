'use client';

import Link from 'next/link';
import { useState } from 'react';
import SecretaryChat from './SecretaryChat';

export default function OrgChart({ departments }) {
  const [openId, setOpenId] = useState(null);

  if (departments.length === 0) {
    return <p className="empty">아직 부서가 없습니다.</p>;
  }

  return (
    <section className="org" aria-label="조직도">
      {departments.map((d) => {
        const open = openId === d.id;
        const team = d.defaultMembers || [];
        const active = d.statusLabel === '운영 중';
        return (
          <article key={d.id} className="dept">
            <button
              type="button"
              className="dept-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : d.id)}
            >
              <span className="dept-name">{d.name}</span>
              <span className={active ? 'badge on' : 'badge'}>
                <span className="dot" aria-hidden="true" />
                {d.statusLabel}
              </span>
            </button>

            {open && (
              <div className="dept-body">
                <h3>역할</h3>
                <p>{d.role}</p>

                <h3>맡을 일</h3>
                <ul>
                  {d.duties.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>

                <h3>팀원</h3>
                <p>{team.length > 0 ? team.map((m) => m.name).join(', ') : '아직 없음'}</p>

                {d.id === 'secretary' && <SecretaryChat />}

                {team.length > 0 && (
                  <Link href={`/dept/${d.id}`} className="enter">
                    부서로 들어가기 →
                  </Link>
                )}

                {d.id !== 'secretary' && team.length === 0 && (
                  <div className="chat">팀원이 배치되면 여기서 일을 시킬 수 있어요</div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
