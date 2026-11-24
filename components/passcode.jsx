'use client';

// 비밀번호(APP_PASSCODE) 입력 화면과, 비밀번호를 붙여 API를 부르는 useApi().
// 비서 카드와 같은 저장 키를 써서 한 번 입력하면 모든 화면에서 기억된다.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'mpc-passcode';
const PasscodeContext = createContext(null);

export function PasscodeGate({ children }) {
  const [passcode, setPasscodeState] = useState('');
  const [ready, setReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    try {
      setPasscodeState(window.localStorage.getItem(STORAGE_KEY) || '');
    } catch {
      // 저장이 안 되는 브라우저면 매번 입력
    }
    setReady(true);
  }, []);

  const setPasscode = useCallback((value, message = '') => {
    setPasscodeState(value);
    setNotice(message);
    try {
      if (value) window.localStorage.setItem(STORAGE_KEY, value);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 무시
    }
  }, []);

  if (!ready) return null;

  if (!passcode) {
    return (
      <form
        className="panel ask"
        onSubmit={(e) => {
          e.preventDefault();
          setPasscode(draft);
        }}
      >
        <p className="hint">들어가려면 비밀번호(APP_PASSCODE)를 입력하세요.</p>
        {notice && <p className="msg error">{notice}</p>}
        <input
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button type="submit" disabled={!draft}>
          들어가기
        </button>
      </form>
    );
  }

  return (
    <PasscodeContext.Provider value={{ passcode, setPasscode }}>{children}</PasscodeContext.Provider>
  );
}

export function useApi() {
  const { passcode, setPasscode } = useContext(PasscodeContext);

  return useCallback(
    async (url, options = {}) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          'content-type': 'application/json',
          'x-passcode': encodeURIComponent(passcode),
          ...(options.headers || {}),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setPasscode('', '비밀번호가 맞지 않아요. 다시 입력해 주세요.');
        throw new Error('비밀번호가 맞지 않아요.');
      }
      if (!res.ok) throw new Error(data.error || `오류 (HTTP ${res.status})`);
      return data;
    },
    [passcode, setPasscode],
  );
}
