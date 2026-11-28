'use client';

// 줄 세우기 기준 고르기: 정렬 기준 1개 + 거르기(선택) + 보고서 줄 수.
// 고를 수 있는 것은 capabilities.js 의 SORT_KEYS·RANKING_FILTERS 뿐이다.

import { useEffect, useState } from 'react';
import { RANK_TOP, RANKING_FILTERS, SORT_KEYS } from '../capabilities.js';

export default function RankingPicker({ value, onChange, disabled }) {
  const v = value || { sortBy: 'score', top: RANK_TOP.default };
  const set = (key, raw) => {
    const next = { ...v };
    if (raw === '' || raw === null) delete next[key];
    else next[key] = key === 'sortBy' ? raw : Number(raw);
    onChange(next);
  };

  return (
    <div className="ask">
      <label>
        줄 세우기 기준
        <select value={v.sortBy} disabled={disabled} onChange={(e) => set('sortBy', e.target.value)}>
          {Object.entries(SORT_KEYS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label} — {s.means}
            </option>
          ))}
        </select>
      </label>
      <details>
        <summary>거르기 · 보고서 줄 수 (선택)</summary>
        {Object.entries(RANKING_FILTERS).map(([key, f]) => (
          <label key={key}>
            {f.label}
            <input
              type="number"
              inputMode="decimal"
              min={f.min}
              max={f.max}
              placeholder="비우면 안 거름"
              disabled={disabled}
              value={v[key] ?? ''}
              onChange={(e) => set(key, e.target.value)}
            />
          </label>
        ))}
        <label>
          보고서에 넣을 줄 수 ({RANK_TOP.min}~{RANK_TOP.max})
          <input
            type="number"
            min={RANK_TOP.min}
            max={RANK_TOP.max}
            disabled={disabled}
            value={v.top ?? RANK_TOP.default}
            onChange={(e) => set('top', e.target.value)}
          />
        </label>
      </details>
    </div>
  );
}

// 조사가 끝난 뒤 기준을 바꿔 다시 줄 세우기. 네이버를 다시 부르지 않으니 공짜다.
export function RunRankingEditor({ run, onApply, disabled }) {
  const [draft, setDraft] = useState(run.ranking);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(run.ranking), [run.ranking]);
  const changed = JSON.stringify(draft) !== JSON.stringify(run.ranking);

  return (
    <details>
      <summary>줄 세우기 기준 바꾸기 (지금: {run.rankingLabel})</summary>
      <RankingPicker value={draft} onChange={setDraft} disabled={disabled || busy} />
      <button
        type="button"
        disabled={disabled || busy || !changed}
        onClick={async () => {
          setBusy(true);
          await onApply(draft);
          setBusy(false);
        }}
      >
        {busy ? '다시 줄 세우는 중…' : '이 기준으로 다시 줄 세우기 (AI 비용 없음)'}
      </button>
    </details>
  );
}
