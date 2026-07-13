import { redirect } from 'next/navigation';

// QR은 최초 사이트 접속용일 뿐, QR 세션으로 입장하지 않습니다.
// 기존에 배포된 QR 링크도 위치 기반 메인 화면으로 보냅니다.
export default function ScanPage() {
  redirect('/');
}
