// 바이낸스 공개 시세 (API 키 필요 없음). 모의매매와 전략 판단은 항상 실제(메인넷) 시세를 쓴다.

import ccxt from 'ccxt';

const market = new ccxt.binance({ enableRateLimit: true, options: { defaultType: 'spot' } });

// 'BTCUSDT' → 'BTC/USDT'
export function toCcxtSymbol(symbol) {
  if (!/^[A-Z0-9]{2,15}USDT$/.test(symbol)) throw new Error(`종목 이름이 올바르지 않아요: ${symbol}`);
  return `${symbol.slice(0, -4)}/USDT`;
}

const cache = new Map(); // 같은 종목·봉을 짧은 시간에 여러 번 부르지 않게
const CACHE_MS = 20_000;

export async function fetchCandles(symbol, timeframe, limit = 300) {
  const key = `${symbol}|${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.candles;

  const rows = await market.fetchOHLCV(toCcxtSymbol(symbol), timeframe, undefined, limit);
  const candles = rows.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));
  cache.set(key, { at: Date.now(), candles });
  return candles;
}

export async function fetchPrice(symbol) {
  const t = await market.fetchTicker(toCcxtSymbol(symbol));
  const price = Number(t.last);
  if (!(price > 0)) throw new Error(`${symbol} 현재가를 가져오지 못했어요.`);
  return price;
}
