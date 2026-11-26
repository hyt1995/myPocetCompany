// 마케팅사업부 직원·부서 공통 지침을 Firestore 에 저장하고 읽는다.
//
// mpc_mkt_members/{memberId}     직원 (처음 열 때 marketing/team.js 의 TEAM 으로 만든다)
// mpc_mkt_settings/department    부서 공통 지침 (없으면 기본 회의 규칙을 보여 준다)
//
// 읽기: 부서 화면을 열 때 직원 컬렉션 1번 + 설정 문서 1번. 주기적으로 읽지 않는다.

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpError, requireDb } from '../core/server';
import { DEFAULT_COMMON_GUIDELINE, findSeed, TEAM } from '../team';
import { MKT_COL, SETTINGS_DOC } from './collections';
import { cleanGuideline, cleanMemberPatch, toMember } from './fields';

export async function listTeam() {
  const db = requireDb();
  const snap = await getDocs(collection(db, MKT_COL.members));
  const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));

  // 기본 직원이 DB에 없으면 만든다.
  for (const seed of TEAM) {
    if (existing.has(seed.id)) continue;
    const data = {
      order: seed.order,
      title: seed.title,
      name: seed.name,
      role: seed.role,
      model: seed.model,
      systemPrompt: seed.systemPrompt,
      updatedAt: Date.now(),
      createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, MKT_COL.members, seed.id), data);
    existing.set(seed.id, data);
  }

  return [...existing.entries()]
    .map(([id, data]) => toMember(id, data, findSeed(id)))
    .sort((a, b) => a.order - b.order);
}

export async function getMarketingMember(memberId) {
  const db = requireDb();
  const snap = await getDoc(doc(db, MKT_COL.members, memberId));
  if (!snap.exists()) return null;
  return toMember(snap.id, snap.data(), findSeed(snap.id));
}

// 직원 수정. resetPrompt: true 이면 지침을 marketing/team.js 의 기본 지침으로 되돌린다.
export async function updateMarketingMember(memberId, fields = {}) {
  const current = await getMarketingMember(memberId);
  if (!current) throw httpError(404, '마케팅사업부 직원을 찾을 수 없어요.');

  const patch = cleanMemberPatch(fields);
  if (fields.resetPrompt === true) {
    const seed = findSeed(memberId);
    if (!seed) throw httpError(400, '기본 지침이 없는 직원이에요.');
    patch.systemPrompt = seed.systemPrompt;
  }
  if (Object.keys(patch).length === 0) throw httpError(400, '바꿀 내용이 없어요.');

  patch.updatedAt = Date.now();
  await updateDoc(doc(requireDb(), MKT_COL.members, memberId), patch);
  return getMarketingMember(memberId);
}

export async function getMarketingSettings() {
  const snap = await getDoc(doc(requireDb(), MKT_COL.settings, SETTINGS_DOC));
  const d = snap.exists() ? snap.data() : null;
  return {
    commonGuideline: typeof d?.commonGuideline === 'string' ? d.commonGuideline : DEFAULT_COMMON_GUIDELINE,
    isDefault: !d || typeof d.commonGuideline !== 'string',
    updatedAt: d?.updatedAt || null,
  };
}

export async function updateMarketingSettings({ commonGuideline }) {
  await setDoc(
    doc(requireDb(), MKT_COL.settings, SETTINGS_DOC),
    { commonGuideline: cleanGuideline(commonGuideline), updatedAt: Date.now() },
    { merge: true },
  );
  return getMarketingSettings();
}

// 직원이 일할 때 읽는 전체 지침 = 부서 공통 지침(회의 규칙) + 직원 지침. (회의실 단계에서 쓴다)
export async function buildMarketingSystemPrompt(member, extra = '') {
  const { commonGuideline } = await getMarketingSettings();
  return [
    commonGuideline && `[부서 공통 지침]\n${commonGuideline}`,
    member.systemPrompt && `[내 지침]\n${member.systemPrompt}`,
    extra,
  ]
    .filter(Boolean)
    .join('\n\n');
}
