import Link from 'next/link';
import { notFound } from 'next/navigation';
import MemberPage from '../../../../components/MemberPage';
import { PasscodeGate } from '../../../../components/passcode';
import { findDepartment } from '../../../../lib/departments';

export default async function MemberRoute({ params }) {
  const { id, memberId } = await params;
  const dept = findDepartment(id);
  if (!dept) notFound();

  return (
    <main className="page">
      <Link href={`/dept/${dept.id}`} className="back">
        ← {dept.name}
      </Link>
      <PasscodeGate>
        <MemberPage dept={{ id: dept.id, name: dept.name, trading: dept.trading }} memberId={memberId} />
      </PasscodeGate>
    </main>
  );
}
