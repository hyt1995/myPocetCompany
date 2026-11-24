'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCost, formatTime } from '../format';
import { useApi } from '../passcode';

const STATUS_LABELS = { draft: '초안', approved: '승인됨', archived: '보관' };

// 전략 탭: 학습 자료로 전략 만들기 → 버전별 보기 → 승인 (승인된 버전만 프로그램이 사용)
export default function StrategyTab({ member, onMemberChanged }) {
  const api = useApi();
  const [strategies, setStrategies] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

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
    try {
      const d = await api(`/api/members/${member.id}/strategies`, {
        method: 'POST',
        body: JSON.stringify({ note }),
      });
      setStrategies((prev) => [d.strategy, ...prev]);
      setNote('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function approve(s) {
    if (!window.confirm(`v${s.version} 전략을 승인할까요? 매매 프로그램은 이 버전으로만 움직여요.`)) return;
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

  return (
    <>
      <section className="panel">
        <h2>전략 만들기</h2>
        <p className="hint">
          학습 자료를 모두 읽고 매매 조건을 정해진 형식으로 만들어요. 고성능 모델을 써서 10~40초 정도 걸려요.
          만들 때마다 새 버전으로 저장되고, 승인한 버전만 프로그램이 써요.
        </p>
        <form onSubmit={generate} className="ask">
          <textarea
            rows={3}
            placeholder="추가 요청 (선택) 예: 손절은 2% 이내로, 1회 100 USDT"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <button type="submit" disabled={busy}>
            {busy ? '전략 만드는 중…' : strategies.length ? '새 버전 만들기' : '전략 만들기'}
          </button>
        </form>
        {error && <p className="msg error">{error}</p>}
      </section>

      {strategies.length === 0 && (
        <section className="panel">
          <p className="hint">아직 전략이 없어요.</p>
        </section>
      )}

      {strategies.map((s) => (
        <StrategyCard key={s.id} strategy={s} onApprove={() => approve(s)} />
      ))}
    </>
  );
}

function StrategyCard({ strategy: s, onApprove }) {
  const r = s.rules || {};
  const hasErrors = s.validationErrors?.length > 0;

  return (
    <section className={`panel strategy ${s.status}`}>
      <div className="section-head">
        <h2>
          v{s.version} · {s.name}
        </h2>
        <span className={`chip ${s.status === 'approved' ? 'chip-on' : ''}`}>{STATUS_LABELS[s.status]}</span>
      </div>
      <p className="result-output">{s.summary}</p>

      {hasErrors && (
        <div className="msg error">
          형식 오류가 있어 승인할 수 없어요. 새 버전을 만들어 주세요.
          <ul>
            {s.validationErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {s.rules && (
        <dl className="kv">
          <dt>종목</dt>
          <dd>{(r.symbols || []).join(', ') || '-'}</dd>
          <dt>봉 / 확인 주기</dt>
          <dd>
            {r.timeframe || '-'} / {r.checkEveryMinutes ? `${r.checkEveryMinutes}분마다` : '-'}
          </dd>
          <dt>진입 ({r.entry?.logic === 'any' ? '하나라도' : '모두'} 만족)</dt>
          <dd>
            <ul>
              {(r.entry?.conditions || []).map((c, i) => (
                <li key={i}>{describe(c)}</li>
              ))}
            </ul>
          </dd>
          <dt>청산</dt>
          <dd>
            손절 {r.exit?.stopLossPct ?? '-'}% · 익절 {r.exit?.takeProfitPct ?? '-'}% · 최대 보유{' '}
            {r.exit?.maxHoldHours ? `${r.exit.maxHoldHours}시간` : '-'}
            {(r.exit?.conditions || []).length > 0 && (
              <ul>
                {r.exit.conditions.map((c, i) => (
                  <li key={i}>{describe(c)}</li>
                ))}
              </ul>
            )}
          </dd>
          <dt>1회 금액 / 동시 보유</dt>
          <dd>
            {r.position?.quoteAmountUsdt ?? '-'} USDT / 최대 {r.position?.maxOpenPositions ?? 1}개
          </dd>
        </dl>
      )}

      <details>
        <summary className="hint">근거·위험·원본 보기</summary>
        <h3 className="sub">근거</h3>
        <p className="result-output">{s.rationale || '-'}</p>
        <h3 className="sub">위험 요소</h3>
        <ul>
          {(s.risks || []).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ul>
        {s.note && (
          <>
            <h3 className="sub">사장님 요청</h3>
            <p className="result-output">{s.note}</p>
          </>
        )}
        <h3 className="sub">규칙 원본 (매매 프로그램이 읽는 형식)</h3>
        <pre className="code">{JSON.stringify(s.rules, null, 2)}</pre>
      </details>

      <p className="result-meta">
        {formatTime(s.at)} · {s.model} · {formatCost(s.costUsd)}
        {s.approvedAt && ` · 승인 ${formatTime(s.approvedAt)}`}
      </p>

      {s.status === 'draft' && (
        <div className="result-actions">
          <button type="button" onClick={onApprove} disabled={hasErrors}>
            이 버전 승인
          </button>
        </div>
      )}
    </section>
  );
}

function describe(c) {
  if (c.description) return c.description;
  const fmt = (x) =>
    typeof x === 'object' && x ? `${x.indicator}(${Object.values(x.params || {}).join(',')})` : String(x);
  return `${fmt(c)} ${c.op} ${fmt(c.value)}`;
}
