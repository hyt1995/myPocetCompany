'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCost, formatTime } from '../format';
import { useApi } from '../passcode';

const KINDS = [
  { id: 'image', label: '사진' },
  { id: 'url', label: 'URL' },
  { id: 'text', label: '내 글' },
];
const TYPE_LABELS = { image: '사진', url: 'URL', text: '글' };

// 학습 탭: 자료(사진·URL·글)를 넣으면 직원이 한 번 읽고 매매에 쓸 내용만 정리해 저장한다.
export default function LearnTab({ member, onGoStrategy }) {
  const api = useApi();
  const [materials, setMaterials] = useState([]);
  const [kind, setKind] = useState('image');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    return api(`/api/members/${member.id}/materials`)
      .then((d) => setMaterials(d.materials || []))
      .catch((err) => setError(err.message));
  }, [api, member.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function post(body) {
    const d = await api(`/api/members/${member.id}/materials`, { method: 'POST', body: JSON.stringify(body) });
    setMaterials((prev) => [d.material, ...prev]);
    return d.material;
  }

  async function submitText(e) {
    e.preventDefault();
    setError('');
    setBusy('글을 읽는 중…');
    try {
      await post({ type: 'text', content: text, title });
      setText('');
      setTitle('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function submitUrl(e) {
    e.preventDefault();
    setError('');
    setBusy('페이지를 읽는 중…');
    try {
      const m = await post({ type: 'url', url });
      if (m.status === 'ready') setUrl('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function submitImages(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError('');
    try {
      for (let i = 0; i < files.length; i += 1) {
        setBusy(`사진 읽는 중… (${i + 1}/${files.length})`);
        const data = await resizeImage(files[i]);
        await post({ type: 'image', data, mediaType: 'image/jpeg', title: files[i].name });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function remove(m) {
    if (!window.confirm(`'${m.title}' 자료를 지울까요?`)) return;
    try {
      await api(`/api/members/${member.id}/materials/${m.id}`, { method: 'DELETE' });
      setMaterials((prev) => prev.filter((x) => x.id !== m.id));
    } catch (err) {
      setError(err.message);
    }
  }

  const readyCount = materials.filter((m) => m.status === 'ready').length;

  return (
    <>
      <section className="panel">
        <h2>자료 넣기</h2>
        <p className="hint">
          넣는 순간 직원이 한 번만 읽고 매매에 쓸 내용만 정리해 저장해요. 원본 사진은 저장하지 않아요.
          유튜브·인스타·쓰레드는 주소로는 잘 안 읽혀서 캡처나 글로 넣는 게 확실해요.
        </p>

        <div className="seg" role="tablist">
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              className={k.id === kind ? 'seg-btn active' : 'seg-btn'}
              onClick={() => setKind(k.id)}
            >
              {k.label}
            </button>
          ))}
        </div>

        {kind === 'image' && (
          <div className="ask">
            <label className="file-pick">
              <input type="file" accept="image/*" multiple onChange={submitImages} disabled={Boolean(busy)} />
              <span>{busy || '캡처 사진 선택 (여러 장 가능)'}</span>
            </label>
          </div>
        )}

        {kind === 'url' && (
          <form onSubmit={submitUrl} className="ask">
            <input
              type="url"
              inputMode="url"
              placeholder="https://..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" disabled={Boolean(busy) || !url.trim()}>
              {busy || '주소 넣기'}
            </button>
          </form>
        )}

        {kind === 'text' && (
          <form onSubmit={submitText} className="ask">
            <input placeholder="제목 (선택)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              rows={6}
              placeholder="매매 방법, 조건, 메모를 자유롭게 적어 주세요"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={Boolean(busy) || !text.trim()}>
              {busy || '글 넣기'}
            </button>
          </form>
        )}

        {error && <p className="msg error">{error}</p>}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>학습 자료 {materials.length}개</h2>
          {readyCount > 0 && (
            <button type="button" className="link-btn" onClick={onGoStrategy}>
              이 자료로 전략 만들기 →
            </button>
          )}
        </div>
        {materials.length === 0 && <p className="hint">아직 자료가 없어요.</p>}
        <div className="results">
          {materials.map((m) => (
            <article key={m.id} className={m.status === 'error' ? 'result failed' : 'result'}>
              <p className="result-task">
                {TYPE_LABELS[m.type]} · {formatTime(m.at)} · {formatCost(m.costUsd)}
              </p>
              <strong className="material-title">{m.title}</strong>
              {m.type === 'url' && m.source && (
                <a className="hint link" href={m.source} target="_blank" rel="noreferrer">
                  {m.source}
                </a>
              )}
              {m.status === 'error' ? (
                <p className="msg error">{m.error}</p>
              ) : (
                <details>
                  <summary className="hint">정리된 내용 보기</summary>
                  <div className="result-output">{m.summary}</div>
                </details>
              )}
              <div className="result-actions">
                <button type="button" className="secondary" onClick={() => remove(m)}>
                  삭제
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

// 폰 사진은 크기가 커서, 보내기 전에 긴 변 1568px JPEG로 줄인다. (Claude 권장 크기, 토큰 절약)
async function resizeImage(file, maxSide = 1568, quality = 0.85) {
  const source = await loadImage(file);
  const width = source.width || source.naturalWidth;
  const height = source.height || source.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

async function loadImage(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // 아래 방식으로 다시 시도
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('사진을 열 수 없어요. 다른 형식으로 저장해 보세요.'));
    img.src = URL.createObjectURL(file);
  });
}
