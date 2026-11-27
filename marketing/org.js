// 마케팅사업부 안의 팀 목록. 팀은 계속 늘어난다 (신사업팀 → 운영팀 → …).
//
// 새 팀을 만들 때:
//   1) 여기에 팀을 추가한다 (status: 'ready' 는 준비 중, 'active' 는 운영 중)
//   2) marketing/team.js 의 TEAM 에 그 팀 직원(teamId)을 추가한다
//   3) 팀 업무 코드는 marketing/teams/<팀 id>/ 폴더에 둔다 (신사업팀 = marketing/teams/newbiz/)
//   4) marketing/ui/TeamPage.jsx 의 TEAM_WORK 에 팀 업무 화면을 연결한다

export const TEAMS = [
  {
    id: 'newbiz',
    name: '신사업팀',
    status: 'active',
    role: '사람이 모이고 돈이 오가는 시장(국내·해외)을 찾아 사업 아이템으로 만든다. 보고서는 회사 전체가 참고한다.',
    duties: [
      '월요일: 지난주 경제·증시·비트코인·정치 이슈·핫 검색어 브리핑',
      '매주: 시장 탐색 → 팀장 지시 → 심층 조사 → 회의 → 주간 보고서',
      '아이템이 없는 주에도 "왜 없었는지" 보고서를 쓴다',
      '해외 판매(일본·동남아·중국·미국) 기회도 같이 본다',
    ],
  },
  {
    id: 'ops',
    name: '운영팀',
    status: 'ready',
    role: '신사업팀이 찾고 사장님이 승인한 사업을 실제로 운영한다 (SNS·판매 채널·고객 응대).',
    duties: ['준비 중: 신사업팀의 첫 사업이 승인되면 만든다'],
  },
];

export const TEAM_STATUS_LABELS = { active: '운영 중', ready: '준비 중' };

export function findTeam(teamId) {
  return TEAMS.find((t) => t.id === teamId) || null;
}
