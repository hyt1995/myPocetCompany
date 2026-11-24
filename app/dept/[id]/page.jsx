import Link from 'next/link';
import { notFound } from 'next/navigation';
import DepartmentRoom from '../../../components/DepartmentRoom';
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

      {dept.defaultMembers.length > 0 ? (
        <DepartmentRoom departmentId={dept.id} />
      ) : (
        <p className="empty">아직 배치된 팀원이 없어요.</p>
      )}
    </main>
  );
}
