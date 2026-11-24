import { guarded, readJson, requireMember } from '../../../../../lib/http';
import { addMaterial, listMaterials } from '../../../../../lib/materials';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// 학습 자료 목록
export const GET = guarded(async (request, { id }) => {
  await requireMember(id);
  const materials = await listMaterials(id);
  return Response.json({ materials });
});

// 학습 자료 추가: { type: 'text' | 'url' | 'image', ... }
export const POST = guarded(async (request, { id }) => {
  const member = await requireMember(id);
  const body = await readJson(request);
  const material = await addMaterial(member, body);
  return Response.json({ material });
});
