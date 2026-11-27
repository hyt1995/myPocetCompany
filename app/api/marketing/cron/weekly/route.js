// 연결선만 둔다. 마케팅사업부 API 코드는 marketing/api/ 에 있다. (vercel.json 의 crons 가 부른다)
export const dynamic = 'force-dynamic';
export const maxDuration = 300;
export { cronHandler as GET } from '../../../../../marketing/api/cron';
