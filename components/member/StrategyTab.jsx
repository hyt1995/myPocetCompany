'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BEHAVIOR, CANNOT, describeRules, INDICATORS } from '../../lib/capabilities';
import { describeSchedule } from '../../lib/schedule';
import { formatCost, formatTime } from '../format';
import { useApi } from '../passcode';

const STATUS_LABELS = { draft: '초안', approved: '승인됨', archived: '보관', not_executable: '실행 불가' };

// 전략 탭: 요청·학습 자료로 전략 만들기 → 실행 가능 여부 확인 → 버전별 보기 → 승인
// "프로그램이 실제로 하는 일"은 AI 설명이 아니라 lib/capabilities.js 가 규칙에서 바로 만든다.
export default function StrategyTab({ member, onMemberChanged }) {
  const api = useApi();
  const [strategies, setStrategies] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const formRef = useRef(null);

  const load = useCallback(() => {
    return api(`/api/members/${member.id}/strategies`)
      .then((d) => setStrategies(d.strategies || []))
      .catch((err) => setError(err.message));
  }, [api, member.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const d = await api(`/api/members/${member.id}/strategies`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      setStrategies((prev) => [d.strategy, ...prev]);
      if (d.strategy.status !== 'not_executable') setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // 실행 불가 카드의 대안을 요청 칸에 붙여 넣는다. 사장님이 고쳐서 다시 만든다.
  function applyAlternative(s, u) {
    const base = (s.note || '').trim();
    setNote(`${base}${base ? '\n\n' : ''}[변경] ${u.request} → ${u.alternative}`);
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  async function approve(s) {
    const plan = describeRules(s.rules)
      .map((sec) => `■ ${sec.title}\n${sec.items.join('\n')}`)
      .join('\n\n');
    const asked = s.note ? `요청: ${s.note}\n\n` : '';
    if (
      !window.confirm(
        `v${s.version} 전략을 승인할까요?\n\n${asked}프로그램이 실제로 하는 일:\n${plan}\n\n요청한 내용과 같을 때만 승인하세요.`,
      )
    ) {
      return;
    }
    setError('');
    try {
      await api(`/api/members/${member.id}/strategies/v${s.version}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'approve' }),
      });
      onMemberChanged({ ...member, activeStrategyVersion: s.version });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function applySchedule(schedule) {
    setError('');
    setInfo('');
    try {
      const d = await api(`/api/members/${member.id}`, { method: 'PUT', body: JSON.stringify({ schedule }) });
      onMemberChanged({ ...member, ...(d.member || {}), schedule });
      setInfo(`스케줄을 '${describeSchedule(schedule)}'로 바꿨어요. 자동 실행이 켜져 있어야 그 시각에 돌아가요.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <section className="panel" ref={formRef}>
        <h2>전략 만들기</h2>
        <p className="hint">
          요청과 학습 자료를 읽고, 노트북 프로그램이 그대로 실행할 수 있는지 먼저 확인한 뒤 전략을 만들어요. 실행할 수 없는
          부분이 있으면 바꿔 넣지 않고 &apos;실행 불가&apos;로 알려 드려요. 고성능 모델이라 10~40초 걸려요.
        </p>
        <form onSubmit={generate} className="ask">
          <textarea
            rows={4}
            placeholder="요청 예: BTCUSDT, ETHUSDT 일봉 기준 전날 -10% 이하면 20 USDT 매수, 익절 5%, 손절 5%"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? '확인하고 만드는 중…' : strategies.length ? '새 버전 만들기' : '전략 만들기'}
          </button>
        </form>
        {error && <p className="msg error">{error}</p>}
        {info && <p className="msg">{info}</p>}
        <CapabilityList />
      </section>

      {strategies.length === 0 && (
        <section className="panel">
          <p className="hint">아직 전략이 없어요.</p>
        </section>
      )}

      {strategies.map((s) => (
        <StrategyCard
          key={s.id}
          strategy={s}
          onApprove={() => approve(s)}
          onUseAlternative={(u) => applyAlternative(s, u)}
          onApplySchedule={applySchedule}
        />
      ))}
    </>
  );
}

function CapabilityList() {
  return (
    <details className="caps">
      <summary className="hint">노트북 프로그램이 할 수 있는 일 · 못 하는 일</summary>
      <h3 className="sub">할 수 있는 일</h3>
      <ul>
        <li>바이낸스 현물 USDT 종목 (고정 목록, 최대 20개)</li>
        <li>봉: 1분 · 5분 · 15분 · 1시간 · 4시간 · 일봉 중 하나</li>
        <li>
          지표:{' '}
          {Object.values(INDICATORS)
            .map((d) => d.label(Object.fromEntries(Object.entries(d.params).map(([k, s]) => [k, s.default ?? 'N']))))
            .join(' · ')}
        </li>
        <li>비교: &gt; ≥ &lt; ≤, 상향·하향 돌파 / 조건 모두 또는 하나라도</li>
        <li>청산: 손절(필수) · 익절 · 최대 보유시간 · 청산 조건 → 전량 시장가 매도</li>
        <li>1회 매수 금액 USDT 고정, 동시 보유 한도</li>
      </ul>
      <h3 className="sub">동작 방식</h3>
      <ul>
        {BEHAVIOR.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <h3 className="sub">못 하는 일 (요청하면 실행 불가로 알려 드려요)</h3>
      <ul>
        {CANNOT.map((c) => (
          <li key={c.what}>
            {c.what} <span className="hint">→ {c.alternative}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function StrategyCard({ strategy: s, onApprove, onUseAlternative, onApplySchedule }) {
  const blocked = s.status === 'not_executable';
  const legacy = s.status === 'draft' && s.capabilitiesVersion == null;
  const hasErrors = s.validationErrors?.length > 0;
  const plan = s.rules ? describeRules(s.rules) : [];

  return (
    <section className={`panel strategy ${s.status}`}>
      <div className="section-head">
        <h2>
          v{s.version} · {s.name}
        </h2>
        <span className={`chip ${s.status === 'approved' ? 'chip-on' : ''} ${blocked ? 'chip-bad' : ''}`}>
          {STATUS_LABELS[s.status] || s.status}
        </span>
      </div>

      {s.note && (
        <>
          <h3 className="sub">사장님 요청</h3>
          <p className="result-output">{s.note}</p>
        </>
      )}
      {s.understood && (
        <>
          <h3 className="sub">직원이 이해한 내용</h3>
          <p className="result-output">{s.understood}</p>
        </>
      )}

      {blocked && (
        <div className="msg error">
          이 요청은 노트북 프로그램으로 그대로 실행할 수 없어서 전략을 만들지 않았어요.
          {s.feasibility === 'partial' && ' (일부만 가능)'}
          <ul className="unsupported">
            {(s.unsupported || []).map((u, i) => (
              <li key={i}>
                <b>{u.request}</b>
                <br />
                이유: {u.reason}
                {u.alternative && (
                  <>
                    <br />
                    대안: {u.alternative}{' '}
                    <button type="button" className="link-button" onClick={() => onUseAlternative(u)}>
                      이 대안으로 요청 고치기
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {legacy && (
        <p className="msg error">
          실행 가능 여부를 확인하기 전 방식으로 만든 전략이라 승인할 수 없어요. 새 버전을 만들어 주세요.
        </p>
      )}

      {hasErrors && (
        <div className="msg error">
          프로그램 규칙 검사를 통과하지 못해 승인할 수 없어요. 새 버전을 만들어 주세요.
          <ul>
            {s.validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {plan.length > 0 && (
        <div className="plan">
          <h3 className="sub">프로그램이 실제로 하는 일 (규칙에서 바로 만든 설명)</h3>
          {plan.map((sec) => (
            <div key={sec.title} className="plan-section">
              <b>{sec.title}</b>
              <ul>
                {sec.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {s.assumptions?.length > 0 && (
        <div className="msg">
          요청에 없어서 직원이 정한 값이에요. 다르면 요청에 적어서 새 버전을 만드세요.
          <ul>
            {s.assumptions.map((a, i) => (
              <li key={i}>
                {a.item}: <b>{a.value}</b>
                {a.why && <span className="hint"> — {a.why}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {s.suggestedSchedule && !blocked && (
        <div className="msg">
          추천 확인 시각: <b>{describeSchedule(s.suggestedSchedule)}</b>
          <div className="result-actions">
            <button type="button" onClick={() => onApplySchedule(s.suggestedSchedule)}>
              프로그램 스케줄을 이걸로 바꾸기
            </button>
          </div>
        </div>
      )}

      <details>
        <summary className="hint">근거·위험·원본 보기</summary>
        {s.summary && (
          <>
            <h3 className="sub">직원 요약</h3>
            <p className="result-output">{s.summary}</p>
          </>
        )}
        <h3 className="sub">근거</h3>
        <p className="result-output">{s.rationale || '-'}</p>
        <h3 className="sub">위험 요소</h3>
        <ul>
          {(s.risks || []).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {s.rules && (
          <>
            <h3 className="sub">규칙 원본 (매매 프로그램이 읽는 형식)</h3>
            <pre className="code">{JSON.stringify(s.rules, null, 2)}</pre>
          </>
        )}
      </details>

      <p className="result-meta">
        {formatTime(s.at)} · {s.model} · {formatCost(s.costUsd)}
        {s.approvedAt && ` · 승인 ${formatTime(s.approvedAt)}`}
      </p>

      {s.status === 'draft' && !legacy && (
        <div className="result-actions">
          <button type="button" onClick={onApprove} disabled={hasErrors}>
            요청과 같은지 확인하고 승인
          </button>
        </div>
      )}
    </section>
  );
}
