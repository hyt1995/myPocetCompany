import './globals.css';

export const metadata = {
  title: '내 손안의 회사',
  description: '핸드폰 안에서 키우는 내 회사',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
