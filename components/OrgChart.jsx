'use client';

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
        return (
          <article key={d.id} className="dept">
            <button
              type="button"
              className="dept-head"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : d.id)}
            >
              <span>
                <span className="dept-name">{d.name}</span>
                <span className="dept-code">{d.code}</span>
              </span>
              <span className="badge">
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

                <h3>배치된 AI</h3>
                <p>{d.members.length > 0 ? `${d.members.length}명` : '아직 없음'}</p>

                {d.id === 'secretary' ? (
                  <SecretaryChat />
                ) : (
                  <div className="chat">
                    AI 대화가 여기에 실시간으로 표시됩니다 (연결 전)
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
