'use client';

// 회의 ①·② 시장조사: 주제 → 데이터 분석가가 후보 키워드 → 사장님이 고치고 [조사 시작]
// → 시장조사 프로그램이 숫자를 잰다 → 데이터 분석가 보고서.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { formatTime, ResearchProgress, ResearchTable, useApi, useResearchRunner } from '../core/client';

const STATUS_LABELS = { draft: '후보 작성됨', researching: '조사 시작됨', reported: '보고서 완료' };

export default function MarketResearch() {
  const api = useApi();
  const [agendas, setAgendas] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api('/api/marketing/research')
        .then((d) => setAgendas(d.agendas))
        .catch((err) => setError(err.message)),
    [api],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { agenda } = await api('/api/marketing/research', { method: 'POST', body: JSON.stringify({ topic }) });
      setTopic('');
      setAgendas((prev) => [agenda, ...(prev || [])]);
      setOpenId(agenda.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function replace(updated) {
    setAgendas((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <section className="panel">
      <div className="section-head">
        <h2>키워드 조사 (네이버 숫자)</h2>
        <Link href="/research" className="hint">
          프로그램·키 상태 →
        </Link>
      </div>
      <p className="hint">
        주제를 주면 데이터 분석가가 조사할 키워드를 고르고, 시장조사 프로그램이 네이버 숫자를 잰 뒤, 데이터 분석가가 표만
        보고 보고서를 써요.
      </p>

      <form className="ask" onSubmit={create}>
        <input
          placeholder="조사할 주제 (예: 동네 학원 원장님들의 반복 업무)"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
        />
        <button type="submit" disabled={busy || !topic.trim()}>
          {busy ? '데이터 분석가가 후보 작성 중…' : '조사 계획 만들기'}
        </button>
        {error && <p className="msg error">{error}</p>}
      </form>

      {!agendas && !error && <p className="hint">불러오는 중…</p>}
      <div className="member-list">
        {agendas?.map((a) =>
          a.id === openId ? (
            <Agenda key={a.id} agenda={a} onChange={replace} onClose={() => setOpenId(null)} />
          ) : (
            <button key={a.id} type="button" className="member-card" style={ROW_BUTTON} onClick={() => setOpenId(a.id)}>
              <span className="member-card-top">
                <span className="member-name">{a.topic}</span>
                <span className="chip">{STATUS_LABELS[a.status] || a.status}</span>
              </span>
              <span className="hint" style={{ display: 'block' }}>
                키워드 {a.candidates.length}개 · {formatTime(a.at)}
              </span>
            </button>
          ),
        )}
      </div>
    </section>
  );
}

const ROW_BUTTON = { textAlign: 'left', font: 'inherit', cursor: 'pointer', width: '100%' };

function Agenda({ agenda, onChange, onClose }) {
  const api = useApi();
  const [text, setText] = useState(agenda.candidates.join('\n'));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  async function call(label, url, options) {
    setBusy(label);
    setError('');
    try {
      const data = await api(url, options);
      onChange(data.agenda);
      return data.agenda;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy('');
    }
  }

  const count = text.split(/[\n,]/).filter((s) => s.trim()).length;

  return (
    <div className="member-card">
      <div className="member-card-top">
        <span className="member-name">{agenda.topic}</span>
        <button type="button" className="secondary" onClick={onClose}>
          접기
        </button>
      </div>

      {agenda.status === 'draft' && (
        <div className="ask">
          <p className="hint">
            데이터 분석가가 고른 조사 키워드예요. 빼거나 더해서 고친 뒤 [조사 시작]을 누르세요. (한 줄에 하나, 지금 {count}개)
          </p>
          {agenda.dropped.length > 0 && (
            <p className="hint">형식이 안 맞아 뺀 후보: {agenda.dropped.slice(0, 8).join(', ')}</p>
          )}
          <textarea rows={12} value={text} onChange={(e) => setText(e.target.value)} />
          <button
            type="button"
            disabled={Boolean(busy) || count === 0}
            onClick={() =>
              call('start', `/api/marketing/research/${agenda.id}`, {
                method: 'PUT',
                body: JSON.stringify({ keywordsText: text }),
              })
            }
          >
            {busy === 'start' ? '준비 중…' : `조사 시작 (${count}개)`}
          </button>
        </div>
      )}

      {agenda.runId && (
        <RunSection
          runId={agenda.runId}
          autoStart={agenda.status === 'researching'}
          canReport={!busy}
          hasReport={Boolean(agenda.report)}
          reporting={busy === 'report'}
          onReport={() => call('report', `/api/marketing/research/${agenda.id}/report`, { method: 'POST', body: '{}' })}
        />
      )}

      {agenda.report && (
        <div className="ask">
          <p className="hint">
            {agenda.report.by} 보고서 · {formatTime(agenda.report.at)}
          </p>
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.6 }}>{agenda.report.text}</div>
        </div>
      )}

      {error && <p className="msg error">{error}</p>}
    </div>
  );
}

function RunSection({ runId, autoStart, canReport, hasReport, reporting, onReport }) {
  const { run, running, error, start, stop } = useResearchRunner(runId);
  const [kicked, setKicked] = useState(false);

  useEffect(() => {
    if (autoStart && run && run.status !== 'done' && !kicked) {
      setKicked(true);
      start();
    }
  }, [autoStart, run, kicked, start]);

  if (!run) return error ? <p className="msg error">{error}</p> : <p className="hint">조사 불러오는 중…</p>;

  return (
    <div className="ask">
      <ResearchProgress run={run} />
      {run.status !== 'done' && (
        <button type="button" className={running ? 'secondary' : ''} onClick={running ? stop : start}>
          {running ? '멈추기' : '이어서 조사'}
        </button>
      )}
      {error && <p className="msg error">{error}</p>}
      <ResearchTable run={run} initialLimit={15} />
      {run.status === 'done' && (
        <button
          type="button"
          disabled={!canReport}
          onClick={() => {
            if (!hasReport || window.confirm('보고서를 다시 받을까요? (AI 비용이 한 번 더 들어요)')) onReport();
          }}
        >
          {reporting ? '데이터 분석가가 보고서 작성 중…' : hasReport ? '보고서 다시 받기' : '데이터 분석가 보고서 받기'}
        </button>
      )}
    </div>
  );
}
