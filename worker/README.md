# 노트북 매매 프로그램

사이트(내 손안의 회사)와 Firestore로 연결되는 바이낸스 **현물** 매매 프로그램.
사이트의 버튼·채팅 카드 명령을 받아 처리하고, 자동 실행이 켜진 직원의 승인 전략을 **스케줄대로 모의매매**한다.

평소에는 아무것도 하지 않고 기다린다. Firestore 리스너가 '새 명령'이나 '직원 설정 변경'을 알려줄 때와,
스케줄 알람이 울릴 때만 움직인다. DB를 주기적으로 확인하지 않아서, 아무 일 없을 때 DB 사용은 5분마다 연결 신호 1건뿐이다.
실제 주문은 사장님이 사이트에서 누른 **서명된 명령**만, 이 노트북의 실전 설정을 통과할 때만 나간다.

연결 규격: 저장소 루트의 `WORKER_PROTOCOL.md`

## 처음 설치 (Ubuntu 20.04)

```bash
# 1. Node.js 22 설치 (nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 22

# 2. 프로그램 설치
cd ~/myPocetCompany        # 저장소를 클론한 폴더
git pull
cd worker
npm install
npm test                   # 지표·계산·서명 테스트 (외부 연결 없음)

# 3. 설정
cp .env.example .env
nano .env                  # FIREBASE_API_KEY, FIREBASE_APPID 부터 채우기

# 4. 실행
npm start
```

실행하면 사이트의 투자운영사업부 화면에 **"노트북 매매 프로그램 연결됨"**이 떠요.

## 켜 두기 (꺼져도 자동 재시작, 부팅 시 자동 실행)

```bash
npm install -g pm2
pm2 start npm --name mpc-worker -- start
pm2 save
pm2 startup            # 화면에 나오는 sudo 명령을 그대로 한 번 실행
pm2 logs mpc-worker    # 로그 보기
```

노트북 절전을 꺼 두세요. 노트북이 잠들면 자동 실행과 명령 처리가 멈춰요.
(실전으로 산 코인의 손절 주문은 바이낸스에 걸려 있어서 노트북이 꺼져도 작동해요.)

## 업데이트

```bash
cd ~/myPocetCompany && git pull && cd worker && npm install && pm2 restart mpc-worker
```

## 실전 켜는 순서 (천천히)

1. **모의매매로 충분히 확인** — 사이트에서 직원 모드를 '모의', 자동 실행 켜기
2. `COMMAND_SIGNING_SECRET` 을 Vercel 과 `.env` 에 같은 값으로 넣기 (`openssl rand -hex 32`)
3. **테스트넷**: https://testnet.binance.vision 에서 키 발급 → `.env` 에 넣고 `BINANCE_TESTNET=true`, `LIVE_TRADING_ENABLED=true`
   → 사이트에서 [실제 매수/매도] 눌러 보기 (결과에 `[테스트넷]` 표시)
4. **실전**: 바이낸스 실계정 키 (출금 OFF, 집 공인 IP 등록) → `BINANCE_TESTNET=false`, 한도를 작게
5. 설정을 바꾼 뒤에는 `pm2 restart mpc-worker`

## 주의
- **한 코인은 한 직원만 실전 매매하세요.** 실전 매수·매도 때 그 코인에 걸린 주문을 모두 취소하고 손절을 다시 걸어서,
  두 직원이 같은 코인을 실전으로 가지면 서로의 손절 주문을 지울 수 있어요. 바이낸스에서 직접 건 같은 코인 주문도 취소돼요.
  (모의매매는 상관없어요)
- 매도는 이 프로그램이 실전으로 산 수량 안에서만 해요. 계정에 따로 가진 같은 코인은 팔지 않아요.
- 전략 판단은 **완성된 봉** 기준이에요. 지금 만들어지는 봉은 쓰지 않아요.
- 모의매매 체결가는 지금 시세, 수수료 0.1%로 계산해요.
- 키는 `.env` 에만 두세요. 코드나 GitHub에 쓰지 마세요.
