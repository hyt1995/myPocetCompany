'use client';

// 조사 결과 표: 기회 점수 높은 순. 폰에서는 옆으로 밀어서 본다.

import { useState } from 'react';

const WRAP = { overflowX: 'auto', margin: '8px 0' };
const TABLE = { borderCollapse: 'collapse', fontSize: 12, minWidth: 640, width: '100%' };
const CELL = { padding: '6px 8px', borderBottom: '1px solid #e5e5e5', textAlign: 'right', whiteSpace: 'nowrap' };
const LEFT = { ...CELL, textAlign: 'left' };
const HEAD = { ...CELL, fontWeight: 700, background: '#f6f6f6' };

const num = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('ko-KR'));
const times = (v) => (v === null || v === undefined ? '—' : `${v}배`);

export function ResearchProgress({ run }) {
  if (!run) return null;
  const pct = run.total ? Math.round((run.done / run.total) * 100) : 0;
  const label = run.status === 'done' ? '완료' : run.done > 0 ? '조사 중' : '대기';
  return (
    <p className="hint">
      {label} · {run.done}/{run.total}개 ({pct}%)
      {run.range ? ` · 추세 기간 ${run.range.startDate} ~ ${run.range.endDate}` : ''}
    </p>
  );
}

export function ResearchTable({ run, initialLimit = 30 }) {
  const [limit, setLimit] = useState(initialLimit);
  if (!run) return null;
  const rows = run.ranked || [];
  if (rows.length === 0) return <p className="hint">아직 결과가 없어요.</p>;

  return (
    <>
      {run.errors?.length > 0 && (
        <p className="msg error">일부 조회 실패: {run.errors.slice(-3).join(' / ')}</p>
      )}
      <div style={WRAP}>
        <table style={TABLE}>
          <thead>
            <tr>
              <th style={HEAD}>순위</th>
              <th style={{ ...HEAD, textAlign: 'left' }}>키워드</th>
              <th style={HEAD}>기회 점수</th>
              <th style={HEAD}>월 검색수</th>
              <th style={HEAD}>블로그 글</th>
              <th style={HEAD}>경쟁비</th>
              <th style={HEAD}>1년 성장</th>
              <th style={HEAD}>3개월 성장</th>
              <th style={HEAD}>광고 경쟁</th>
              <th style={{ ...HEAD, textAlign: 'left' }}>표시</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.id}>
                <td style={CELL}>{r.rank}</td>
                <td style={LEFT}>{r.keyword}</td>
                <td style={{ ...CELL, fontWeight: 700 }}>{num(r.score)}</td>
                <td style={CELL}>{num(r.monthly)}</td>
                <td style={CELL}>{num(r.blogTotal)}</td>
                <td style={CELL}>{num(r.competition)}</td>
                <td style={CELL}>{times(r.yoy)}</td>
                <td style={CELL}>{times(r.momentum)}</td>
                <td style={CELL}>{r.compIdx || '—'}</td>
                <td style={LEFT}>{r.flags?.join(', ') || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="secondary" onClick={() => setLimit(rows.length)}>
          {rows.length - limit}개 더 보기
        </button>
      )}
      <p className="hint">
        기회 점수 = 월 검색수 ÷ (블로그 글 + 1) × 성장률 × 100. 경쟁비 = 검색 1번당 이미 있는 블로그 글 수 (낮을수록
        빈 시장). 광고 경쟁 &apos;높음&apos; = 광고주가 돈을 쓰는 키워드.
      </p>
    </>
  );
}
