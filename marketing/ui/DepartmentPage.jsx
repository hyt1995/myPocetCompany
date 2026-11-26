// /dept/marketing 화면 (공용 부서 화면 app/dept/[id] 대신 이 화면이 열린다)

import Link from 'next/link';
import { PasscodeGate } from '../core/client';
import { marketingDepartment } from '../department';
import MarketingDepartment from './MarketingDepartment';

export default function MarketingDepartmentPage() {
  return (
    <main className="page">
      <Link href="/" className="back">
        ← 조직도
      </Link>
      <header className="top">
        <h1>{marketingDepartment.name}</h1>
        <p>{marketingDepartment.role}</p>
      </header>

      <PasscodeGate>
        <MarketingDepartment />
      </PasscodeGate>
    </main>
  );
}
