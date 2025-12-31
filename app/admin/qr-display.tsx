'use client';

import { useEffect, useRef } from 'react';
import QRCode from 'qrcode.react';
import { Download, Copy, Check } from 'lucide-react';
import { useState } from 'react';

export function QRDisplay() {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const qrSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';
  
  // 입구 디스플레이에 표시할 QR 코드 URL
  const qrUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/scan?session=${qrSessionId}`;

  const downloadQR = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'entrance-qr-code.png';
      link.href = url;
      link.click();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(qrUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-2xl font-bold mb-4 text-slate-900">🎫 고정 QR 코드</h3>
        <p className="text-slate-600 mb-6">입구 디스플레이에 표시할 QR 코드입니다. 이 코드를 스캔하면 회원가입 페이지로 이동합니다.</p>
      </div>

      <div className="bg-white border-2 border-dashed border-indigo-300 rounded-2xl p-8 flex flex-col items-center gap-6">
        <div 
          ref={qrRef}
          className="bg-white p-4 rounded-xl shadow-lg"
        >
          <QRCode 
            value={qrUrl} 
            size={300}
            level="H"
            includeMargin={true}
            fgColor="#1e293b"
            bgColor="#ffffff"
          />
        </div>

        <div className="flex gap-3 flex-wrap justify-center">
          <button
            onClick={downloadQR}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            다운로드
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2 bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4" />
                복사됨!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                URL 복사
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-4">
        <div>
          <label className="text-sm font-bold text-slate-700 block mb-2">QR 세션 ID</label>
          <input 
            type="text" 
            value={qrSessionId}
            readOnly
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-sm"
          />
        </div>
        
        <div>
          <label className="text-sm font-bold text-slate-700 block mb-2">QR 스캔 URL</label>
          <input 
            type="text" 
            value={qrUrl}
            readOnly
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-sm break-all"
          />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-900">
            <span className="font-bold">ℹ️ 정보:</span> 이 QR 코드는 고정된 세션 ID를 사용합니다. 모든 사용자가 같은 QR 코드로 입장합니다.
          </p>
        </div>
      </div>
    </div>
  );
}
