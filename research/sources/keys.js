// API 키는 Vercel 환경변수에서만 읽는다. 값은 절대 화면·DB·로그로 내보내지 않는다 (있는지 없는지만).

export const KEY_SPECS = [
  { name: 'NAVER_SEARCHAD_CUSTOMER_ID', group: 'searchad', label: '검색광고 CUSTOMER_ID' },
  { name: 'NAVER_SEARCHAD_ACCESS_LICENSE', group: 'searchad', label: '검색광고 액세스라이선스' },
  { name: 'NAVER_SEARCHAD_SECRET_KEY', group: 'searchad', label: '검색광고 비밀키' },
  { name: 'NAVER_CLIENT_ID', group: 'hub', label: 'NAVER API HUB Client ID' },
  { name: 'NAVER_CLIENT_SECRET', group: 'hub', label: 'NAVER API HUB Client Secret' },
];

const env = (name) => (process.env[name] || '').trim();

export function readKeys() {
  return {
    searchad: {
      customerId: env('NAVER_SEARCHAD_CUSTOMER_ID'),
      accessLicense: env('NAVER_SEARCHAD_ACCESS_LICENSE'),
      secretKey: env('NAVER_SEARCHAD_SECRET_KEY'),
    },
    hub: {
      clientId: env('NAVER_CLIENT_ID'),
      clientSecret: env('NAVER_CLIENT_SECRET'),
      // 예전 네이버 개발자센터에서 받은 키면 NAVER_API_LEGACY=true (새 키는 NAVER API HUB 에서만 발급)
      legacy: env('NAVER_API_LEGACY') === 'true',
    },
  };
}

export function keyStatus() {
  const keys = KEY_SPECS.map((k) => ({ name: k.name, label: k.label, group: k.group, set: Boolean(env(k.name)) }));
  const ready = (group) => keys.filter((k) => k.group === group).every((k) => k.set);
  return {
    keys,
    ready: { searchad: ready('searchad'), hub: ready('hub') },
    legacy: env('NAVER_API_LEGACY') === 'true',
  };
}
