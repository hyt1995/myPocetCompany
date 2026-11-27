// 조직도(첫 화면)에 보이는 마케팅사업부 정보.
// 공용 코드(lib/departments.js)가 마케팅 모듈에서 가져가는 것은 이 파일 하나뿐이다.
//
// ownModule: true → 공용 직원 코드(lib/members.js, /api/departments, /api/members)는 이 부서를 다루지 않는다.
//   마케팅사업부의 화면·API·데이터는 전부 marketing/ 폴더가 맡는다.

import { TEAM } from './team';

export const marketingDepartment = {
  id: 'marketing',
  name: '마케팅사업부',
  statusLabel: '운영 중',
  role: '돈이 되는 시장(국내·해외)을 찾아 실제 사업으로 만들고 운영합니다. 팀: 신사업팀(운영 중) · 운영팀(준비 중)',
  duties: [
    '신사업팀: 월요일 경제 브리핑, 주간 시장 탐색 → 팀장 지시 → 심층 조사 → 회의 → 주간 보고서',
    '신사업팀 보고서는 회사 게시판에 올라가 회사 전체가 참고',
    '운영팀(준비 중): 승인된 사업의 SNS·판매 채널 운영',
    '감사: 사장님 (관문마다 승인·반려)',
  ],
  trading: false,
  ownModule: true,
  // 조직도 표시용 (이름·역할만). 지침은 marketing/team.js 에 있다.
  defaultMembers: TEAM.map(({ id, name, role }) => ({ id, name, role })),
  newMemberPrompt: '',
};
