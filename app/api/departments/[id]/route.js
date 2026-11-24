import { findDepartment } from '../../../../lib/departments';
import { guarded, httpError, readJson } from '../../../../lib/http';
import { getDepartmentSettings, listMembers, updateDepartmentSettings } from '../../../../lib/members';
import { getDepartmentStats, getWorkerStatus } from '../../../../lib/trading';

export const dynamic = 'force-dynamic';

function requireDept(id) {
  const dept = findDepartment(id);
  if (!dept) throw httpError(404, '없는 부서예요.');
  return dept;
}

// 부서 화면: 공통 지침 + 직원 목록 + (매매 부서면) 모의 수익률과 매매 프로그램 연결 상태
export const GET = guarded(async (request, { id }) => {
  const dept = requireDept(id);
  const [settings, members] = await Promise.all([getDepartmentSettings(id), listMembers(id)]);

  let stats = {};
  let worker = null;
  if (dept.trading) {
    [stats, worker] = await Promise.all([getDepartmentStats(members), getWorkerStatus()]);
  }
  return Response.json({ settings, members, stats, worker, trading: dept.trading });
});

// 부서 공통 지침 저장
export const PUT = guarded(async (request, { id }) => {
  requireDept(id);
  const body = await readJson(request);
  const settings = await updateDepartmentSettings(id, { commonGuideline: body.commonGuideline });
  return Response.json({ settings });
});
