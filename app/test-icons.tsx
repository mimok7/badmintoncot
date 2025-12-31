'use client';

import { QrCode, User, Clock } from 'lucide-react';

export default function TestIcons() {
  return (
    <div style={{ padding: '20px', background: 'white' }}>
      <h1>Icon Test</h1>
      <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
        <QrCode size={48} color="blue" />
        <User size={48} color="green" />
        <Clock size={48} color="red" />
      </div>
      <p>If you see three icons above (QR, User, Clock), lucide-react is working!</p>
    </div>
  );
}
