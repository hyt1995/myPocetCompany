// 연결선만 둔다. 마케팅사업부 API 코드는 marketing/api/ 에 있다.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export { listHandler as GET, createHandler as POST } from '../../../../marketing/api/research';
