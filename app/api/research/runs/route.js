// 연결선만 둔다. 시장조사 프로그램 API 코드는 research/api/ 에 있다.
export const dynamic = 'force-dynamic';
export { listHandler as GET, createHandler as POST } from '../../../../research/api/runs';
