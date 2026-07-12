'use client';

import { useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

interface QrScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError: (error: string) => void;
  onClose: () => void;
}

export default function QrScanner({ onScanSuccess, onScanError, onClose }: QrScannerProps) {
  const qrRef = useRef<Html5Qrcode | null>(null);
  const regionId = 'reader';

  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        const html5QrCode = new Html5Qrcode(regionId);
        qrRef.current = html5QrCode;

        const config = { fps: 10, qrbox: { width: 220, height: 220 } };

        // Start scanning
        await html5QrCode.start(
          { facingMode: 'environment' },
          config,
          (decodedText) => {
            if (isMounted) {
              onScanSuccess(decodedText);
            }
          },
          () => {
            // Constant parsing noise is ignored by default
          }
        );
      } catch (err: any) {
        if (isMounted) {
          onScanError(err?.message || '카메라를 시작할 수 없습니다. 권한을 확인해주세요.');
        }
      }
    };

    // Delay initialization slightly to guarantee DOM element '#reader' is fully rendered
    const timer = setTimeout(() => {
      startCamera();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
      if (qrRef.current && qrRef.current.isScanning) {
        qrRef.current
          .stop()
          .then(() => {
            qrRef.current?.clear();
          })
          .catch((err) => {
            console.error('Failed to clear scanner on unmount', err);
          });
      }
    };
  }, [onScanSuccess, onScanError]);

  return (
    <div className="w-full">
      <div id={regionId} className="w-full overflow-hidden rounded-2xl border-2 border-indigo-500 bg-black aspect-square"></div>
      <button
        type="button"
        onClick={onClose}
        className="w-full mt-3 bg-slate-600 hover:bg-slate-700 text-white py-3 rounded-2xl text-sm font-bold transition-all shadow-md active:scale-[0.98]"
      >
        카메라 스캔 취소
      </button>
    </div>
  );
}
