// 직원 학습 자료: 내 글, URL, 사진.
// 자료는 넣을 때 딱 한 번만 AI(가성비 모델)가 읽고 '매매에 쓸 수 있는 내용'만 뽑아 summary로 저장한다.
// 원본 사진은 저장하지 않는다 (토큰·용량 절약). 전략을 만들 때는 summary만 읽는다.
//
// mpc_members/{memberId}/materials/{id}
//   type: 'text' | 'url' | 'image'
//   title, source(글 원문 앞부분 또는 URL), summary, status: 'ready' | 'error', error, at, costUsd

import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query } from 'firebase/firestore';
import { callClaude, MODELS } from './claude';
import { COL, requireDb } from './firebase';

const SHORT_TEXT = 1500; // 이보다 짧은 글은 AI 없이 그대로 저장
const MAX_TEXT = 20000;
const MAX_URL_TEXT = 20000;
const MAX_IMAGE_BYTES = 3_500_000;

const EXTRACT_PROMPT = `너는 매매 자료 정리 담당이다. 주어진 자료에서 코인(또는 주식) 매매에 쓸 수 있는 내용만 한국어로 뽑아라.
- 종목, 진입 조건, 청산(익절·손절) 조건, 지표와 수치, 시간 단위(봉), 보유 기간, 근거
- 글쓴이가 주장한 성과(수익률 등)는 '주장'이라고 표시
- 자료에 없는 내용은 절대 만들지 않는다
- 매매에 쓸 내용이 없으면 "매매 관련 내용 없음"이라고만 적는다
- 짧은 항목 목록으로 정리한다`;

export async function listMaterials(memberId) {
  const db = requireDb();
  const snap = await getDocs(
    query(collection(db, COL.members, memberId, 'materials'), orderBy('at', 'desc')),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deleteMaterial(memberId, materialId) {
  const db = requireDb();
  await deleteDoc(doc(db, COL.members, memberId, 'materials', materialId));
}

// input: { type: 'text', content, title? } | { type: 'url', url } | { type: 'image', data(base64), mediaType, title? }
export async function addMaterial(member, input) {
  let record;
  try {
    if (input.type === 'text') record = await fromText(member, input);
    else if (input.type === 'url') record = await fromUrl(member, input);
    else if (input.type === 'image') record = await fromImage(member, input);
    else throw new Error('알 수 없는 자료 종류예요.');
  } catch (err) {
    record = {
      type: input.type,
      title: input.title || (input.type === 'url' ? input.url : '자료'),
      source: input.type === 'url' ? String(input.url || '') : '',
      summary: '',
      status: 'error',
      error: err.message,
      costUsd: null,
    };
  }

  const db = requireDb();
  const data = { ...record, at: Date.now() };
  const ref = await addDoc(collection(db, COL.members, member.id, 'materials'), data);
  return { id: ref.id, ...data };
}

async function fromText(member, { content, title }) {
  const text = String(content || '').trim().slice(0, MAX_TEXT);
  if (!text) throw new Error('글 내용을 입력해 주세요.');
  const base = {
    type: 'text',
    title: String(title || '').trim().slice(0, 80) || firstLine(text),
    source: text.slice(0, 300),
  };
  if (text.length <= SHORT_TEXT) {
    return { ...base, summary: text, status: 'ready', error: null, costUsd: 0 };
  }
  const r = await extract(member, [{ type: 'text', text }], 'material-text');
  return { ...base, summary: r.reply, status: 'ready', error: null, costUsd: r.costUsd };
}

async function fromUrl(member, { url }) {
  let parsed;
  try {
    parsed = new URL(String(url || '').trim());
  } catch {
    throw new Error('주소 형식이 올바르지 않아요.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('http(s) 주소만 넣을 수 있어요.');

  const blocked = ['instagram.com', 'threads.net', 'threads.com', 'youtube.com', 'youtu.be', 'facebook.com', 'x.com', 'twitter.com', 'tiktok.com'];
  const host = parsed.hostname.replace(/^www\./, '');
  const isSns = blocked.some((b) => host === b || host.endsWith(`.${b}`));

  let res;
  try {
    res = await fetch(parsed.toString(), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MyPocketCompanyBot/1.0)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(snsHint(isSns, '페이지를 열지 못했어요.'));
  }
  if (!res.ok) throw new Error(snsHint(isSns, `페이지를 열지 못했어요 (HTTP ${res.status}).`));

  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html') && !type.includes('text/plain')) {
    throw new Error('글로 된 페이지만 읽을 수 있어요. 사진이나 영상은 캡처해서 넣어 주세요.');
  }

  const raw = (await res.text()).slice(0, 1_500_000);
  const pageTitle = (raw.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || '').trim();
  const text = htmlToText(raw).slice(0, MAX_URL_TEXT);
  if (text.length < 200) {
    throw new Error(snsHint(isSns, '페이지에서 읽을 수 있는 글이 거의 없어요.'));
  }

  const r = await extract(member, [{ type: 'text', text: `[출처] ${parsed}\n\n${text}` }], 'material-url');
  return {
    type: 'url',
    title: decodeEntities(pageTitle).slice(0, 80) || host,
    source: parsed.toString(),
    summary: r.reply,
    status: 'ready',
    error: null,
    costUsd: r.costUsd,
  };
}

async function fromImage(member, { data, mediaType, title }) {
  const b64 = String(data || '');
  if (!b64) throw new Error('사진이 비어 있어요.');
  if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) throw new Error('사진이 너무 커요.');
  const type = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType)
    ? mediaType
    : 'image/jpeg';

  const r = await extract(
    member,
    [
      { type: 'image', source: { type: 'base64', media_type: type, data: b64 } },
      { type: 'text', text: '이 캡처 이미지의 글자와 차트에서 매매에 쓸 수 있는 내용을 뽑아라.' },
    ],
    'material-image',
  );
  return {
    type: 'image',
    title: String(title || '').trim().slice(0, 80) || '캡처 이미지',
    source: '',
    summary: r.reply,
    status: 'ready',
    error: null,
    costUsd: r.costUsd,
  };
}

function extract(member, content, purpose) {
  return callClaude({
    department: member.departmentId,
    memberId: member.id,
    purpose,
    model: MODELS.cheap,
    system: EXTRACT_PROMPT,
    messages: [{ role: 'user', content }],
    maxTokens: 900,
  });
}

function snsHint(isSns, message) {
  return isSns
    ? `${message} 유튜브·인스타·쓰레드 같은 SNS는 로그인이 필요해서 읽기 어려워요. 캡처하거나 내용을 글로 넣어 주세요.`
    : message;
}

function firstLine(text) {
  return text.split('\n').find((l) => l.trim())?.trim().slice(0, 40) || '내 글';
}

export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
