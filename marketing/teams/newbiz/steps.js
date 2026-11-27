// 신사업팀 주간 업무 단계. 화면과 서버가 같이 쓴다. (DB·외부 의존 없음)
//
// 순서: ① 월요일 경제 브리핑  ② 이번 주 시장 탐색  ③ 팀장 지시 (+ 사장님 지시)
//       ④ 심층 조사  ⑤ 회의 (최대 3라운드)  ⑥ 주간 보고서 (아이템이 없어도 매주)
// phases: collect = 웹 검색으로 자료 모으기 (Haiku), write = 직원이 글쓰기, turn = 회의 발언 1번

export const MAX_ROUNDS = 3;

export const STEPS = [
  {
    id: 'briefing',
    label: '월요일 경제 브리핑',
    who: 'mkt-analyst',
    phases: ['collect', 'write'],
    needs: [],
    prefix: 'B',
    desc: '지난주 경제·한국/미국 증시·비트코인·환율·정치 이슈·핫 검색어, 어떤 이슈로 무엇이 오르고 내렸는지. 회사 게시판에 올라가요. (매주 월요일 아침 7시 자동)',
  },
  {
    id: 'explore',
    label: '이번 주 시장 탐색',
    who: 'mkt-analyst',
    phases: ['collect', 'write'],
    needs: [],
    prefix: 'E',
    desc: '사람이 몰리고 돈이 오가는 곳(크몽·숨고·쓰레드, 일본·동남아·중국·미국 쇼핑몰)에서 이번 주 신호를 찾아요.',
  },
  {
    id: 'directive',
    label: '팀장 지시',
    who: 'mkt-lead',
    phases: ['write'],
    needs: ['explore'],
    desc: '팀장이 더 파 볼 신호를 고르고 질문을 정해요. 없으면 "이번 주는 넘어감". 사장님 지시도 같이 넣을 수 있어요.',
  },
  {
    id: 'deep',
    label: '심층 조사',
    who: 'mkt-analyst',
    phases: ['collect', 'write'],
    needs: ['directive'],
    prefix: 'D',
    desc: '팀장이 고른 신호의 가격·판매량·경쟁·수수료·규제를 더 모으고, 돈 흐름 표와 월 100만 원 계산을 해요.',
  },
  {
    id: 'meeting',
    label: '회의',
    who: 'team',
    phases: ['turn'],
    needs: ['explore'],
    desc: '기획자 제안 → 분석가 검증 → 팀장 판정. 반려면 다시 (최대 3라운드).',
  },
  {
    id: 'report',
    label: '주간 보고서',
    who: 'mkt-lead',
    phases: ['write'],
    needs: ['explore'],
    desc: '시장 흐름, 찾은 것/못 찾은 이유, 회의 결론, 사장님이 결정할 것. 회사 게시판에 올라가요.',
  },
];

export const VERDICTS = ['통과', '조건부', '반려', '아이템 없음'];
export const DIRECTIVE_DECISIONS = ['심층조사', '넘어감'];
export const OWNER_DECISIONS = { approve: '승인 (실험 시작)', hold: '보류', reject: '반려' };

export function findStep(id) {
  return STEPS.find((s) => s.id === id) || null;
}

// 단계를 지금 할 수 있는지. 안 되면 이유(문장), 되면 null.
export function blockedReason(stepId, week) {
  const step = findStep(stepId);
  if (!step) return '모르는 단계예요.';
  const steps = week?.steps || {};
  for (const need of step.needs) {
    if (steps[need]?.status !== 'done') return `먼저 '${findStep(need).label}'을(를) 끝내 주세요.`;
  }
  if (stepId === 'deep' && steps.directive?.decision === '넘어감') {
    return '팀장이 이번 주는 심층 조사 없이 넘어가기로 했어요. (팀장 지시를 다시 하면 바뀔 수 있어요)';
  }
  return null;
}

// 회의 다음 발언자. 끝났으면 null.
// 라운드: 기획자(planner) → 분석가(analyst) → 팀장(lead). 팀장이 '반려'하고 3라운드 전이면 다음 라운드.
export function nextSpeaker(meeting) {
  const turns = meeting?.turns || [];
  if (meeting?.status === 'done') return null;
  const last = turns[turns.length - 1];
  if (!last) return { round: 1, who: 'planner' };
  if (last.who === 'planner') return { round: last.round, who: 'analyst' };
  if (last.who === 'analyst') return { round: last.round, who: 'lead' };
  if (last.verdict === '반려' && last.round < MAX_ROUNDS) return { round: last.round + 1, who: 'planner' };
  return null;
}
