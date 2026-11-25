'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatNumber, formatPct, formatTime, formatUsdt, pnlClass } from '../format';
import { useApi } from '../passcode';

const REFRESH_WAIT_MS = 4000; // 가격 갱신 명령 후 노트북이 처리할 시간을 잠깐 기다렸다가 다시 읽는다

// 현황 탭: 수익률, 보유 코인, 매매 내역 (노트북 매매 프로그램이 기록한 값)
// 탭을 열 때만 노트북에 '현재가 갱신' 명령을 한 번 보낸다. (노트북이 주기적으로 갱신하지 않는다)
export default function StatusTab({ member }) {
  const api = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const asked = useRef(false);

  const load = useCallback(() => {
    return api(`/api/members/${member.id}/portfolio`)
      .then((d) => {
        setData(d);
        return d;
      })
      .catch((err) => setError(err.message));
  }, [api, member.id]);

  const refreshPrices = useCallback(async () => {
    setRefreshing(true);
    try {
      await api(`/api/members/${member.id}/commands`, {
        method: 'POST',
        body: JSON.stringify({ type: 'refresh_prices' }),
      });
      await new Promise((r) => setTimeout(r, REFRESH_WAIT_MS));
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRefreshing(false);
    }
  }, [api, member.id, load]);

  useEffect(() => {
    load().then((d) => {
      const hasOpen = d?.positions?.some((p) => Number(p.quantity) > 0);
      if (d?.workerOnline && hasOpen && !asked.current) {
        asked.current = true;
        refreshPrices();
      }
    });
  }, [load, refreshPrices]);

  if (!data) {
    return error ? <p className="msg error">{error}</p> : <p className="hint">불러오는 중…</p>;
  }

  const open = data.positions.filter((p) => Number(p.quantity) > 0);
  const hasLive = data.stats.live.trades > 0;

  return (
    <>
      <StatsPanel title="모의매매 성적" stats={data.stats.paper} showCapital />
      {hasLive && <StatsPanel title="실전 성적" stats={data.stats.live} />}

      <section className="panel">
        <div className="section-head">
          <h2>보유 중 {open.length}개</h2>
          {data.workerOnline && open.length > 0 && (
            <button type="button" className="link-btn" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? '현재가 갱신 중…' : '현재가 갱신'}
            </button>
          )}
        </div>
        {!data.workerOnline && open.length > 0 && (
          <p className="hint">노트북 프로그램이 꺼져 있어서 현재가는 마지막으로 갱신된 값이에요.</p>
        )}
        {open.length === 0 ? (
          <p className="hint">보유 중인 코인이 없어요.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>종목</th>
                  <th>구분</th>
                  <th>수량</th>
                  <th>평균가</th>
                  <th>현재가</th>
                  <th>손익</th>
                </tr>
              </thead>
              <tbody>
                {open.map((p) => {
                  const avg = Number(p.avgPrice);
                  const last = Number(p.lastPrice) || avg;
                  const pct = avg > 0 ? ((last - avg) / avg) * 100 : null;
                  return (
                    <tr key={`${p.mode}-${p.symbol}`}>
                      <td>{p.symbol}</td>
                      <td>{p.mode === 'live' ? '실전' : '모의'}</td>
                      <td>{formatNumber(p.quantity)}</td>
                      <td>{formatNumber(avg, 4)}</td>
                      <td>{formatNumber(last, 4)}</td>
                      <td className={pnlClass(pct)}>{formatPct(pct)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>매매 내역</h2>
        {data.trades.length === 0 ? (
          <p className="hint">아직 매매 기록이 없어요. 노트북 매매 프로그램이 연결되면 여기에 쌓여요.</p>
        ) : (
          <ul className="cmd-list">
            {data.trades.map((t) => (
              <li key={t.id} className="cmd">
                <div>
                  <strong className={t.side === 'buy' ? 'up' : 'down'}>
                    {t.mode === 'live' ? '실전' : '모의'} {t.side === 'buy' ? '매수' : '매도'}
                  </strong>{' '}
                  <span className="hint">
                    {t.symbol} · {formatNumber(t.quantity)}개 @ {formatNumber(t.price, 4)}
                  </span>
                  <p className="hint">
                    {formatTime(t.at)} · {formatUsdt(Number(t.quoteAmountUsdt))}
                    {t.realizedPnlUsdt != null && ` · 실현손익 ${formatUsdt(Number(t.realizedPnlUsdt))}`}
                    {t.reason && ` · ${t.reason}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function StatsPanel({ title, stats, showCapital = false }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <div className="stat-grid">
        <Stat label="수익률" value={formatPct(stats.returnPct)} cls={pnlClass(stats.returnPct)} big />
        <Stat label="총 손익" value={formatUsdt(stats.totalPnlUsdt)} cls={pnlClass(stats.totalPnlUsdt)} />
        <Stat label="실현 손익" value={formatUsdt(stats.realizedPnlUsdt)} cls={pnlClass(stats.realizedPnlUsdt)} />
        <Stat label="평가 손익" value={formatUsdt(stats.unrealizedPnlUsdt)} cls={pnlClass(stats.unrealizedPnlUsdt)} />
        <Stat label="보유 평가금액" value={formatUsdt(stats.marketValueUsdt)} />
        <Stat label="매매 횟수" value={`${stats.trades}회`} />
        <Stat label="수수료" value={formatUsdt(stats.feesUsdt)} />
        {showCapital && <Stat label="시작 자금" value={formatUsdt(stats.startCapitalUsdt)} />}
      </div>
    </section>
  );
}

function Stat({ label, value, cls = '', big = false }) {
  return (
    <div className={big ? 'stat big' : 'stat'}>
      <span className="hint">{label}</span>
      <strong className={cls}>{value}</strong>
    </div>
  );
}
