// 네이버 검색광고 API 서명: Base64( HMAC-SHA256( 비밀키, "{타임스탬프}.{메서드}.{경로}" ) )

import { createHmac } from 'node:crypto';

export function searchadSignature(timestamp, method, uri, secretKey) {
  return createHmac('sha256', secretKey).update(`${timestamp}.${method}.${uri}`).digest('base64');
}
