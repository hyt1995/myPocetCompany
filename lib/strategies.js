// 직원의 매매 전략. 학습 자료를 읽고 직원이 '정해진 형식의 규칙'으로 만든다.
// 매매 프로그램은 승인된 버전의 rules 만 읽고 실행한다. (형식은 WORKER_PROTOCOL.md)
//
// mpc_members/{memberId}/strategies/v{n}
//   version, status: 'draft' | 'approved' | 'archived', name, summary, rationale, risks[],
//   rules{...}, validationErrors[], materialIds[], note, model, costUsd, at, approvedAt

import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { callClaude, MODELS } from './claude';
import { COL, requireDb } from './firebase';
import { listMaterials } from './materials';
import { buildSystemPrompt, updateMember } from './members';

export const TIMEFRAMES = ['1m', '5m', '15m', '1h', '4h', '1d'];

// 매매 프로그램이 알아야 하는 지표 목록. 여기 없는 지표는 전략에 쓸 수 없다.
export const INDICATORS = {
  price: { params: [], desc: '현재가 (USDT)' },
  price_change_pct: { params: ['lookbackBars'], desc: 'N봉 전 대비 가격 변화율(%)' },
  sma: { params: ['period'], desc: '단순 이동평균' },
  ema: { params: ['period'], desc: '지수 이동평균' },
  rsi: { params: ['period'], desc: 'RSI (0~100)' },
  volume_change_pct: { params: ['lookbackBars'], desc: '최근 봉 거래량의 N봉 평균 대비 변화율(%)' },
  bollinger_pct_b: { params: ['period', 'stdDev'], desc: '볼린저밴드 %B (0=하단, 1=상단)' },
  macd_hist: { params: ['fast', 'slow', 'signal'], desc: 'MACD 히스토그램' },
};
export const OPERATORS = ['>', '>=', '<', '<=', 'crosses_above', 'crosses_below'];

const FORMAT_GUIDE = `[출력 형식]
반드시 아래 형식의 JSON 객체 하나만 출력한다. 설명 문장이나 코드블록 표시는 쓰지 않는다.
{
  "name": "전략 이름 (짧게)",
  "summary": "전략 한두 문장 요약",
  "rationale": "어떤 학습 자료의 어떤 내용을 근거로 했는지",
  "risks": ["이 전략의 위험 요소"],
  "materialIds": ["근거로 쓴 자료 id"],
  "rules": {
    "market": "binance_spot",
    "symbols": ["BTCUSDT"],
    "timeframe": "${TIMEFRAMES.join('" | "')}",
    "checkEveryMinutes": 60,
    "entry": {
      "logic": "all | any",
      "conditions": [
        { "indicator": "rsi", "params": { "period": 14 }, "op": "<", "value": 30, "description": "RSI 30 미만 과매도" },
        { "indicator": "ema", "params": { "period": 20 }, "op": "crosses_above", "value": { "indicator": "ema", "params": { "period": 50 } }, "description": "20EMA가 50EMA 상향 돌파" }
      ]
    },
    "exit": {
      "takeProfitPct": 5,
      "stopLossPct": 2,
      "maxHoldHours": 72,
      "logic": "any",
      "conditions": []
    },
    "position": { "quoteAmountUsdt": 100, "maxOpenPositions": 1 }
  }
}

[규칙]
- 사용할 수 있는 지표(indicator)만 쓴다: ${Object.entries(INDICATORS)
  .map(([k, v]) => `${k}(${v.params.join(', ') || '파라미터 없음'}): ${v.desc}`)
  .join(' / ')}
- op 는 ${OPERATORS.join(', ')} 중 하나. value 는 숫자이거나 { "indicator", "params" } 객체.
- symbols 는 바이낸스 현물 USDT 마켓 이름 (예: BTCUSDT, ETHUSDT).
- stopLossPct(손절 %)는 반드시 넣는다.
- 학습 자료에 없는 수치를 지어내지 말고, 자료가 부족하면 보수적인 값을 쓰고 rationale에 그렇게 밝힌다.`;

export async function listStrategies(memberId) {
  const db = requireDb();
  const snap = await getDocs(collection(db, COL.members, memberId, 'strategies'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.version - a.version);
}

export async function generateStrategy(member, note = '') {
  const materials = (await listMaterials(member.id)).filter((m) => m.status === 'ready');
  if (materials.length === 0) {
    throw new Error('학습 자료가 없어요. 학습 탭에서 자료를 먼저 넣어 주세요.');
  }

  const existing = await listStrategies(member.id);
  const latestApproved = existing.find((s) => s.status === 'approved');
  const version = (existing[0]?.version || 0) + 1;

  const materialText = materials
    .map((m) => `<자료 id="${m.id}" 종류="${m.type}" 제목="${m.title}">\n${m.summary}\n</자료>`)
    .join('\n\n');

  const userText = [
    `아래 학습 자료로 바이낸스 현물 매매 전략을 만들어라.`,
    member.method && `내 매매 방법: ${member.method}`,
    note && `사장님 요청: ${note}`,
    latestApproved &&
      `현재 승인된 전략(v${latestApproved.version}): ${JSON.stringify(latestApproved.rules)}\n이걸 개선하는 새 버전을 만든다.`,
    materialText,
  ]
    .filter(Boolean)
    .join('\n\n');

  const system = await buildSystemPrompt(member, FORMAT_GUIDE);

  const result = await callClaude({
    department: member.departmentId,
    memberId: member.id,
    purpose: 'strategy',
    model: MODELS.smart,
    system,
    messages: [{ role: 'user', content: userText }],
    maxTokens: 2500,
  });

  const parsed = parseJson(result.reply);
  if (!parsed) {
    throw new Error('직원이 전략을 정해진 형식으로 만들지 못했어요. 다시 시도해 주세요.');
  }

  const validationErrors = validateRules(parsed.rules);
  const data = {
    version,
    status: 'draft',
    name: String(parsed.name || `전략 v${version}`).slice(0, 60),
    summary: String(parsed.summary || '').slice(0, 1000),
    rationale: String(parsed.rationale || '').slice(0, 3000),
    risks: Array.isArray(parsed.risks) ? parsed.risks.map(String).slice(0, 10) : [],
    materialIds: Array.isArray(parsed.materialIds) ? parsed.materialIds.map(String).slice(0, 50) : [],
    rules: parsed.rules || null,
    validationErrors,
    note: String(note || '').slice(0, 500),
    model: result.model,
    costUsd: result.costUsd,
    at: Date.now(),
    approvedAt: null,
  };

  const db = requireDb();
  await setDoc(doc(db, COL.members, member.id, 'strategies', `v${version}`), data);
  return { id: `v${version}`, ...data };
}

// 승인: 이 버전만 매매 프로그램이 사용한다. 이전 승인 버전은 archived.
export async function approveStrategy(member, version) {
  const db = requireDb();
  const ref = doc(db, COL.members, member.id, 'strategies', `v${version}`);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('없는 전략 버전이에요.');
  const s = snap.data();
  if (s.validationErrors?.length) throw new Error('형식 오류가 있는 전략은 승인할 수 없어요.');

  const all = await listStrategies(member.id);
  for (const other of all) {
    if (other.status === 'approved' && other.version !== version) {
      await updateDoc(doc(db, COL.members, member.id, 'strategies', other.id), { status: 'archived' });
    }
  }
  await updateDoc(ref, { status: 'approved', approvedAt: Date.now() });
  await updateMember(member.id, { activeStrategyVersion: version });
}

export async function getActiveStrategy(member) {
  if (!member.activeStrategyVersion) return null;
  const db = requireDb();
  const snap = await getDoc(doc(db, COL.members, member.id, 'strategies', `v${member.activeStrategyVersion}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function parseJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function validateRules(rules) {
  const errors = [];
  if (!rules || typeof rules !== 'object') return ['rules 가 없어요.'];

  if (rules.market !== 'binance_spot') errors.push('market 은 binance_spot 이어야 해요.');
  if (!Array.isArray(rules.symbols) || rules.symbols.length === 0) {
    errors.push('종목(symbols)이 없어요.');
  } else if (!rules.symbols.every((s) => typeof s === 'string' && /^[A-Z0-9]{2,15}USDT$/.test(s))) {
    errors.push('종목은 BTCUSDT 같은 USDT 마켓 이름이어야 해요.');
  }
  if (!TIMEFRAMES.includes(rules.timeframe)) errors.push(`timeframe 은 ${TIMEFRAMES.join(', ')} 중 하나여야 해요.`);
  if (!isPositive(rules.checkEveryMinutes)) errors.push('checkEveryMinutes(확인 주기)가 없어요.');

  const entryConds = rules.entry?.conditions;
  if (!Array.isArray(entryConds) || entryConds.length === 0) errors.push('진입 조건이 없어요.');
  else entryConds.forEach((c, i) => checkCondition(c, `진입 조건 ${i + 1}`, errors));
  if (rules.entry && !['all', 'any'].includes(rules.entry.logic)) errors.push('진입 logic 은 all 또는 any 여야 해요.');

  const exit = rules.exit || {};
  if (!isPositive(exit.stopLossPct) || exit.stopLossPct > 50) errors.push('손절(stopLossPct)은 0~50% 사이로 반드시 있어야 해요.');
  if (exit.takeProfitPct != null && !isPositive(exit.takeProfitPct)) errors.push('익절(takeProfitPct)이 올바르지 않아요.');
  if (exit.maxHoldHours != null && !isPositive(exit.maxHoldHours)) errors.push('최대 보유시간(maxHoldHours)이 올바르지 않아요.');
  if (Array.isArray(exit.conditions)) exit.conditions.forEach((c, i) => checkCondition(c, `청산 조건 ${i + 1}`, errors));

  if (!isPositive(rules.position?.quoteAmountUsdt)) errors.push('1회 매수 금액(quoteAmountUsdt)이 없어요.');
  if (rules.position?.maxOpenPositions != null && !isPositive(rules.position.maxOpenPositions)) {
    errors.push('maxOpenPositions 가 올바르지 않아요.');
  }
  return errors;
}

function checkCondition(c, label, errors) {
  if (!c || typeof c !== 'object') return errors.push(`${label}: 형식 오류`);
  if (!INDICATORS[c.indicator]) errors.push(`${label}: 지원하지 않는 지표 '${c.indicator}'`);
  if (!OPERATORS.includes(c.op)) errors.push(`${label}: 지원하지 않는 비교 '${c.op}'`);
  const v = c.value;
  const valueOk =
    typeof v === 'number' || (v && typeof v === 'object' && INDICATORS[v.indicator]);
  if (!valueOk) errors.push(`${label}: value 는 숫자 또는 지표여야 해요.`);
}

function isPositive(n) {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}
