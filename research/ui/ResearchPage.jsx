// /research 화면: 시장조사 프로그램 (키 상태·연결 테스트·직접 조사·조사 기록)

import Link from 'next/link';
import { PasscodeGate } from '../core/client';
import ResearchConsole from './ResearchConsole';

export default function ResearchPage() {
  return (
    <main className="page">
      <Link href="/" className="back">
        ← 조직도
      </Link>
      <header className="top">
        <h1>시장조사 프로그램</h1>
        <p>네이버 검색수·추세·블로그 글 수를 재서 기회 점수를 계산합니다. AI 없이 숫자만 잽니다.</p>
      </header>
      <PasscodeGate>
        <ResearchConsole />
      </PasscodeGate>
    </main>
  );
}
