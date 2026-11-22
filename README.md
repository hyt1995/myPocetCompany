# 내 손안의 회사

핸드폰 안에서 키우는 내 회사. 현재 단계: 빈 조직도 + '내 비서' 부서 1개.

## 배포

GitHub `main` 브랜치에 올라가면 Vercel이 자동으로 배포한다.
화면 맨 아래 "배포 버전"이 최신 커밋 앞 7자리와 같으면 새 버전이 반영된 것이다.

## 구조

- `lib/departments.js` — 조직도에 나오는 부서 목록 (부서 추가는 여기서)
- `components/OrgChart.jsx` — 부서 사각형 카드, 누르면 펼쳐짐
- `app/page.jsx` — 첫 화면
- `app/globals.css` — 화면 스타일

## 로컬 실행 (선택)

```
npm install
npm run dev
```
