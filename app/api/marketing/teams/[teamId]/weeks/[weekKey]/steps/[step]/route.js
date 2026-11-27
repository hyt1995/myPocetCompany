// 연결선만 둔다. 마케팅사업부 API 코드는 marketing/api/ 에 있다.
// 웹 검색 + 글쓰기는 1~3분 걸릴 수 있어 시간 한도를 늘린다.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export { stepHandler as POST } from '../../../../../../../../../marketing/api/work';
