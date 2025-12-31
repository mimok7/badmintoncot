'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QrCode, CheckCircle, Loader2 } from 'lucide-react';

function ScanContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');

    useEffect(() => {
        const session = searchParams.get('session');
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';

        if (!session) {
            setStatus('error');
            return;
        }

        // 고정 세션 ID와 비교하여 검증
        if (session === fixedSessionId) {
            // 유효한 QR 코드 - localStorage에 표시하고 메인 페이지로 이동
            localStorage.setItem('qr_verified', 'true');
            setStatus('success');

            // 2초 후 메인 페이지로 리다이렉트
            setTimeout(() => {
                localStorage.removeItem('qr_verified');
                router.push('/');
            }, 2000);
        } else {
            setStatus('error');
        }
    }, [searchParams, router]);

    if (status === 'validating') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-indigo-200/30 w-full max-w-md border border-white/60 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <Loader2 className="text-indigo-600 w-10 h-10 animate-spin" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                        QR 코드 확인 중
                    </h1>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        잠시만 기다려주세요...
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-rose-200/30 w-full max-w-md border border-white/60 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-rose-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <QrCode className="text-rose-600 w-10 h-10" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-rose-900 to-rose-700 bg-clip-text text-transparent tracking-tight">
                        유효하지 않은 QR 코드
                    </h1>
                    <p className="text-slate-500 mb-8 font-medium leading-relaxed">
                        올바른 QR 코드를 스캔해주세요.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full bg-gradient-to-r from-slate-600 to-slate-700 text-white py-4 rounded-[1.5rem] font-bold hover:from-slate-700 hover:to-slate-800 transition-all shadow-lg"
                    >
                        홈으로 돌아가기
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-50 via-white to-slate-50/50 p-6">
            <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-green-200/30 w-full max-w-md border border-white/60 text-center">
                <div className="w-20 h-20 bg-gradient-to-br from-green-100 to-green-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto animate-bounce">
                    <CheckCircle className="text-green-600 w-10 h-10" strokeWidth={2.5} />
                </div>
                <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-green-900 to-green-700 bg-clip-text text-transparent tracking-tight">
                    QR 인증 완료!
                </h1>
                <p className="text-slate-500 mb-2 font-medium leading-relaxed">
                    잠시 후 로그인 페이지로 이동합니다.
                </p>
            </div>
        </div>
    );
}

export default function ScanPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50/50">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            </div>
        }>
            <ScanContent />
        </Suspense>
    );
}
