// 시장조사 프로그램이 할 수 있는 일과 못 하는 일. (투자부 capabilities.js 와 같은 원칙)
// AI 직원은 이 설명을 받고, 프로그램이 주지 않은 숫자는 '확인 못 함'으로 써야 한다.
// 프로그램 동작을 바꾸면 이 파일의 숫자·설명·못 하는 일 목록을 같이 고친다.

export const MAX_KEYWORDS = 200; // 조사 1번에 넣을 수 있는 키워드 수
export const MAX_KEYWORD_LENGTH = 30; // 키워드 1개 글자 수
export const BATCH_SIZE = 10; // 한 번에 처리하는 키워드 수 (서버 시간 제한 때문에 나눠서 처리)
export const MIN_DEMAND = 100; // 월 검색수가 이보다 적으면 기회 점수 0 ('수요 적음')
export const GROWTH_CLAMP = [0.25, 4]; // 성장률이 점수에 주는 영향의 최소·최대
export const TREND_MONTHS = 15; // 데이터랩에서 가져오는 개월 수 (최근 3개월과 1년 전 같은 3개월 비교)

// 줄 세우기 기준 — 조사마다 고를 수 있다. AI 직원(보고서)에게는 이 기준으로 상위 top 개만 넘긴다.
// order: desc = 큰 값이 위, asc = 작은 값이 위. 값이 없는 키워드(확인 못 함)는 항상 아래.
export const SORT_KEYS = {
  score: { label: '기회 점수', field: 'score', order: 'desc', means: '수요는 많고, 이미 있는 글은 적고, 성장 중인 키워드' },
  monthly: { label: '월 검색수', field: 'monthly', order: 'desc', means: '수요가 가장 큰 키워드 (시장 크기)' },
  yoy: { label: '1년 성장률', field: 'yoy', order: 'desc', means: '계절성을 뺀 구조적 성장' },
  momentum: { label: '3개월 성장률', field: 'momentum', order: 'desc', means: '최근 갑자기 뜨는 흐름 (이슈성일 수 있음)' },
  competition: { label: '경쟁 적은 순', field: 'competition', order: 'asc', means: '검색 1번당 블로그 글이 적은 빈 시장' },
  adClicks: { label: '광고 클릭수', field: 'adClicks', order: 'desc', means: '광고를 누르는 사람이 많은 키워드 (돈 낼 의사)' },
};

// 거르기: 이 조건을 못 넘은 키워드는 표 아래로 내리고, AI 직원에게 넘기지 않는다. 비워 두면 안 거른다.
export const RANKING_FILTERS = {
  minMonthly: { label: '월 검색수 최소', field: 'monthly', op: 'min', min: 0, max: 10_000_000 },
  maxCompetition: { label: '경쟁비 최대', field: 'competition', op: 'max', min: 0, max: 1_000_000 },
  minYoy: { label: '1년 성장률 최소 (배)', field: 'yoy', op: 'min', min: 0, max: 100 },
};

export const RANK_TOP = { min: 10, max: 60, default: 40 }; // AI 직원에게 넘기는 줄 수
export const DEFAULT_RANKING = { sortBy: 'score', top: RANK_TOP.default };

// 키워드에 쓸 수 있는 글자: 한글, 영문, 숫자, 띄어쓰기.
export const KEYWORD_PATTERN = /^[0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ ]+$/;

export const SOURCES = [
  {
    id: 'searchad',
    label: '네이버 검색광고 키워드도구',
    gives: '최근 30일 검색수(PC·모바일), 광고 경쟁 정도(낮음·중간·높음), 월평균 광고 클릭수, 평균 노출 광고 수',
  },
  {
    id: 'datalab',
    label: '네이버 데이터랩 검색어 트렌드',
    gives: `최근 ${TREND_MONTHS}개월 월별 검색 추세 (상대값 0~100, 절대 검색수가 아님)`,
  },
  { id: 'blog', label: '네이버 블로그 검색', gives: '그 키워드로 검색되는 블로그 글 수 (공급·경쟁의 대리 지표)' },
];

// AI 직원에게 그대로 주는 설명
export const RESEARCH_CAPABILITIES = `[시장조사 프로그램이 주는 숫자]
${SOURCES.map((s) => `- ${s.label}: ${s.gives}`).join('\n')}

[프로그램이 계산하는 것]
- 월 검색수 = PC + 모바일 최근 30일 검색수. "< 10" 은 정확한 값이 없어서 5로 계산한다.
- 1년 성장률 = 최근 3개월 ÷ 1년 전 같은 3개월 (계절성을 걷어 낸 성장)
- 3개월 성장률 = 최근 3개월 ÷ 그 전 3개월 (단기 흐름)
- 경쟁비 = 블로그 글 수 ÷ 월 검색수 (검색 1번당 이미 있는 글 수, 낮을수록 빈 시장)
- 기회 점수 = 월 검색수 ÷ (블로그 글 수 + 1) × 성장률(1년 성장률, 없으면 3개월 성장률, ${GROWTH_CLAMP[0]}~${GROWTH_CLAMP[1]}로 제한) × 100
- 월 검색수 ${MIN_DEMAND} 미만은 기회 점수 0 ('수요 적음')
- 표시: '최근 급등'(지난달이 그 전 5개월 평균의 2배 이상 → 이슈성인지 확인 필요), '감소 중'(1년 성장률 0.8 미만)

[줄 세우기 기준 — 조사마다 고를 수 있다]
- sortBy (하나만): ${Object.entries(SORT_KEYS)
  .map(([k, v]) => `${k}=${v.label}(${v.order === 'asc' ? '낮은 순' : '높은 순'}: ${v.means})`)
  .join(', ')}
- 거르기 (선택): ${Object.entries(RANKING_FILTERS)
  .map(([k, v]) => `${k}=${v.label}`)
  .join(', ')}. 조건을 못 넘은 키워드는 보고서 표에서 빠진다.
- top = 보고서 표에 넣을 줄 수 (${RANK_TOP.min}~${RANK_TOP.max}, 기본 ${RANK_TOP.default})
- 이 밖의 기준(예: 판매량 순, 가격 순)은 없다. 숫자를 조합한 새 점수도 만들 수 없다.

[못 하는 일 — 이런 숫자는 없다]
- 숨고·크몽·쓰레드·인스타그램·쿠팡 등 다른 사이트 데이터, 실제 판매량·매출·가격
- 구글 등 네이버 외 검색량, 지역별·성별·연령별 검색량
- 연관 키워드 자동 확장 (넣은 키워드만 잰다)
- 한 번에 ${MAX_KEYWORDS}개 넘는 키워드`;
