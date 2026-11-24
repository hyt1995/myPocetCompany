// .env 설정 읽기. 실전 관련 값은 여기(노트북)에만 있고, 사이트나 DB에서 바꿀 수 없다.

import { hostname } from 'node:os';

const env = process.env;
const num = (key, fallback) => {
  const v = Number(env[key]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const bool = (key, fallback = false) => {
  if (env[key] == null) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(env[key]).toLowerCase());
};

export const config = {
  version: '1.0.0',
  host: env.WORKER_NAME || hostname(),

  firebase: {
    apiKey: env.FIREBASE_API_KEY,
    appId: env.FIREBASE_APPID,
    projectId: env.FIREBASE_PROJECT_ID || 'focus-app-76679',
  },

  commandSecret: env.COMMAND_SIGNING_SECRET || '',

  binance: {
    apiKey: env.BINANCE_API_KEY || '',
    secret: env.BINANCE_API_SECRET || '',
    testnet: bool('BINANCE_TESTNET', true), // 기본: 테스트넷 (가짜 돈)
  },

  live: {
    enabled: bool('LIVE_TRADING_ENABLED', false), // 기본: 실전 꺼짐
    maxOrderUsdt: num('LIVE_MAX_ORDER_USDT', 50),
    maxDailyUsdt: num('LIVE_MAX_DAILY_USDT', 200),
    defaultStopLossPct: num('LIVE_DEFAULT_STOP_LOSS_PCT', 3), // 승인 전략이 없을 때 손절 %
  },

  paperFeeRate: num('PAPER_FEE_RATE', 0.001), // 0.1%
  heartbeatMs: 30_000,
  tickMs: 30_000, // 자동 실행 확인 주기
  priceRefreshMs: 60_000, // 보유 코인 현재가 갱신 주기
  memberRefreshMs: 60_000, // 직원·전략 다시 읽는 주기
};

export function checkConfig() {
  const problems = [];
  if (!config.firebase.apiKey) problems.push('FIREBASE_API_KEY 가 없어요.');
  if (config.live.enabled) {
    if (!config.commandSecret) problems.push('실전을 켰는데 COMMAND_SIGNING_SECRET 이 없어요.');
    if (!config.binance.apiKey || !config.binance.secret) problems.push('실전을 켰는데 BINANCE_API_KEY / SECRET 이 없어요.');
  }
  return problems;
}
