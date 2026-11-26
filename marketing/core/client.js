// 마케팅 모듈 ↔ 공용 코드 연결선 (화면용). 마케팅 화면은 공용 화면 코드를 이 파일로만 가져다 쓴다.
// 서버 전용 코드(lib/claude 등)는 여기에 넣지 않는다 — 폰 화면 코드에 섞이면 안 된다.

export { PasscodeGate, useApi } from '../../components/passcode';
export { formatTime } from '../../components/format';
