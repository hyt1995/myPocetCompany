import Link from 'next/link';
import { notFound } from 'next/navigation';
import DepartmentOverview from '../../../components/DepartmentOverview';
import { PasscodeGate } from '../../../components/passcode';
import { findDepartment } from '../../../lib/departments';

export default async function DepartmentPage({ params }) {
  const { id } = await params;
  const dept = findDepartment(id);
  if (!dept) notFound();

  return (
    <main className="page">
      <Link href="/" className="back">
        ← 조직도
      </Link>
      <header className="top">
        <h1>{dept.name}</h1>
        <p>{dept.role}</p>
      </header>

      <PasscodeGate>
        <DepartmentOverview dept={{ id: dept.id, name: dept.name, trading: dept.trading }} />
      </PasscodeGate>
    </main>
  );
}
