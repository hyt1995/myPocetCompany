// 마케팅사업부 직원·부서 공통 지침을 Firestore 에 저장하고 읽는다.
//
// mpc_mkt_members/{memberId}     직원 (처음 열 때 marketing/team.js 의 TEAM 으로 만든다)
// mpc_mkt_settings/department    부서 공통 지침 (없으면 기본 회의 규칙을 보여 준다)
//
// 읽기: 부서 화면을 열 때 직원 컬렉션 1번 + 설정 문서 1번. 주기적으로 읽지 않는다.

import { collection, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { httpError, requireDb } from '../core/server';
import {
  DEFAULT_COMMON_GUIDELINE,
  findSeed,
  LEGACY_COMMON_GUIDELINE_HASHES,
  LEGACY_DEFAULT_PROMPT_HASHES,
  promptHash,
  TEAM,
} from '../team';
import { MKT_COL, SETTINGS_DOC } from './collections';
import { cleanGuideline, cleanMemberPatch, toMember } from './fields';

export async function listTeam() {
  const db = requireDb();
  const snap = await getDocs(collection(db, MKT_COL.members));
  const existing = new Map(snap.docs.map((d) => [d.id, d.data()]));

  // 기본 직원이 DB에 없으면 만든다. 예전 버전 직원(팀 없음)은 신사업팀으로 옮긴다.
  for (const seed of TEAM) {
    const old = existing.get(seed.id);
    if (old && !old.teamId) {
      const patch = { teamId: seed.teamId, title: seed.title, updatedAt: Date.now() };
      // 사장님이 지침을 고친 적이 없으면(예전 기본 지침 그대로) 새 기본 지침으로 바꾼다.
      if (LEGACY_DEFAULT_PROMPT_HASHES.includes(promptHash(old.systemPrompt))) {
        patch.systemPrompt = seed.systemPrompt;
        patch.role = seed.role;
      }
      await updateDoc(doc(db, MKT_COL.members, seed.id), patch);
      existing.set(seed.id, { ...old, ...patch });
      continue;
    }
    if (old) continue;
    const data = {
      teamId: seed.teamId,
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
  // 저장된 값이 없거나 예전 기본 규칙 그대로면 새 기본 규칙을 쓴다.
  const saved =
    typeof d?.commonGuideline === 'string' && !LEGACY_COMMON_GUIDELINE_HASHES.includes(promptHash(d.commonGuideline))
      ? d.commonGuideline
      : null;
  return {
    commonGuideline: saved ?? DEFAULT_COMMON_GUIDELINE,
    isDefault: saved === null,
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

// 직원이 일할 때 읽는 전체 지침 = 부서 공통 지침 + 직원 지침 + 이번 일의 지시(extra).
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
