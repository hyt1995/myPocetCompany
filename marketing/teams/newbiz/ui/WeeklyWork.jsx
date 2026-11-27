'use client';

// 신사업팀 주간 업무 화면. 단계 카드를 위에서부터 누르거나 [이번 주 한 번에 진행]을 누른다.
// 화면이 단계를 하나씩 서버에 부탁한다 (서버는 혼자 돌지 않는다). 진행 중에는 화면을 켜 둔다.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatCost, formatTime, Markdown, useApi } from '../../../core/client';
import { blockedReason, MAX_ROUNDS, nextSpeaker, OWNER_DECISIONS, STEPS } from '../steps';
import { shortRange, weekKeyOf } from '../week';

const STATUS = {
  collected: { label: '자료 모음 · 글쓰기 전', cls: 'chip' },
  done: { label: '완료', cls: 'chip chip-on' },
  skipped: { label: '건너뜀', cls: 'chip' },
  running: { label: '진행 중', cls: 'chip' },
};
const WHO = { planner: 'mkt-planner', analyst: 'mkt-analyst', lead: 'mkt-lead' };
const MAX_MEETING_CALLS = MAX_ROUNDS * 3;

export default function WeeklyWork({ members, initialWeek }) {
  const api = useApi();
  const [weekKey, setWeekKey] = useState(initialWeek || weekKeyOf());
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ownerNote, setOwnerNote] = useState('');

  const load = useCallback(
    (key) => {
      setError('');
      return api(`/api/marketing/teams/newbiz/weeks/${key}`)
        .then((d) => {
          setData(d);
          setOwnerNote(d.week.steps.directive?.ownerNote || '');
        })
        .catch((err) => setError(err.message));
    },
    [api],
  );

  useEffect(() => {
    setData(null);
    load(weekKey);
  }, [load, weekKey]);

  const nameOf = (id) => members[id]?.name || id;

  async function call(stepId, action, extra = {}) {
    const d = await api(`/api/marketing/teams/newbiz/weeks/${weekKey}/steps/${stepId}`, {
      method: 'POST',
      body: JSON.stringify({ action, ...extra }),
    });
    setData(d);
    return d.week;
  }

  // 한 단계를 끝까지: (자료 모으기) → 글쓰기, 회의는 끝날 때까지 발언
  async function runOne(step, week) {
    let w = week;
    if (step.id === 'meeting') {
      let restart = w.steps.meeting?.status === 'done';
      for (let i = 0; i < MAX_MEETING_CALLS; i += 1) {
        const sp = restart ? { round: 1, who: 'planner' } : nextSpeaker(w.steps.meeting);
        if (!sp) break;
        setBusy(`회의 ${sp.round}라운드: ${nameOf(WHO[sp.who])} 발언 중… (30초~1분)`);
        w = await call('meeting', 'turn', { restart });
        restart = false;
        if (w.steps.meeting?.status === 'done') break;
      }
      return w;
    }
    if (step.phases.includes('collect') && w.steps[step.id]?.status !== 'collected') {
      setBusy(`${step.label}: 웹에서 자료 모으는 중… (1~2분)`);
      w = await call(step.id, 'collect', { ownerNote });
    }
    setBusy(`${step.label}: ${nameOf(step.who)} 쓰는 중… (1~2분)`);
    return call(step.id, 'write', { ownerNote });
  }

  async function guard(fn) {
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  const runStep = (step) =>
    guard(async () => {
      await runOne(step, data.week);
    });

  const runAll = () =>
    guard(async () => {
      if (!window.confirm('이번 주 업무를 처음부터 끝까지 진행할까요?\n약 5~10분, AI 비용 약 $0.6~1 (화면을 켜 두세요)')) return;
      let w = data.week;
      for (const step of STEPS) {
        const st = w.steps[step.id]?.status;
        if (st === 'done' || st === 'skipped' || blockedReason(step.id, w)) continue;
        w = await runOne(step, w);
      }
    });

  const decide = (decision, memo) =>
    guard(async () => {
      setBusy('결정을 저장하는 중…');
      await call('report', 'decide', { decision, memo });
    });

  const refLinks = useMemo(() => {
    const out = {};
    for (const s of Object.values(data?.week.steps || {})) for (const src of s.sources || []) out[src.ref] = src.url;
    return out;
  }, [data]);

  if (!data) return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;

  const { week, spend, currentWeek } = data;
  const r = week.range;
  const doneCount = STEPS.filter((s) => ['done', 'skipped'].includes(week.steps[s.id]?.status)).length;

  return (
    <section className="panel">
      <div className="section-head">
        <h2>주간 업무</h2>
        <span className="hint">
          {doneCount}/{STEPS.length} 완료
        </span>
      </div>

      <div className="row" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <button type="button" className="secondary" disabled={!!busy} onClick={() => setWeekKey(r.prevKey)}>
          ◀ 지난주
        </button>
        <strong>
          {week.weekKey} ({shortRange(r.monday, r.sunday)})
        </strong>
        <button
          type="button"
          className="secondary"
          disabled={!!busy || week.weekKey >= currentWeek}
          onClick={() => setWeekKey(r.nextKey)}
        >
          다음 주 ▶
        </button>
      </div>

      {spend && (
        <p className="hint">
          오늘 AI 비용 ${spend.spentUsd.toFixed(3)} / 하루 한도 ${spend.limitUsd}
        </p>
      )}

      <button type="button" disabled={!!busy} onClick={runAll} style={{ width: '100%', marginTop: 8 }}>
        {doneCount === STEPS.length ? '이번 주 업무 끝 ✓' : '이번 주 한 번에 진행'}
      </button>
      {busy && <p className="msg">{busy}</p>}
      {error && <p className="msg error">{error}</p>}

      <div className="member-list" style={{ marginTop: 12 }}>
        {STEPS.map((step, i) => (
          <StepCard
            key={step.id}
            n={i + 1}
            step={step}
            week={week}
            busy={!!busy}
            who={step.who === 'team' ? '팀 전체' : nameOf(step.who)}
            refLinks={refLinks}
            ownerNote={ownerNote}
            setOwnerNote={setOwnerNote}
            onRun={() => runStep(step)}
            onDecide={decide}
          />
        ))}
      </div>
    </section>
  );
}

function StepCard({ n, step, week, busy, who, refLinks, ownerNote, setOwnerNote, onRun, onDecide }) {
  const s = week.steps[step.id] || {};
  const blocked = blockedReason(step.id, week);
  const status = STATUS[s.status];
  const cost = step.id === 'meeting' ? (s.turns || []).reduce((a, t) => a + (t.costUsd || 0), 0) : s.costUsd ?? s.collectCostUsd;

  let runLabel = '실행';
  if (s.status === 'collected') runLabel = '이어서 쓰기';
  else if (s.status === 'done') runLabel = '다시 하기';
  else if (step.id === 'meeting' && s.status === 'running') runLabel = '회의 계속';

  function run() {
    if (s.status === 'done' && !window.confirm(`'${step.label}'을(를) 다시 할까요? 지금 결과는 새 결과로 바뀌어요.`)) return;
    onRun();
  }

  return (
    <div className="member-card">
      <div className="member-card-top">
        <span className="member-name">
          {n}. {step.label}
        </span>
        {status ? <span className={status.cls}>{status.label}</span> : <span className="chip">대기</span>}
      </div>
      <p className="hint">
        {who} · {step.desc}
      </p>

      {step.id === 'directive' && s.status !== 'done' && (
        <label className="ask">
          <span className="hint">사장님(감사) 지시 (선택) — 팀장이 반드시 반영해요</span>
          <textarea
            rows={3}
            placeholder="예: 일본 선크림 말고 동남아 쪽을 더 봐 줘 / 단가 5만 원 이상만"
            value={ownerNote}
            onChange={(e) => setOwnerNote(e.target.value)}
          />
        </label>
      )}

      <div className="chips">
        {s.decision && <span className="chip">결정: {s.decision}</span>}
        {s.verdict && <span className="chip">판정: {s.verdict}</span>}
        {s.searches ? <span className="chip">웹 검색 {s.searches}번</span> : null}
        {s.sources?.length ? <span className="chip">출처 {s.sources.length}개</span> : null}
        {cost ? <span className="chip">{formatCost(cost)}</span> : null}
        {(s.writtenAt || s.collectedAt || s.endedAt) && (
          <span className="chip">{formatTime(s.writtenAt || s.endedAt || s.collectedAt)}</span>
        )}
      </div>

      {s.invalidRefs?.length > 0 && (
        <p className="msg error">출처 목록에 없는 번호 {s.invalidRefs.join(', ')} 를 '[출처 없음]'으로 바꿨어요. 그 부분은 믿지 마세요.</p>
      )}

      {blocked && s.status !== 'skipped' ? (
        <p className="hint">{blocked}</p>
      ) : (
        s.status !== 'skipped' && (
          <div className="row">
            <button type="button" disabled={busy} onClick={run}>
              {runLabel}
            </button>
          </div>
        )
      )}

      {step.id === 'meeting' && s.turns?.length > 0 && (
        <details open={s.status !== 'done'}>
          <summary>회의록 ({s.turns.length}번 발언)</summary>
          {s.turns.map((t, i) => (
            <div key={i} className="result" style={{ marginTop: 8 }}>
              <div className="chips">
                <span className="chip">{t.round}라운드</span>
                <span className="chip">{t.name}</span>
                {t.verdict && <span className="chip chip-on">판정: {t.verdict}</span>}
              </div>
              <Markdown text={t.text} refLinks={refLinks} />
            </div>
          ))}
        </details>
      )}

      {s.text && (
        <details open={step.id === 'report'}>
          <summary>결과 보기</summary>
          <Markdown text={s.text} refLinks={refLinks} />
          {s.postId && (
            <Link href={`/board/${s.postId}`} className="enter">
              회사 게시판에서 보기 →
            </Link>
          )}
        </details>
      )}

      {s.notes && (
        <details>
          <summary>모은 자료 (웹 검색 메모)</summary>
          <p className="result-output">{s.notes}</p>
        </details>
      )}

      {s.sources?.length > 0 && (
        <details>
          <summary>출처 {s.sources.length}개</summary>
          <ol style={{ paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
            {s.sources.map((src) => (
              <li key={src.ref} style={{ wordBreak: 'break-all' }}>
                <strong>[{src.ref}]</strong>{' '}
                <a href={src.url} target="_blank" rel="noreferrer">
                  {src.title}
                </a>
              </li>
            ))}
          </ol>
        </details>
      )}

      {step.id === 'report' && s.status === 'done' && <OwnerDecision report={s} busy={busy} onDecide={onDecide} />}
    </div>
  );
}

function OwnerDecision({ report, busy, onDecide }) {
  const [memo, setMemo] = useState(report.ownerDecision?.memo || '');
  const current = report.ownerDecision;
  return (
    <div className="ask" style={{ marginTop: 10 }}>
      <strong>사장님(감사) 결정</strong>
      {current && (
        <p className="hint">
          {OWNER_DECISIONS[current.decision]} · {formatTime(current.at)}
          {current.memo ? ` · ${current.memo}` : ''}
        </p>
      )}
      <textarea rows={2} placeholder="메모 (선택): 이유, 다음 주에 볼 것" value={memo} onChange={(e) => setMemo(e.target.value)} />
      <div className="row">
        {Object.entries(OWNER_DECISIONS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={key === 'approve' ? '' : 'secondary'}
            disabled={busy}
            onClick={() => onDecide(key, memo)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="hint">결정은 게시판의 보고서에도 붙어요. 승인해도 밖으로 나가는 일(게시·발송·결제)은 따로 승인해야 해요.</p>
    </div>
  );
}
