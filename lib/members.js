// AI 직원(팀원)과 부서 공통 지침, 직원의 대화·결과를 Firestore에 저장하고 읽는다.
//
// mpc_departments/{deptId}               부서 공통 지침
// mpc_members/{memberId}                 직원 정보 (이름, 역할, 매매 방법, 모델 등급, 지침, 프로그램 모드)
// mpc_members/{memberId}/messages/{id}   업무 채팅 (role: user | assistant)
// mpc_members/{memberId}/results/{id}    결과물 (지시, 결과, 상태: new | approved)

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { departments, findDepartment } from './departments';
import { COL, requireDb } from './firebase';
import { normalizeSchedule } from './schedule';

function safeSchedule(s) {
  try {
    return normalizeSchedule(s);
  } catch {
    return { type: 'strategy' };
  }
}

const MAX_PROMPT_CHARS = 8000;
// 프로그램 자동 실행 모드. 실전(live)은 자동 모드로 두지 않는다:
// 실제 돈은 사장님이 [실제 매수/매도] 버튼으로 보낸 서명된 명령으로만 움직인다.
export const MODES = ['stopped', 'paper'];
export const DEFAULT_PAPER_CAPITAL = 1000; // USDT, 모의매매 시작 가상자금

function toMember(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    departmentId: d.departmentId,
    name: d.name,
    role: d.role || '',
    method: d.method || '',
    model: d.model === 'smart' ? 'smart' : 'cheap',
    systemPrompt: d.systemPrompt || '',
    mode: MODES.includes(d.mode) ? d.mode : 'stopped',
    autoRun: Boolean(d.autoRun),
    schedule: safeSchedule(d.schedule),
    paperCapitalUsdt:
      typeof d.paperCapitalUsdt === 'number' ? d.paperCapitalUsdt : DEFAULT_PAPER_CAPITAL,
    activeStrategyVersion:
      typeof d.activeStrategyVersion === 'number' ? d.activeStrategyVersion : null,
    createdAt: d.createdAtMs || 0,
    updatedAt: d.updatedAt || null,
  };
}

// 부서의 기본 직원이 DB에 없으면 만든다.
async function ensureDefaultMembers(dept) {
  const db = requireDb();
  for (const seed of dept.defaultMembers) {
    const ref = doc(db, COL.members, seed.id);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        departmentId: dept.id,
        name: seed.name,
        role: seed.role,
        method: seed.method || '',
        model: seed.model,
        systemPrompt: seed.systemPrompt,
        mode: 'stopped',
        autoRun: false,
        paperCapitalUsdt: DEFAULT_PAPER_CAPITAL,
        activeStrategyVersion: null,
        createdAtMs: 0, // 기본 직원은 항상 맨 앞
        updatedAt: Date.now(),
        createdAt: serverTimestamp(),
      });
    }
  }
}

export async function listMembers(departmentId) {
  const dept = findDepartment(departmentId);
  if (!dept) return [];
  await ensureDefaultMembers(dept);
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COL.members), where('departmentId', '==', departmentId)),
  );
  return snap.docs.map(toMember).sort((a, b) => a.createdAt - b.createdAt);
}

export async function createMember(departmentId, { name, role, method }) {
  const dept = findDepartment(departmentId);
  if (!dept) throw new Error('없는 부서예요.');
  const db = requireDb();
  const now = Date.now();
  const ref = await addDoc(collection(db, COL.members), {
    departmentId,
    name: String(name || '').trim().slice(0, 40) || '새 직원',
    role: String(role || '').trim().slice(0, 100),
    method: String(method || '').trim().slice(0, 100),
    model: 'cheap',
    systemPrompt: dept.newMemberPrompt || '',
    mode: 'stopped',
    autoRun: false,
    paperCapitalUsdt: DEFAULT_PAPER_CAPITAL,
    activeStrategyVersion: null,
    createdAtMs: now,
    updatedAt: now,
    createdAt: serverTimestamp(),
  });
  return getMember(ref.id);
}

// 기본 직원(예: secretary-1)은 처음 읽을 때 만들어 준다.
export async function getMember(memberId) {
  const db = requireDb();
  let snap = await getDoc(doc(db, COL.members, memberId));
  if (!snap.exists()) {
    const dept = departmentOfDefaultMember(memberId);
    if (!dept) return null;
    await ensureDefaultMembers(dept);
    snap = await getDoc(doc(db, COL.members, memberId));
    if (!snap.exists()) return null;
  }
  return toMember(snap);
}

function departmentOfDefaultMember(memberId) {
  // 자기 모듈이 있는 부서(예: 마케팅사업부)의 직원은 공용 직원 코드가 만들지 않는다.
  return departments.find((d) => !d.ownModule && d.defaultMembers.some((m) => m.id === memberId)) || null;
}

export async function updateMember(memberId, fields) {
  const db = requireDb();
  const patch = { updatedAt: Date.now() };
  if (typeof fields.name === 'string') patch.name = fields.name.trim().slice(0, 40) || '이름 없음';
  if (typeof fields.role === 'string') patch.role = fields.role.trim().slice(0, 100);
  if (typeof fields.method === 'string') patch.method = fields.method.trim().slice(0, 100);
  if (fields.model === 'cheap' || fields.model === 'smart') patch.model = fields.model;
  if (typeof fields.systemPrompt === 'string') {
    patch.systemPrompt = fields.systemPrompt.slice(0, MAX_PROMPT_CHARS);
  }
  if (MODES.includes(fields.mode)) patch.mode = fields.mode;
  if (typeof fields.autoRun === 'boolean') patch.autoRun = fields.autoRun;
  if (fields.schedule !== undefined) {
    try {
      patch.schedule = normalizeSchedule(fields.schedule);
    } catch (err) {
      err.status = 400;
      throw err;
    }
  }
  if (typeof fields.paperCapitalUsdt === 'number' && fields.paperCapitalUsdt > 0) {
    patch.paperCapitalUsdt = Math.min(fields.paperCapitalUsdt, 10_000_000);
  }
  if (fields.activeStrategyVersion === null || typeof fields.activeStrategyVersion === 'number') {
    patch.activeStrategyVersion = fields.activeStrategyVersion;
  }
  await updateDoc(doc(db, COL.members, memberId), patch);
  return getMember(memberId);
}

// ---- 부서 공통 지침 ----

export async function getDepartmentSettings(departmentId) {
  const db = requireDb();
  const snap = await getDoc(doc(db, COL.departments, departmentId));
  const d = snap.exists() ? snap.data() : {};
  return { commonGuideline: d.commonGuideline || '', updatedAt: d.updatedAt || null };
}

export async function updateDepartmentSettings(departmentId, { commonGuideline }) {
  const db = requireDb();
  await setDoc(
    doc(db, COL.departments, departmentId),
    { commonGuideline: String(commonGuideline || '').slice(0, MAX_PROMPT_CHARS), updatedAt: Date.now() },
    { merge: true },
  );
  return getDepartmentSettings(departmentId);
}

// 직원이 일할 때 읽는 전체 지침 = 부서 공통 지침 + 직원 지침
export async function buildSystemPrompt(member, extra = '') {
  const { commonGuideline } = await getDepartmentSettings(member.departmentId);
  return [
    commonGuideline && `[부서 공통 지침]\n${commonGuideline}`,
    member.systemPrompt && `[내 지침]\n${member.systemPrompt}`,
    extra,
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---- 대화·결과 ----

// 최근 대화 (오래된 것 → 최신 순)
export async function getMessages(memberId, count = 50) {
  const db = requireDb();
  const q = query(
    collection(db, COL.members, memberId, 'messages'),
    orderBy('at', 'desc'),
    limit(count),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).reverse();
}

export async function addMessage(memberId, { role, content, at, proposalIds = [] }) {
  const db = requireDb();
  await addDoc(collection(db, COL.members, memberId, 'messages'), {
    role,
    content,
    proposalIds,
    at: at || Date.now(),
  });
}

// 최근 결과물 (최신 → 오래된 순)
export async function getResults(memberId, count = 30) {
  const db = requireDb();
  const q = query(
    collection(db, COL.members, memberId, 'results'),
    orderBy('at', 'desc'),
    limit(count),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addResult(memberId, { task, output, model, costUsd }) {
  const db = requireDb();
  const ref = await addDoc(collection(db, COL.members, memberId, 'results'), {
    task,
    output,
    model,
    costUsd: typeof costUsd === 'number' ? costUsd : null,
    status: 'new',
    at: Date.now(),
  });
  return ref.id;
}

export async function setResultStatus(memberId, resultId, status) {
  const db = requireDb();
  await updateDoc(doc(db, COL.members, memberId, 'results', resultId), {
    status,
    statusAt: Date.now(),
  });
}
