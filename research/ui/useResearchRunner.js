'use client';

// 조사 실행기: [조사 시작]을 누르면 '다음 묶음'을 끝날 때까지 차례로 부른다.
// 화면이 열려 있는 동안만 돈다. 화면을 닫으면 멈추고, 다시 열어서 [이어서 조사]를 누르면 이어진다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useApi } from '../core/client';

export function useResearchRunner(runId) {
  const api = useApi();
  const [run, setRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const stopRef = useRef(false);

  const load = useCallback(async () => {
    if (!runId) return null;
    setError('');
    try {
      const data = await api(`/api/research/runs/${runId}`);
      setRun(data.run);
      return data.run;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [api, runId]);

  useEffect(() => {
    setRun(null);
    load();
    return () => {
      stopRef.current = true;
    };
  }, [load]);

  const start = useCallback(async () => {
    if (!runId) return;
    stopRef.current = false;
    setRunning(true);
    setError('');
    try {
      let current = run || (await load());
      while (current && current.status !== 'done' && !stopRef.current) {
        const data = await api(`/api/research/runs/${runId}/step`, {
          method: 'POST',
          body: JSON.stringify({ expectedCursor: current.done }),
        });
        if (data.run.done === current.done && data.run.status !== 'done') break; // 다른 화면이 처리 중
        current = data.run;
        setRun(current);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }, [api, load, run, runId]);

  const stop = useCallback(() => {
    stopRef.current = true;
  }, []);

  return { run, running, error, start, stop, reload: load };
}
