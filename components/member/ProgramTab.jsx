'use client';

import { useCallback, useEffect, useState } from 'react';
import { describeSchedule } from '../../lib/schedule';
import { COMMAND_LABELS, COMMAND_STATUS_LABELS, formatTime } from '../format';
import { useApi } from '../passcode';

// 프로그램 탭: 모드·자동 실행 설정, [지금 실행], 모의 매수/매도, 실제 매수/매도(사장님만), 최근 명령
export default function ProgramTab({ member, onMemberChanged }) {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api(`/api/members/${member.id}/program`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [api, member.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(body) {
    setError('');
    try {
      await api(`/api/members/${member.id}/commands`, { method: 'POST', body: JSON.stringify(body) });
      await load();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  if (!data) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  const rules = data.strategy?.rules;
  const defaultSymbol = rules?.symbols?.[0] || 'BTCUSDT';
  const defaultAmount = rules?.position?.quoteAmountUsdt || 100;

  return (
    <>
      <section className={data.worker?.online ? 'panel worker on' : 'panel worker'}>
        <span className="dot" aria-hidden="true" />
        <div>
          <strong>노트북 매매 프로그램 {data.worker?.online ? '연결됨' : '연결 안 됨'}</strong>
          <p className="hint">
            {data.worker?.online
              ? '버튼을 누르면 바로 처리돼요.'
              : '지금 누른 명령은 저장되고, 프로그램이 연결되면 처리돼요. (실제 주문은 5분 안에 처리되지 않으면 무효)'}
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>사용 중인 전략</h2>
        {data.strategy ? (
          <>
            <p className="result-output">
              v{data.strategy.version} · {data.strategy.name}
            </p>
            <p className="hint">{data.strategy.summary}</p>
          </>
        ) : (
          <p className="hint">승인된 전략이 없어요. 전략 탭에서 승인하면 [지금 실행]과 자동 실행을 쓸 수 있어요.</p>
        )}
      </section>

      <ProgramSettings
        member={member}
        program={data.program}
        strategyEvery={rules?.checkEveryMinutes}
        workerOnline={Boolean(data.worker?.online)}
        api={api}
        onSaved={(m) => {
          onMemberChanged(m);
          load();
        }}
      />

      <section className="panel">
        <h2>지금 실행</h2>
        <p className="hint">승인된 전략 조건을 지금 한 번 확인하고, 조건이 맞으면 모의매매해요.</p>
        <div className="result-actions">
          <button type="button" disabled={!data.strategy} onClick={() => send({ type: 'run' })}>
            지금 실행
          </button>
        </div>
      </section>

      <TradeForm
        title="모의 매매"
        hint="가상 자금으로 지금 가격에 사고팔아요. 실제 돈은 쓰지 않아요."
        defaultSymbol={defaultSymbol}
        defaultAmount={defaultAmount}
        onBuy={(f) => send({ type: 'paper_buy', symbol: f.symbol, quoteAmountUsdt: Number(f.amount) })}
        onSell={(f) => send({ type: 'paper_sell', symbol: f.symbol, quantity: f.quantity || 'all' })}
      />

      <TradeForm
        live
        title="실제 매매 (실제 돈)"
        hint={
          data.liveReady
            ? '누르면 확인 후 서명된 실제 주문이 노트북 프로그램으로 가요. 노트북 쪽 한도와 실전 허용 설정도 통과해야 체결돼요.'
            : 'Vercel에 COMMAND_SIGNING_SECRET 이 없어서 아직 실제 주문을 보낼 수 없어요.'
        }
        disabled={!data.liveReady}
        defaultSymbol={defaultSymbol}
        defaultAmount={defaultAmount}
        onBuy={(f) => {
          if (!window.confirm(`실제 돈으로 ${f.symbol} ${f.amount} USDT 매수 주문을 보냅니다. 계속할까요?`)) return false;
          return send({ type: 'live_buy', symbol: f.symbol, quoteAmountUsdt: Number(f.amount), confirmLive: true });
        }}
        onSell={(f) => {
          const what = f.quantity ? `${f.quantity}개` : '전량';
          if (!window.confirm(`실제 보유 중인 ${f.symbol} ${what} 매도 주문을 보냅니다. 계속할까요?`)) return false;
          return send({ type: 'live_sell', symbol: f.symbol, quantity: f.quantity || 'all', confirmLive: true });
        }}
      />

      {error && <p className="msg error">{error}</p>}

      <section className="panel">
        <div className="section-head">
          <h2>최근 명령</h2>
          <button type="button" className="link-btn" onClick={load}>
            새로고침
          </button>
        </div>
        {data.commands.length === 0 && <p className="hint">아직 명령이 없어요.</p>}
        <ul className="cmd-list">
          {data.commands.map((c) => {
            const status = c.status === 'pending' && c.expiresAt && c.expiresAt < Date.now() ? 'expired' : c.status;
            return (
              <li key={c.id} className={`cmd ${status}`}>
                <div>
                  <strong>{COMMAND_LABELS[c.type]}</strong>{' '}
                  {c.symbol && (
                    <span className="hint">
                      {c.symbol} {c.quoteAmountUsdt ? `${c.quoteAmountUsdt} USDT` : c.sellAll ? '전량' : c.quantity}
                    </span>
                  )}
                  <p className="hint">
                    {formatTime(c.createdAt)}
                    {c.error && ` · ${c.error}`}
                    {c.result?.message && ` · ${c.result.message}`}
                  </p>
                </div>
                <span className="chip">{COMMAND_STATUS_LABELS[status] || status}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function ProgramSettings({ member, program, strategyEvery, workerOnline, api, onSaved }) {
  const initial = () => ({
    mode: program.mode,
    autoRun: program.autoRun,
    paperCapitalUsdt: String(program.paperCapitalUsdt),
    scheduleType: program.schedule?.type || 'strategy',
    minutes: String(program.schedule?.minutes || 60),
    times: (program.schedule?.times || ['09:00', '21:00']).join(', '),
  });
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const schedule =
    form.scheduleType === 'interval'
      ? { type: 'interval', minutes: Number(form.minutes) }
      : form.scheduleType === 'times'
        ? { type: 'times', times: form.times }
        : { type: 'strategy' };
  const base = initial();
  const changed = Object.keys(base).some((k) => String(form[k]) !== String(base[k]));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setNotice('');
    try {
      const d = await api(`/api/members/${member.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          mode: form.mode,
          autoRun: form.autoRun,
          paperCapitalUsdt: Number(form.paperCapitalUsdt),
          schedule,
        }),
      });
      onSaved(d.member);
      setNotice(`저장됨 · ${formatTime(Date.now())}${workerOnline ? ' · 노트북 프로그램이 바로 반영해요' : ''}`);
    } catch (err) {
      setNotice(err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const active = program.mode === 'paper' && program.autoRun && program.activeStrategyVersion;

  return (
    <section className="panel">
      <h2>프로그램 설정</h2>
      <p className="hint">
        {active
          ? `자동 실행 중 · ${describeSchedule(program.schedule, strategyEvery)}${
              program.nextRunAt && workerOnline ? ` · 다음 ${formatTime(program.nextRunAt)}` : ''
            }`
          : '자동 실행 꺼짐 (모드 \'모의\' + 자동 실행 켬 + 승인된 전략이 있어야 돌아가요)'}
      </p>
      <form onSubmit={save} className="ask">
        <label>
          모드
          <select value={form.mode} onChange={set('mode')}>
            <option value="stopped">정지</option>
            <option value="paper">모의매매</option>
          </select>
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={form.autoRun}
            onChange={(e) => setForm({ ...form, autoRun: e.target.checked })}
          />
          자동 실행 (아래 스케줄대로 노트북 프로그램이 알아서 실행)
        </label>
        <label>
          스케줄
          <select value={form.scheduleType} onChange={set('scheduleType')}>
            <option value="strategy">전략 기본 주기{strategyEvery ? ` (${strategyEvery}분마다)` : ''}</option>
            <option value="interval">N분마다</option>
            <option value="times">매일 정해진 시각</option>
          </select>
        </label>
        {form.scheduleType === 'interval' && (
          <label>
            몇 분마다 (1~1440, 한국 시간 정각 기준으로 맞춰요)
            <input type="number" inputMode="numeric" min="1" max="1440" value={form.minutes} onChange={set('minutes')} />
          </label>
        )}
        {form.scheduleType === 'times' && (
          <label>
            시각 (한국 시간, 쉼표로 구분)
            <input value={form.times} onChange={set('times')} placeholder="09:00, 21:00" />
          </label>
        )}
        <label>
          모의 시작 자금 (USDT)
          <input type="number" inputMode="decimal" min="1" value={form.paperCapitalUsdt} onChange={set('paperCapitalUsdt')} />
        </label>
        <p className="hint">
          자동 실행은 모의매매만 해요. 실제 돈은 아래 [실제 매수/매도] 버튼이나 채팅 확인 카드로만 움직여요.
          채팅에서 "스케줄 1시간마다로 바꿔"라고 해도 돼요.
        </p>
        <button type="submit" disabled={saving || !changed}>
          {saving ? '저장 중…' : '설정 저장'}
        </button>
        {notice && <p className="hint">{notice}</p>}
      </form>
    </section>
  );
}

function TradeForm({ title, hint, live = false, disabled = false, defaultSymbol, defaultAmount, onBuy, onSell }) {
  const [form, setForm] = useState({ symbol: defaultSymbol, amount: String(defaultAmount), quantity: '' });
  const [busy, setBusy] = useState(false);

  async function run(fn) {
    setBusy(true);
    try {
      await fn({ ...form, symbol: form.symbol.trim().toUpperCase() });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={live ? 'panel danger' : 'panel'}>
      <h2>{title}</h2>
      <p className="hint">{hint}</p>
      <div className="ask">
        <label>
          종목
          <input
            value={form.symbol}
            onChange={(e) => setForm({ ...form, symbol: e.target.value })}
            autoCapitalize="characters"
            disabled={disabled}
          />
        </label>
        <div className="row">
          <label>
            매수 금액 (USDT)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              disabled={disabled}
            />
          </label>
          <label>
            매도 수량 (비우면 전량)
            <input
              type="number"
              inputMode="decimal"
              min="0"
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              disabled={disabled}
            />
          </label>
        </div>
        <div className="result-actions">
          <button
            type="button"
            className={live ? 'live' : ''}
            disabled={disabled || busy || !(Number(form.amount) > 0)}
            onClick={() => run(onBuy)}
          >
            {live ? '실제 매수' : '모의 매수'}
          </button>
          <button
            type="button"
            className={live ? 'live secondary' : 'secondary'}
            disabled={disabled || busy}
            onClick={() => run(onSell)}
          >
            {live ? '실제 매도' : '모의 매도'}
          </button>
        </div>
      </div>
    </section>
  );
}
