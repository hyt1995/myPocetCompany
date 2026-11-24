'use client';

import { useEffect, useState } from 'react';
import ChatTab from './member/ChatTab';
import LearnTab from './member/LearnTab';
import ProgramTab from './member/ProgramTab';
import StatusTab from './member/StatusTab';
import StrategyTab from './member/StrategyTab';
import { MODE_LABELS } from './format';
import { useApi } from './passcode';

const TRADING_TABS = [
  { id: 'learn', label: '학습' },
  { id: 'strategy', label: '전략' },
  { id: 'program', label: '프로그램' },
  { id: 'status', label: '현황' },
  { id: 'chat', label: '대화·지침' },
];

export default function MemberPage({ dept, memberId }) {
  const api = useApi();
  const [member, setMember] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(dept.trading ? 'learn' : 'chat');

  useEffect(() => {
    api(`/api/members/${memberId}`)
      .then((data) => setMember(data.member))
      .catch((err) => setError(err.message));
  }, [api, memberId]);

  if (!member) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  return (
    <>
      <header className="top">
        <h1>{member.name}</h1>
        <p>{member.method || member.role || dept.name}</p>
        {dept.trading && (
          <div className="chips">
            <span className="chip">{MODE_LABELS[member.mode]}</span>
            <span className="chip">
              {member.activeStrategyVersion ? `전략 v${member.activeStrategyVersion} 승인됨` : '승인된 전략 없음'}
            </span>
          </div>
        )}
      </header>

      {dept.trading && (
        <nav className="tabbar" aria-label="직원 메뉴">
          {TRADING_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={t.id === tab ? 'tab active' : 'tab'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      {tab === 'learn' && <LearnTab member={member} onGoStrategy={() => setTab('strategy')} />}
      {tab === 'strategy' && <StrategyTab member={member} onMemberChanged={setMember} />}
      {tab === 'program' && <ProgramTab member={member} onMemberChanged={setMember} />}
      {tab === 'status' && <StatusTab member={member} />}
      {tab === 'chat' && <ChatTab member={member} trading={dept.trading} onMemberChanged={setMember} />}
    </>
  );
}
