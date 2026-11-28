// 조사 실행. 조사 1번 = mpc_rsh_runs 문서 1개.
//
// 서버 한 번 호출이 너무 오래 걸리지 않게 키워드를 BATCH_SIZE 개씩 나눠 처리한다.
// 화면이 [조사 시작] 후 '다음 묶음'을 차례로 부른다 (화면이 열려 있는 동안만, 주기적으로 묻지 않는다).
// 쓰기: 묶음 1개당 문서 1번 (200개 = 20번). 읽기: 묶음 1개당 문서 1번.

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { BATCH_SIZE } from '../capabilities.js';
import { trendRange } from '../dates.js';
import { buildRow, rankRows, trendMetrics } from '../metrics.js';
import { compactKeyword, validatePlan } from '../plan.js';
import { describeRanking, safeRanking, validateRanking } from '../ranking.js';
import { keyStatus } from '../sources/keys.js';
import { DATALAB_PER_CALL, fetchBlogTotal, fetchTrends } from '../sources/naverHub.js';
import { fetchKeywordStats, SEARCHAD_PER_CALL } from '../sources/searchad.js';
import { httpError, requireDb } from '../core/server';
import { RSH_COL } from './collections.js';

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// requestedBy: { module: 'marketing' | 'research', refId } — 누가 맡긴 조사인지
export async function createRun(input, requestedBy = { module: 'research', refId: null }) {
  const { ok, errors, plan } = validatePlan(input);
  if (!ok) throw httpError(400, `조사 계획을 실행할 수 없어요: ${errors.slice(0, 5).join(' / ')}`);

  const status = keyStatus();
  if (!status.ready.searchad && !status.ready.hub) {
    throw httpError(400, '네이버 API 키가 하나도 없어요. Vercel 환경변수에 키를 넣고 Redeploy 해 주세요.');
  }

  const ref = doc(collection(requireDb(), RSH_COL.runs));
  const now = Date.now();
  await setDoc(ref, {
    title: plan.title,
    keywords: plan.keywords,
    ranking: plan.ranking,
    total: plan.keywords.length,
    cursor: 0,
    status: 'ready', // ready → running → done
    range: trendRange(now),
    sources: { searchad: status.ready.searchad, datalab: status.ready.hub, blog: status.ready.hub },
    rows: {},
    errors: [],
    requestedBy: { module: String(requestedBy.module || 'research'), refId: requestedBy.refId || null },
    createdAt: serverTimestamp(),
    at: now,
    updatedAt: now,
    finishedAt: null,
  });
  return getRun(ref.id);
}

function toRun(id, d) {
  const ranking = safeRanking(d.ranking);
  return {
    id,
    title: d.title,
    status: d.status,
    total: d.total,
    done: d.cursor,
    range: d.range,
    sources: d.sources,
    errors: d.errors || [],
    requestedBy: d.requestedBy || null,
    at: d.at,
    updatedAt: d.updatedAt,
    finishedAt: d.finishedAt,
    ranking,
    rankingLabel: describeRanking(ranking),
    ranked: rankRows(d.rows || {}, ranking),
  };
}

export async function getRun(runId) {
  const snap = await getDoc(doc(requireDb(), RSH_COL.runs, runId));
  if (!snap.exists()) return null;
  return toRun(snap.id, snap.data());
}

// 줄 세우기 기준 바꾸기. 네이버를 다시 부르지 않는다 (이미 잰 숫자를 다시 정렬할 뿐). 쓰기 1번.
export async function updateRunRanking(runId, input) {
  const { ok, errors, ranking } = validateRanking(input);
  if (!ok) throw httpError(400, `줄 세우기 기준을 쓸 수 없어요: ${errors.join(' / ')}`);
  const ref = doc(requireDb(), RSH_COL.runs, runId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw httpError(404, '조사를 찾을 수 없어요.');
  await updateDoc(ref, { ranking, updatedAt: Date.now() });
  return toRun(snap.id, { ...snap.data(), ranking });
}

// 최근 조사 목록 (결과 표 없이 요약만)
export async function listRuns(count = 10) {
  const snap = await getDocs(query(collection(requireDb(), RSH_COL.runs), orderBy('at', 'desc'), limitTo(count)));
  return snap.docs.map((d) => {
    const v = d.data();
    return { id: d.id, title: v.title, status: v.status, total: v.total, done: v.cursor, at: v.at, requestedBy: v.requestedBy || null };
  });
}

// 다음 묶음 처리. expectedCursor 가 다르면 (다른 화면이 이미 처리 중) 아무것도 하지 않고 지금 상태를 돌려준다.
export async function runNextBatch(runId, expectedCursor) {
  const ref = doc(requireDb(), RSH_COL.runs, runId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw httpError(404, '조사를 찾을 수 없어요.');
  const d = snap.data();
  if (d.status === 'done') return toRun(snap.id, d);
  if (typeof expectedCursor === 'number' && expectedCursor !== d.cursor) return toRun(snap.id, d);

  const batch = d.keywords.slice(d.cursor, d.cursor + BATCH_SIZE);
  const raw = Object.fromEntries(batch.map((k) => [k.id, { errors: [] }]));
  const runErrors = [];
  const note = (ids, message) => {
    for (const id of ids) raw[id].errors.push(message);
    if (!runErrors.includes(message)) runErrors.push(message);
  };

  // 1) 검색광고: 5개씩
  if (d.sources?.searchad) {
    for (const group of chunk(batch, SEARCHAD_PER_CALL)) {
      try {
        const found = await fetchKeywordStats(group.map((k) => k.keyword));
        for (const k of group) raw[k.id].searchad = found.get(compactKeyword(k.keyword)) || null;
      } catch (err) {
        note(group.map((k) => k.id), err.message);
      }
    }
  }

  // 2) 데이터랩: 5개씩
  if (d.sources?.datalab) {
    for (const group of chunk(batch, DATALAB_PER_CALL)) {
      try {
        const trends = await fetchTrends(group.map((k) => k.keyword), d.range);
        for (const k of group) raw[k.id].trend = trendMetrics(trends.get(k.keyword), d.range.months);
      } catch (err) {
        note(group.map((k) => k.id), err.message);
      }
    }
  }

  // 3) 블로그 글 수: 5개씩 동시에
  if (d.sources?.blog) {
    for (const group of chunk(batch, 5)) {
      await Promise.all(
        group.map(async (k) => {
          try {
            raw[k.id].blogTotal = await fetchBlogTotal(k.keyword);
          } catch (err) {
            note([k.id], err.message);
          }
        }),
      );
    }
  }

  const cursor = d.cursor + batch.length;
  const finished = cursor >= d.total;
  const patch = {
    cursor,
    status: finished ? 'done' : 'running',
    updatedAt: Date.now(),
    errors: [...new Set([...(d.errors || []), ...runErrors])].slice(-20),
  };
  if (finished) patch.finishedAt = Date.now();
  for (const k of batch) patch[`rows.${k.id}`] = buildRow(k.keyword, raw[k.id]);
  await updateDoc(ref, patch);

  return getRun(runId);
}
