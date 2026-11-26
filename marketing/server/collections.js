// 마케팅사업부 전용 Firestore 컬렉션. 전부 'mpc_mkt_' 로 시작한다.
// 다른 부서 데이터(mpc_members 등)와 섞이지 않는다.

export const MKT_COL = {
  members: 'mpc_mkt_members', // 마케팅 직원 (이름, 직함, 역할, 모델 등급, 지침)
  settings: 'mpc_mkt_settings', // 문서 'department': 부서 공통 지침(회의 규칙)
};

export const SETTINGS_DOC = 'department';
