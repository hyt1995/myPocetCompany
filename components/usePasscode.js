'use client';

import { useCallback, useEffect, useState } from 'react';

// 비서 카드와 같은 저장 키를 써서, 한 번 입력하면 모든 화면에서 기억된다.
const STORAGE_KEY = 'mpc-passcode';

export function usePasscode() {
  const [passcode, setPasscodeState] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPasscodeState(window.localStorage.getItem(STORAGE_KEY) || '');
    } catch {
      // 저장이 안 되는 브라우저면 매번 입력
    }
    setReady(true);
  }, []);

  const setPasscode = useCallback((value) => {
    setPasscodeState(value);
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 무시
    }
  }, []);

  return { passcode, setPasscode, ready };
}
