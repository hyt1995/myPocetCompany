// AI 팀원과 팀원의 대화·결과를 Firestore에 저장하고 읽는다.
//
// mpc_members/{memberId}                 팀원 정보 (이름, 역할, 모델 등급, 지침=시스템 프롬프트)
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
} from 'firebase/firestore';
import { findDepartment } from './departments';
import { COL, requireDb } from './firebase';

const MAX_PROMPT_CHARS = 8000;

function toMember(snap) {
  const d = snap.data();
  return {
    id: snap.id,
    departmentId: d.departmentId,
    name: d.name,
    role: d.role,
    model: d.model === 'smart' ? 'smart' : 'cheap',
    systemPrompt: d.systemPrompt || '',
    updatedAt: d.updatedAt || null,
  };
}

// 부서의 팀원 목록. DB에 없으면 기본 팀원을 만들어 둔다.
export async function listMembers(departmentId) {
  const dept = findDepartment(departmentId);
  if (!dept) return [];
  const db = requireDb();

  const members = [];
  for (const seed of dept.defaultMembers) {
    const ref = doc(db, COL.members, seed.id);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        departmentId,
        name: seed.name,
        role: seed.role,
        model: seed.model,
        systemPrompt: seed.systemPrompt,
        updatedAt: Date.now(),
        createdAt: serverTimestamp(),
      });
      snap = await getDoc(ref);
    }
    members.push(toMember(snap));
  }
  return members;
}

export async function getMember(memberId) {
  const db = requireDb();
  const snap = await getDoc(doc(db, COL.members, memberId));
  return snap.exists() ? toMember(snap) : null;
}

export async function updateMember(memberId, fields) {
  const db = requireDb();
  const patch = { updatedAt: Date.now() };
  if (typeof fields.name === 'string') patch.name = fields.name.trim().slice(0, 40) || '이름 없음';
  if (typeof fields.role === 'string') patch.role = fields.role.trim().slice(0, 100);
  if (fields.model === 'cheap' || fields.model === 'smart') patch.model = fields.model;
  if (typeof fields.systemPrompt === 'string') {
    patch.systemPrompt = fields.systemPrompt.slice(0, MAX_PROMPT_CHARS);
  }
  await updateDoc(doc(db, COL.members, memberId), patch);
  return getMember(memberId);
}

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

export async function addMessage(memberId, { role, content, at }) {
  const db = requireDb();
  await addDoc(collection(db, COL.members, memberId, 'messages'), {
    role,
    content,
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
