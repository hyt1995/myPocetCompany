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

> 이 규격대로 만든 프로그램이 저장소의 `worker/` 폴더에 있다 (Node.js, 설치는 `worker/README.md`).
> 아래 내용을 바꾸면 사이트(`lib/`)와 `worker/src/` 를 같이 고친다.

## 프로그램이 해야 할 일 (요약)

프로그램은 **주기적으로 DB를 확인하지 않는다.** Firestore 실시간 리스너(`onSnapshot`)로 '바뀔 때만' 알림을 받고,
스케줄은 프로그램 안의 타이머(알람)로 돌린다.

1. 리스너 ① `mpc_commands` 의 `status == 'pending'` → 새 명령이 생기면 바로 처리
2. 리스너 ② `mpc_members` 의 `departmentId == 'investment'` → 모드·자동 실행·스케줄·승인 전략이 바뀌면 그 직원의 알람만 다시 맞춤
3. 알람: `mode == 'paper'` + `autoRun == true` + 승인 전략이 있는 직원마다 다음 실행 시각에 타이머 하나.
   울리면 승인 전략으로 확인 → 조건이 맞으면 모의매매 → 다음 시각으로 다시 맞춤.
   예약할 때 `mpc_worker/status.nextRuns.{memberId}` 에 다음 시각을 적는다 (사이트 표시용)
4. 체결하면 `mpc_trades` 에 기록하고 `mpc_positions` 를 갱신. 현재가(`lastPrice`)는 알람 실행 때와 `refresh_prices` 명령 때만 갱신
5. 5분마다 연결 상태 쓰기 → `mpc_worker/status` (사이트는 12분 안에 신호가 있으면 '연결됨')

아무 일이 없을 때 DB 사용량은 연결 신호 하루 288건뿐이다.

---

## 1. 읽는 것

### 직원 `mpc_members/{memberId}`
| 필드 | 설명 |
| --- | --- |
| `departmentId` | 매매 직원은 `'investment'` |
| `name`, `method` | 이름, 매매 방법 |
| `mode` | `'stopped'` \| `'paper'` — 자동 실행 모드. **실전 자동 모드는 없다** |
| `autoRun` | `true` 면 `schedule` 대로 자동 실행 |
| `schedule` | `{ type: 'strategy' }` 전략의 `checkEveryMinutes` 마다 (기본) · `{ type: 'interval', minutes: 30 }` N분마다 (한국 시간 자정 기준으로 맞춤: 30분 → :00, :30) · `{ type: 'times', times: ['09:00', '21:00'] }` 매일 정해진 시각 (한국 시간). 계산은 `lib/schedule.js` = `worker/src/schedule.js` |
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
- 조건은 **마지막 완성된 봉** 기준으로 판단한다 (지금 만들어지는 봉은 제외). 손절·익절은 지금 가격 기준.
- RSI 는 pandas `ewm(com=period-1, min_periods=period, adjust=True)` 방식 (기존 파이썬 봇 `GetRSI` 와 같은 값).
  `sma` = 단순평균, `ema` = 일반 지수평균(α = 2/(period+1)), 볼린저 표준편차는 표본표준편차.

---

## 2. 명령 처리 `mpc_commands/{commandId}`

사이트 버튼이 만든다. 프로그램은 `where('status', '==', 'pending')` 으로 구독한다.

| 필드 | 설명 |
| --- | --- |
| `memberId`, `departmentId` | 어느 직원의 명령인지 |
| `type` | `run` \| `refresh_prices` \| `paper_buy` \| `paper_sell` \| `live_buy` \| `live_sell` |
| `strategyVersion` | 명령 당시 승인 전략 버전 |
| `symbol` | 예: `BTCUSDT` (`run` 은 `null`) |
| `quoteAmountUsdt` | 매수 금액 (buy 만) |
| `quantity` / `sellAll` | 매도 수량, 또는 `sellAll: true` 면 전량 |
| `createdAt`, `expiresAt` | 생성 시각, 만료 시각 (실전만) |
| `signature` | 실전 명령의 HMAC 서명 (실전만) |
| `status` | `pending` → `processing`(처리 시작) → `done` \| `failed` \| `rejected` |

처리 후 프로그램이 쓰는 필드:
```js
{ status: 'done' | 'failed' | 'rejected', handledAt: Date.now(),
  result: { message: '체결: 0.0015 BTC @ 67000', tradeId: '...' } | null,
  error: '이유' | null }
```

- `run`: 그 직원의 승인 전략 조건을 지금 한 번 확인 → 맞으면 **모의**매매
- `refresh_prices`: 그 직원이 보유 중인 코인(모의·실전)의 `lastPrice` 갱신. 사이트 현황 탭을 열 때 자동으로 온다
- 명령은 사이트 버튼이나 **채팅 확인 카드**에서 사장님이 [실행]을 눌렀을 때만 생긴다 (`lib/proposals.js`)
- `paper_buy` / `paper_sell`: 지금 시세로 모의 체결
- `live_buy` / `live_sell`: **아래 검증을 모두 통과할 때만** 바이낸스 실제 주문

### 실전 명령 검증 (반드시)

Firestore 규칙이 열려 있어서 누구나 가짜 명령을 쓸 수 있다. 그래서 실전 명령은 서명으로만 믿는다.

1. `signature` 가 맞는지 확인 (아래 코드). 틀리면 `rejected`
2. `Date.now() <= expiresAt` (명령 후 5분). 지나면 `rejected`
3. 노트북 `.env` 의 `LIVE_TRADING_ENABLED=true` 가 아니면 `rejected`
4. 노트북 한도: 1회 최대(`LIVE_MAX_ORDER_USDT`), 하루 합계 최대(`LIVE_MAX_DAILY_USDT`) 넘으면 `rejected`
5. 같은 명령을 두 번 실행하지 않도록, 처리 시작 전에 트랜잭션으로 `status` 를 `processing` 으로 바꾼다
6. 매수 체결 후 **바이낸스에 손절 주문을 바로 걸어 둔다** (노트북이 꺼져도 손절이 작동하게).
   손절 %는 승인 전략의 `stopLossPct`, 없으면 `.env` 의 `LIVE_DEFAULT_STOP_LOSS_PCT`
7. 매도는 **이 직원이 실전으로 산 수량 안에서만** 한다 (계정에 따로 가진 같은 코인은 팔지 않는다)

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

### 연결 상태 `mpc_worker/status` (5분마다 + 알람 예약할 때)
```js
{ lastSeenAt: Date.now(), version: '1.0.0', host: '노트북 이름', liveEnabled: false, testnet: true,
  nextRuns: { [memberId]: 다음 자동 실행 시각(ms) | null } }
```
사이트는 `lastSeenAt` 이 12분 이내면 '연결됨'으로 표시하고, 프로그램 탭에 `nextRuns` 로 다음 실행 시각을 보여준다.

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
  realizedPnlUsdt,    // 이 종목에서 지금까지 확정된 손익 합계 (매수·매도 수수료를 이미 뺀 값)
  openedAt, updatedAt,
  stopPrice           // 실전만: 바이낸스에 걸어 둔 손절가
}
```

사이트의 수익률 계산 (`lib/trading.js computeStats`):
- 평가손익 = Σ (`lastPrice` − `avgPrice`) × `quantity`
- 총손익 = Σ `realizedPnlUsdt` + 평가손익
- 모의 수익률 = 총손익 ÷ 직원의 `paperCapitalUsdt` × 100
- 실전 수익률 = 총손익 ÷ 실전 매수에 쓴 총액 × 100

### 모의매매 체결 가정
- 체결가: 명령 시점 현재가 (바이낸스 메인넷 공개 시세)
- 수수료: 0.1% (`feeUsdt = quoteAmountUsdt × 0.001`, `.env` 의 `PAPER_FEE_RATE`)
- 가상 현금 = `paperCapitalUsdt` + Σ`realizedPnlUsdt` − Σ(`avgPrice` × `quantity`). 이보다 큰 매수는 `failed`

### 실전 매매 주의
- 한 코인은 한 직원만 실전 매매한다. 실전 매수·매도 때 그 코인의 열린 주문을 모두 취소하고 손절을 다시 건다.

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
