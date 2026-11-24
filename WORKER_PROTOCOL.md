# 노트북 매매 프로그램 연결 규격

사이트(Vercel)와 노트북 매매 프로그램은 **Firestore를 통해서만** 주고받는다.
노트북으로 들어오는 접속은 없다. 프로그램이 Firestore를 읽고 쓰기만 하면 연결된다.

```
사이트 ── 전략·명령 저장 ──▶ Firestore ◀── 명령 받기 / 결과·현황·연결상태 쓰기 ── 노트북 프로그램 ──▶ 바이낸스
```

- Firebase 프로젝트: `focus-app-76679` (웹 SDK, 같은 `apiKey`·`appId` 사용)
- 이 사이트의 컬렉션은 전부 `mpc_` 로 시작한다.
- 시간 값은 전부 **밀리초 숫자** (`Date.now()`).
- 바이낸스 API 키는 **노트북 `.env`에만** 둔다. Firestore에 절대 쓰지 않는다.

## 프로그램이 해야 할 일 (요약)

1. 30초마다 연결 상태 쓰기 → `mpc_worker/status`
2. `mpc_commands` 에서 `status == 'pending'` 인 명령을 실시간으로 받아 처리 (`onSnapshot`)
3. 자동 실행: 직원 중 `mode == 'paper'` 이고 `autoRun == true` 인 직원의 승인 전략을 `checkEveryMinutes` 마다 확인해 모의매매
4. 체결하면 `mpc_trades` 에 기록하고 `mpc_positions` 를 갱신 (현재가 `lastPrice` 도 주기적으로 갱신)

---

## 1. 읽는 것

### 직원 `mpc_members/{memberId}`
| 필드 | 설명 |
| --- | --- |
| `departmentId` | 매매 직원은 `'investment'` |
| `name`, `method` | 이름, 매매 방법 |
| `mode` | `'stopped'` \| `'paper'` — 자동 실행 모드. **실전 자동 모드는 없다** |
| `autoRun` | `true` 면 전략의 `checkEveryMinutes` 마다 자동 실행 |
| `paperCapitalUsdt` | 모의 시작 가상자금 (USDT) |
| `activeStrategyVersion` | 승인된 전략 버전 번호 (없으면 `null`) |

### 승인 전략 `mpc_members/{memberId}/strategies/v{activeStrategyVersion}`
`status == 'approved'` 인 것만 쓴다. 매매 조건은 `rules`:

```json
{
  "market": "binance_spot",
  "symbols": ["BTCUSDT"],
  "timeframe": "1h",
  "checkEveryMinutes": 60,
  "entry": {
    "logic": "all",
    "conditions": [
      { "indicator": "rsi", "params": { "period": 14 }, "op": "<", "value": 30, "description": "RSI 30 미만" },
      { "indicator": "ema", "params": { "period": 20 }, "op": "crosses_above",
        "value": { "indicator": "ema", "params": { "period": 50 } }, "description": "20EMA가 50EMA 상향 돌파" }
    ]
  },
  "exit": { "takeProfitPct": 5, "stopLossPct": 2, "maxHoldHours": 72, "logic": "any", "conditions": [] },
  "position": { "quoteAmountUsdt": 100, "maxOpenPositions": 1 }
}
```

- `timeframe`: `1m` `5m` `15m` `1h` `4h` `1d` (바이낸스 kline interval 과 같다)
- `logic`: `all` = 모든 조건 만족, `any` = 하나라도 만족
- `op`: `>` `>=` `<` `<=` `crosses_above` `crosses_below` (crosses = 직전 봉 대비 교차)
- `value`: 숫자, 또는 `{ indicator, params }` (다른 지표와 비교)
- 지표 (`indicator` → `params`):

| indicator | params | 의미 |
| --- | --- | --- |
| `price` | 없음 | 현재가 (마지막 봉 종가) |
| `price_change_pct` | `lookbackBars` | N봉 전 종가 대비 변화율 % |
| `sma` / `ema` | `period` | 이동평균 |
| `rsi` | `period` | RSI (0~100) |
| `volume_change_pct` | `lookbackBars` | 마지막 봉 거래량의 직전 N봉 평균 대비 변화율 % |
| `bollinger_pct_b` | `period`, `stdDev` | %B (0 = 하단, 1 = 상단) |
| `macd_hist` | `fast`, `slow`, `signal` | MACD 히스토그램 |

- 청산: `stopLossPct`(필수), `takeProfitPct`, `maxHoldHours` 중 하나라도 도달하거나, `exit.conditions` 가 `exit.logic` 대로 만족하면 매도.

---

## 2. 명령 처리 `mpc_commands/{commandId}`

사이트 버튼이 만든다. 프로그램은 `where('status', '==', 'pending')` 으로 구독한다.

| 필드 | 설명 |
| --- | --- |
| `memberId`, `departmentId` | 어느 직원의 명령인지 |
| `type` | `run` \| `paper_buy` \| `paper_sell` \| `live_buy` \| `live_sell` |
| `strategyVersion` | 명령 당시 승인 전략 버전 |
| `symbol` | 예: `BTCUSDT` (`run` 은 `null`) |
| `quoteAmountUsdt` | 매수 금액 (buy 만) |
| `quantity` / `sellAll` | 매도 수량, 또는 `sellAll: true` 면 전량 |
| `createdAt`, `expiresAt` | 생성 시각, 만료 시각 (실전만) |
| `signature` | 실전 명령의 HMAC 서명 (실전만) |
| `status` | `pending` → 프로그램이 `done` \| `failed` \| `rejected` 로 바꾼다 |

처리 후 프로그램이 쓰는 필드:
```js
{ status: 'done' | 'failed' | 'rejected', handledAt: Date.now(),
  result: { message: '체결: 0.0015 BTC @ 67000', tradeId: '...' } | null,
  error: '이유' | null }
```

- `run`: 그 직원의 승인 전략 조건을 지금 한 번 확인 → 맞으면 **모의**매매
- `paper_buy` / `paper_sell`: 지금 시세로 모의 체결
- `live_buy` / `live_sell`: **아래 검증을 모두 통과할 때만** 바이낸스 실제 주문

### 실전 명령 검증 (반드시)

Firestore 규칙이 열려 있어서 누구나 가짜 명령을 쓸 수 있다. 그래서 실전 명령은 서명으로만 믿는다.

1. `signature` 가 맞는지 확인 (아래 코드). 틀리면 `rejected`
2. `Date.now() <= expiresAt` (명령 후 5분). 지나면 `rejected`
3. 노트북 `.env` 의 `LIVE_TRADING_ENABLED=true` 가 아니면 `rejected`
4. 노트북 한도: 1회 최대(`LIVE_MAX_ORDER_USDT`), 하루 합계 최대(`LIVE_MAX_DAILY_USDT`) 넘으면 `rejected`
5. 같은 명령을 두 번 실행하지 않도록, 처리 시작 전에 트랜잭션으로 `status` 를 `processing` 으로 바꾼다
6. 매수 체결 후 **바이낸스에 손절 주문을 바로 걸어 둔다** (노트북이 꺼져도 손절이 작동하게)

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

// 사이트(lib/trading.js)와 똑같은 순서·형식이어야 한다.
function canonicalString(c, id) {
  return [
    id,
    c.memberId,
    c.type,
    c.symbol || '',
    c.quoteAmountUsdt ?? '',
    c.sellAll ? 'all' : c.quantity ?? '',
    c.createdAt,
    c.expiresAt,
  ].join('|');
}

function verify(c, id, secret = process.env.COMMAND_SIGNING_SECRET) {
  if (!c.signature) return false;
  const expected = createHmac('sha256', secret).update(canonicalString(c, id)).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(c.signature));
  return a.length === b.length && timingSafeEqual(a, b);
}
```

`COMMAND_SIGNING_SECRET` 은 Vercel 환경변수와 노트북 `.env` 에 **똑같은 값**으로 넣는다.
(예: `openssl rand -hex 32` 로 만든 값. 사이트에 이 값이 없으면 실제 매수/매도 버튼이 꺼져 있다.)

---

## 3. 쓰는 것

### 연결 상태 `mpc_worker/status` (30초마다)
```js
{ lastSeenAt: Date.now(), version: '1.0.0', host: '노트북 이름', liveEnabled: false }
```
사이트는 `lastSeenAt` 이 2분 이내면 '연결됨'으로 표시한다.

### 체결 기록 `mpc_trades/{autoId}` (체결마다 추가)
```js
{
  memberId, mode: 'paper' | 'live', side: 'buy' | 'sell', symbol,
  price, quantity, quoteAmountUsdt, feeUsdt,
  realizedPnlUsdt,           // 매도일 때만, 아니면 null
  strategyVersion, commandId, // 자동 실행이면 commandId: null
  reason: '진입: RSI 28 < 30' | '손절 -2%' | '수동',
  exchangeOrderId,           // 실전만
  at: Date.now()
}
```

### 보유 현황 `mpc_positions/{memberId}_{mode}_{symbol}` (체결·시세 갱신 때마다 덮어쓰기)
```js
{
  memberId, mode: 'paper' | 'live', symbol,
  quantity,           // 0 이 되면 보유 종료 (문서는 남겨서 실현손익 누적 유지)
  avgPrice, lastPrice,
  realizedPnlUsdt,    // 이 종목에서 지금까지 확정된 손익 합계
  openedAt, updatedAt
}
```

사이트의 수익률 계산 (`lib/trading.js computeStats`):
- 평가손익 = Σ (`lastPrice` − `avgPrice`) × `quantity`
- 총손익 = Σ `realizedPnlUsdt` + 평가손익
- 모의 수익률 = 총손익 ÷ 직원의 `paperCapitalUsdt` × 100

### 모의매매 체결 가정 (권장)
- 체결가: 명령 시점 현재가 (바이낸스 `GET /api/v3/ticker/price`)
- 수수료: 0.1% (`feeUsdt = quoteAmountUsdt × 0.001`)
- 가상 잔고가 `paperCapitalUsdt` 를 넘는 매수는 `rejected`

---

## 노트북 `.env` 예시

```
FIREBASE_API_KEY=...
FIREBASE_APPID=...
FIREBASE_PROJECT_ID=focus-app-76679

COMMAND_SIGNING_SECRET=...        # Vercel과 같은 값

BINANCE_API_KEY=...               # 출금 권한 OFF, 집 공인 IP 등록
BINANCE_API_SECRET=...
LIVE_TRADING_ENABLED=false        # 실전 허용. 기본 꺼짐
LIVE_MAX_ORDER_USDT=50
LIVE_MAX_DAILY_USDT=200
```
