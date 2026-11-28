'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTime, useApi } from '../core/client';
import { DEFAULT_RANKING } from '../capabilities.js';
import RankingPicker, { RunRankingEditor } from './RankingPicker';
import { ResearchProgress, ResearchTable } from './ResearchTable';
import { useResearchRunner } from './useResearchRunner';

const STATUS_LABELS = { ready: '대기', running: '조사 중', done: '완료' };

export default function ResearchConsole() {
  const [selected, setSelected] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <KeyPanel />
      <NewRun
        onCreated={(id) => {
          setSelected(id);
          setRefreshKey((n) => n + 1);
        }}
      />
      {selected && <RunView key={selected} runId={selected} autoStart />}
      <RunList refreshKey={refreshKey} selected={selected} onSelect={setSelected} />
    </>
  );
}

function KeyPanel() {
  const api = useApi();
  const [status, setStatus] = useState(null);
  const [test, setTest] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/research/keys')
      .then(setStatus)
      .catch((err) => setError(err.message));
  }, [api]);

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      setTest(await api('/api/research/keys', { method: 'POST', body: '{}' }));
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="panel">
      <h2>API 키 상태</h2>
      <p className="hint">키 값은 보여 주지 않고 들어 있는지만 확인해요. 키는 Vercel 환경변수에만 넣어요.</p>
      {error && <p className="msg error">{error}</p>}
      {status && (
        <ul className="hint" style={{ paddingLeft: 18 }}>
          {status.keys.map((k) => (
            <li key={k.name}>
              {k.set ? '✅' : '⬜'} <code>{k.name}</code> — {k.label}
            </li>
          ))}
          {status.legacy && <li>예전 개발자센터 키 사용 중 (NAVER_API_LEGACY=true)</li>}
        </ul>
      )}
      <button type="button" className="secondary" onClick={runTest} disabled={testing || !status}>
        {testing ? '테스트 중…' : "연결 테스트 ('날씨' 1개)"}
      </button>
      {test && (
        <ul className="hint" style={{ paddingLeft: 18 }}>
          {[
            ['검색광고', test.searchad],
            ['데이터랩', test.datalab],
            ['블로그 검색', test.blog],
          ].map(([name, r]) => (
            <li key={name}>
              {r.ok ? '✅' : '❌'} {name}: {r.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewRun({ onCreated }) {
  const api = useApi();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [ranking, setRanking] = useState(DEFAULT_RANKING);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/research/runs', {
        method: 'POST',
        body: JSON.stringify({ title, keywordsText: text, ranking }),
      });
      setText('');
      onCreated(data.run.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <details>
        <summary>직접 조사하기</summary>
        <form className="ask" onSubmit={submit}>
          <input placeholder="조사 제목 (예: 학원 운영 반복 업무)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            rows={6}
            placeholder={'키워드를 한 줄에 하나씩 (최대 200개)\n학원 출결 관리\n학원 문자 발송'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <RankingPicker value={ranking} onChange={setRanking} disabled={busy} />
          <button type="submit" disabled={busy || !title.trim() || !text.trim()}>
            {busy ? '준비 중…' : '조사 시작'}
          </button>
          {error && <p className="msg error">{error}</p>}
        </form>
      </details>
    </section>
  );
}

function RunView({ runId, autoStart = false }) {
  const { run, running, error, start, stop, applyRanking } = useResearchRunner(runId);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (autoStart && run && run.status !== 'done' && !started) {
      setStarted(true);
      start();
    }
  }, [autoStart, run, start, started]);

  if (!run) return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  return (
    <section className="panel">
      <h2>{run.title}</h2>
      <ResearchProgress run={run} />
      {run.status !== 'done' && (
        <button type="button" className={running ? 'secondary' : ''} onClick={running ? stop : start}>
          {running ? '멈추기' : '이어서 조사'}
        </button>
      )}
      {error && <p className="msg error">{error}</p>}
      <ResearchTable run={run} />
      <RunRankingEditor run={run} onApply={applyRanking} disabled={running} />
    </section>
  );
}

function RunList({ refreshKey, selected, onSelect }) {
  const api = useApi();
  const [runs, setRuns] = useState(null);

  const load = useCallback(() => {
    api('/api/research/runs')
      .then((d) => setRuns(d.runs))
      .catch(() => setRuns([]));
  }, [api]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  return (
    <section className="panel">
      <h2>조사 기록</h2>
      {!runs && <p className="hint">불러오는 중…</p>}
      {runs?.length === 0 && <p className="hint">아직 조사한 적이 없어요.</p>}
      <div className="member-list">
        {runs?.map((r) => (
          <button
            key={r.id}
            type="button"
            className="member-card"
            style={{ textAlign: 'left', font: 'inherit', cursor: 'pointer', outline: r.id === selected ? '2px solid #111' : 'none' }}
            onClick={() => onSelect(r.id)}
          >
            <span className="member-card-top">
              <span className="member-name">{r.title}</span>
              <span className="chip">{STATUS_LABELS[r.status] || r.status}</span>
            </span>
            <span className="hint" style={{ display: 'block' }}>
              {r.done}/{r.total}개 · {r.requestedBy?.module === 'marketing' ? '마케팅사업부' : '직접'} · {formatTime(r.at)}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
