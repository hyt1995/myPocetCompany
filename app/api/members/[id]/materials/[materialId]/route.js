import { guarded, requireMember } from '../../../../../../lib/http';
import { deleteMaterial } from '../../../../../../lib/materials';

export const dynamic = 'force-dynamic';

// 학습 자료 삭제
export const DELETE = guarded(async (request, { id, materialId }) => {
  await requireMember(id);
  await deleteMaterial(id, materialId);
  return Response.json({ ok: true });
});
