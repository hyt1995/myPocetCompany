// 채팅 주문 카드 (제안).
//
// 사장님이 채팅으로 "BTC 50달러 모의로 사", "스케줄 1시간마다로 바꿔" 라고 하면,
// AI 직원은 아래 도구로 '제안'만 만든다. 제안은 DB에 저장되고 채팅에 확인 카드로 보인다.
// 사장님이 카드의 [실행]을 눌러야 서버가 명령(또는 설정 변경)을 만든다. AI는 혼자 실행할 수 없다.
// 실전(live) 주문은 [실행] 후 확인창을 한 번 더 거치고, 버튼과 똑같이 서명된 명령으로 나간다.
//
// mpc_members/{memberId}/proposals/{id}
//   kind: 'order' | 'settings' | 'run', params, status: 'proposed' | 'executed' | 'cancelled' | 'invalid',
//   error, commandId, at, handledAt

import { addDoc, collection, doc, getDoc, getDocs, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { COL, requireDb } from './firebase';
import { updateMember } from './members';
import { describeSchedule, normalizeSchedule } from './schedule';
import { createCommand } from './trading';

const PROPOSAL_TTL_MS = 30 * 60 * 1000; // 30분 지난 카드는 실행할 수 없다 (가격이 바뀌었을 수 있다)

export const TRADING_TOOLS = [
  {
    name: 'propose_order',
    description:
      '사장님이 코인을 사거나 팔라고 지시했을 때 주문 확인 카드를 만든다. 직접 주문하지 않는다. 사장님이 카드에서 [실행]을 눌러야 주문된다. 금액이나 종목이 불분명하면 카드를 만들지 말고 먼저 물어본다.',
    input_schema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['paper', 'live'],
          description: 'paper = 모의(기본값). live = 실제 돈. 사장님이 "실제로", "실전", "진짜 돈" 처럼 분명히 말한 경우에만 live.',
        },
        side: { type: 'string', enum: ['buy', 'sell'] },
        symbol: { type: 'string', description: '바이낸스 현물 USDT 마켓 이름. 예: BTCUSDT, ETHUSDT' },
        quoteAmountUsdt: { type: 'number', description: '매수 금액 (USDT). 매수일 때 필수.' },
        quantity: { type: 'number', description: '매도 수량 (코인 개수). 생략하면 보유분 전량 매도.' },
      },
      required: ['mode', 'side', 'symbol'],
    },
  },
  {
    name: 'propose_settings',
    description:
      '자동 매매 스케줄, 모드, 자동 실행 켜기/끄기를 바꾸라는 지시일 때 설정 변경 카드를 만든다. 바꾸라고 한 항목만 넣는다.',
    input_schema: {
      type: 'object',
      properties: {
        schedule: {
          type: 'object',
          description: "type 'interval' 이면 minutes, type 'times' 이면 times(한국시간 'HH:MM' 목록), type 'strategy' 이면 전략 기본 주기.",
          properties: {
            type: { type: 'string', enum: ['strategy', 'interval', 'times'] },
            minutes: { type: 'number' },
            times: { type: 'array', items: { type: 'string' } },
          },
          required: ['type'],
        },
        mode: { type: 'string', enum: ['stopped', 'paper'], description: 'stopped = 정지, paper = 모의매매' },
        autoRun: { type: 'boolean', description: '자동 실행 켜기(true)/끄기(false)' },
      },
    },
  },
  {
    name: 'propose_run',
    description: '승인된 전략을 지금 한 번 실행하라는 지시일 때 카드를 만든다. (조건 확인 후 맞으면 모의매매)',
    input_schema: { type: 'object', properties: {} },
  },
];

export const TRADING_CHAT_GUIDE = `[매매 지시 처리]
- 사장님이 사고팔기, 스케줄·모드 변경, 지금 실행을 지시하면 직접 했다고 말하지 말고 도구로 확인 카드를 만든다.
- 카드를 만든 뒤에는 "카드를 확인하고 [실행]을 눌러 주세요"처럼 짧게 안내한다.
- 금액·수량·종목이 불분명하면 카드를 만들지 말고 먼저 물어본다.
- 실제 돈(live)은 사장님이 분명히 말한 경우에만. 그 외에는 모두 모의(paper).`;

// Claude 의 도구 호출 → 검증 → 저장
export async function createProposals(member, toolUses) {
  const db = requireDb();
  const saved = [];
  for (const use of toolUses) {
    let record;
    try {
      record = { ...validate(member, use), status: 'proposed', error: null };
    } catch (err) {
      record = { kind: kindOf(use.name), params: use.input, status: 'invalid', error: err.message };
    }
    const data = { ...record, at: Date.now(), commandId: null, handledAt: null };
    const ref = await addDoc(collection(db, COL.members, member.id, 'proposals'), data);
    saved.push({ id: ref.id, ...data, summary: describeProposal(data) });
  }
  return saved;
}

function kindOf(name) {
  return { propose_order: 'order', propose_settings: 'settings', propose_run: 'run' }[name] || 'unknown';
}

function validate(member, { name, input = {} }) {
  if (name === 'propose_order') {
    const mode = input.mode === 'live' ? 'live' : 'paper';
    const side = input.side === 'sell' ? 'sell' : input.side === 'buy' ? 'buy' : null;
    if (!side) throw new Error('매수인지 매도인지 알 수 없어요.');
    let symbol = String(input.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (symbol && !symbol.endsWith('USDT')) symbol += 'USDT';
    if (!/^[A-Z0-9]{2,15}USDT$/.test(symbol)) throw new Error('종목 이름이 올바르지 않아요.');
    const params = { mode, side, symbol };
    if (side === 'buy') {
      const amount = Number(input.quoteAmountUsdt);
      if (!(amount > 0)) throw new Error('매수 금액이 없어요.');
      params.quoteAmountUsdt = Math.round(amount * 100) / 100;
    } else if (input.quantity != null) {
      const qty = Number(input.quantity);
      if (!(qty > 0)) throw new Error('매도 수량이 올바르지 않아요.');
      params.quantity = qty;
    }
    return { kind: 'order', params };
  }
  if (name === 'propose_settings') {
    const params = {};
    if (input.schedule) params.schedule = normalizeSchedule(input.schedule);
    if (['stopped', 'paper'].includes(input.mode)) params.mode = input.mode;
    if (typeof input.autoRun === 'boolean') params.autoRun = input.autoRun;
    if (Object.keys(params).length === 0) throw new Error('바꿀 설정이 없어요.');
    return { kind: 'settings', params };
  }
  if (name === 'propose_run') {
    if (!member.activeStrategyVersion) throw new Error('승인된 전략이 없어요.');
    return { kind: 'run', params: {} };
  }
  throw new Error('알 수 없는 요청이에요.');
}

export function describeProposal(p) {
  const x = p.params || {};
  if (p.kind === 'order') {
    const what = x.side === 'buy' ? `${x.quoteAmountUsdt} USDT 어치` : x.quantity ? `${x.quantity}개` : '보유분 전량';
    return `${x.mode === 'live' ? '실제' : '모의'} ${x.side === 'buy' ? '매수' : '매도'} · ${x.symbol} · ${what}`;
  }
  if (p.kind === 'settings') {
    const parts = [];
    if (x.schedule) parts.push(`스케줄: ${describeSchedule(x.schedule)}`);
    if (x.mode) parts.push(`모드: ${x.mode === 'paper' ? '모의' : '정지'}`);
    if (typeof x.autoRun === 'boolean') parts.push(`자동 실행: ${x.autoRun ? '켜기' : '끄기'}`);
    return `설정 변경 · ${parts.join(' · ') || '-'}`;
  }
  if (p.kind === 'run') return '승인된 전략 지금 실행';
  return '알 수 없는 제안';
}

export async function listProposals(memberId, count = 40) {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COL.members, memberId, 'proposals'), orderBy('at', 'desc'), limit(count)),
  );
  return snap.docs.map((d) => {
    const p = { id: d.id, ...d.data() };
    return { ...p, summary: describeProposal(p), expired: isExpired(p) };
  });
}

function isExpired(p) {
  return p.status === 'proposed' && Date.now() - p.at > PROPOSAL_TTL_MS;
}

// [실행] / [취소]. 실행 내용은 항상 DB에 저장된 제안에서 읽는다 (화면에서 보낸 값은 쓰지 않는다).
export async function handleProposal(member, proposalId, { action, confirmLive }) {
  const db = requireDb();
  const ref = doc(db, COL.members, member.id, 'proposals', proposalId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw httpError(404, '카드를 찾을 수 없어요.');
  const p = { id: snap.id, ...snap.data() };
  if (p.status !== 'proposed') throw httpError(409, '이미 처리된 카드예요.');

  if (action === 'cancel') {
    await updateDoc(ref, { status: 'cancelled', handledAt: Date.now() });
    return { status: 'cancelled', message: '취소했어요.' };
  }
  if (action !== 'execute') throw httpError(400, '알 수 없는 요청이에요.');
  if (isExpired(p)) throw httpError(410, '30분이 지난 카드라 실행할 수 없어요. 다시 지시해 주세요.');

  let commandId = null;
  let message;
  const x = p.params;
  if (p.kind === 'order') {
    const type = `${x.mode}_${x.side}`;
    if (x.mode === 'live' && confirmLive !== true) throw httpError(400, '실제 주문은 확인이 필요해요.');
    const command = await createCommand(member, {
      type,
      symbol: x.symbol,
      quoteAmountUsdt: x.quoteAmountUsdt,
      quantity: x.side === 'sell' ? x.quantity ?? 'all' : undefined,
    });
    commandId = command.id;
    message = '노트북 매매 프로그램으로 보냈어요. 프로그램 탭이나 현황 탭에서 결과를 확인하세요.';
  } else if (p.kind === 'settings') {
    await updateMember(member.id, x);
    message = '설정을 바꿨어요. 노트북 프로그램이 바로 반영해요.';
  } else if (p.kind === 'run') {
    const command = await createCommand(member, { type: 'run' });
    commandId = command.id;
    message = '지금 실행을 보냈어요.';
  } else {
    throw httpError(400, '실행할 수 없는 카드예요.');
  }

  await updateDoc(ref, { status: 'executed', commandId, handledAt: Date.now() });
  return { status: 'executed', commandId, message };
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
