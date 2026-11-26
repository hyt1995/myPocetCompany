// 조직도(첫 화면)에 보이는 마케팅사업부 정보.
// 공용 코드(lib/departments.js)가 마케팅 모듈에서 가져가는 것은 이 파일 하나뿐이다.
//
// ownModule: true → 공용 직원 코드(lib/members.js, /api/departments, /api/members)는 이 부서를 다루지 않는다.
//   마케팅사업부의 화면·API·데이터는 전부 marketing/ 폴더가 맡는다.

import { TEAM } from './team';

export const marketingDepartment = {
  id: 'marketing',
  name: '마케팅사업부',
  statusLabel: '준비 중',
  role: '시장을 조사해 돈이 되는 사업을 찾고, 검토를 거쳐 실제 사업으로 발전시킵니다.',
  duties: [
    '시장조사: 데이터로 수요·경쟁·추세 확인',
    '사업 기획: 남들이 못 보는 수익 기회 발굴',
    '사업 심사와 실행 계획 (감사: 사장님)',
    '인스타그램·쓰레드 운영, 일감 수주',
  ],
  trading: false,
  ownModule: true,
  // 조직도 표시용 (이름·역할만). 지침은 marketing/team.js 에 있다.
  defaultMembers: TEAM.map(({ id, name, role }) => ({ id, name, role })),
  newMemberPrompt: '',
};
