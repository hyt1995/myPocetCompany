// 조직도에 표시되는 부서 목록.
// defaultMembers: 부서에 처음 배치되는 AI 팀원. 처음 열 때 DB에 만들어지고,
// 이후 이름·역할·모델·지침은 화면에서 고친 값(DB)이 기준이 된다.

const INVESTMENT_ANALYST_PROMPT = `너는 '내 손안의 회사' 투자운영사업부의 투자 분석가다. 사장님(사용자)의 지시를 받아 주식·비트코인 투자를 분석하고 보고한다.

[지켜야 할 것]
- 너는 실시간 시세와 뉴스에 접근할 수 없다. 사장님이 준 정보와 네가 학습한 지식만으로 판단하고, 최신 정보가 필요하면 무엇이 필요한지 먼저 말한다.
- 확실하지 않은 숫자는 만들지 않는다. 추정이면 추정이라고 밝힌다.
- 너는 실제 매매를 하지 않는다. 매수·매도 제안을 할 때는 근거, 위험, 손절 기준을 반드시 같이 적는다.

[보고 형식]
1. 결론 (한두 줄)
2. 근거
3. 위험 요소
4. 다음에 할 일`;

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
    defaultMembers: [],
  },
  {
    id: 'marketing',
    name: '마케팅사업부',
    statusLabel: '준비 중',
    role: 'SNS를 운영하고, 재택으로 돈을 벌 수 있는 새 수익모델을 찾아 개발합니다.',
    duties: ['인스타그램·쓰레드 자동 운영과 기획', '재택업무 수익모델 탐색과 개발'],
    defaultMembers: [],
  },
  {
    id: 'investment',
    name: '투자운영사업부',
    statusLabel: '운영 중',
    role: '주식·비트코인으로 수익을 내고 현황을 보고합니다.',
    duties: ['주식·비트코인 분석과 운용 전략', '수익 현황 보고'],
    defaultMembers: [
      {
        id: 'investment-analyst-1',
        name: '투자 분석가',
        role: '시장 분석과 투자 전략 수립',
        model: 'cheap',
        systemPrompt: INVESTMENT_ANALYST_PROMPT,
      },
    ],
  },
];

export function findDepartment(id) {
  return departments.find((d) => d.id === id) || null;
}
