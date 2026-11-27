// 회사 게시판 저장소. mpc_board_posts/{postId}
//
// 부서가 쓴 보고서(신사업팀 주간 보고서·월요일 경제 브리핑 등)를 회사 전체가 같이 본다.
// 같은 id 로 다시 쓰면 덮어쓴다 (예: 이번 주 보고서를 다시 쓰면 글이 하나로 유지된다).
// 읽기: 목록 화면을 열 때 최근 30개, 글을 열 때 1개. 주기적으로 읽지 않는다.

import { doc, getDoc, getDocs, collection, limit, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpError, requireDb } from '../core/server';
import { BOARD_COL, cleanPost, isPostId, POST_KINDS, toListItem } from '../fields';

export async function publishPost(input) {
  const post = cleanPost(input);
  const ref = doc(requireDb(), BOARD_COL, input.id);
  const prev = await getDoc(ref);
  const now = Date.now();
  await setDoc(ref, {
    ...post,
    at: prev.exists() ? prev.data().at || now : now,
    updatedAt: now,
    createdAt: prev.exists() ? prev.data().createdAt || serverTimestamp() : serverTimestamp(),
  });
  return { id: input.id, link: `/board/${input.id}` };
}

export async function listPosts(count = 30) {
  const snap = await getDocs(query(collection(requireDb(), BOARD_COL), orderBy('at', 'desc'), limit(count)));
  return snap.docs.map((d) => toListItem(d.id, d.data()));
}

export async function getPost(postId) {
  if (!isPostId(postId)) throw httpError(400, '글 주소가 잘못됐어요.');
  const snap = await getDoc(doc(requireDb(), BOARD_COL, postId));
  if (!snap.exists()) throw httpError(404, '글을 찾을 수 없어요.');
  const d = snap.data();
  return { ...toListItem(snap.id, d), body: d.body, sources: d.sources || [], link: d.link || null };
}

export { POST_KINDS };
