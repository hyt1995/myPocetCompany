// 조직도에 표시되는 부서 목록.
// 새 부서를 추가할 때는 이 배열에 항목을 하나 더 넣으면 된다.

export const departments = [
  {
    id: 'secretary',
    name: '비서',
    statusLabel: '개발 중',
    role: '사장님의 일정과 회사의 돈 흐름을 챙기고 보고합니다. 재무팀이 생기기 전까지 비용 관리도 맡습니다.',
    duties: [
      '내 일정 관리 (구글 캘린더)',
      'API 크레딧 현황과 남은 크레딧 보고',
      '지금까지 쓴 토큰 비용 계산',
      '현재 매출·비용·순수익 보고',
    ],
    members: [],
  },
  {
    id: 'marketing',
    name: '마케팅사업부',
    statusLabel: '준비 중',
    role: 'SNS를 운영하고, 재택으로 돈을 벌 수 있는 새 수익모델을 찾아 개발합니다.',
    duties: [
      '인스타그램·쓰레드 자동 운영과 기획',
      '재택업무 수익모델 탐색과 개발',
    ],
    members: [],
  },
  {
    id: 'investment',
    name: '투자운영사업부',
    statusLabel: '준비 중',
    role: '주식·비트코인으로 수익을 내고 현황을 보고합니다.',
    duties: ['주식·비트코인 운용', '수익 현황 보고'],
    members: [],
  },
];
