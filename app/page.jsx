import Link from 'next/link';
import OrgChart from '../components/OrgChart';
import { departments } from '../lib/departments';

export default function Home() {
  // 배포 버전 표시: 폰에서 새 버전이 올라왔는지 확인하는 용도.
  const version = (process.env.VERCEL_GIT_COMMIT_SHA || 'local').slice(0, 7);
  const builtAt = new Date().toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const aiCount = departments.reduce((sum, d) => sum + (d.defaultMembers || []).length, 0);

  return (
    <main className="page">
      <header className="top">
        <h1>내 손안의 회사</h1>
        <p>
          부서 {departments.length}개 · AI {aiCount}명
        </p>
      </header>

      <OrgChart departments={departments} />

      <Link href="/board" className="enter">
        회사 게시판 (부서 보고서) →
      </Link>

      <footer className="foot">
        배포 버전 {version} · {builtAt}
      </footer>
    </main>
  );
}
