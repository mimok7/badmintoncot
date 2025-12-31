'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { QrCode, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

function ScanContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'validating' | 'success' | 'error'>('validating');
    const [message, setMessage] = useState('QR 코드를 확인하는 중...');

    useEffect(() => {
        handleQRScan();
    }, [searchParams, router]);

    const handleQRScan = async () => {
        const session = searchParams.get('session');
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';

        console.log('스캔된 세션:', session);
        console.log('예상 세션:', fixedSessionId);

        if (!session) {
            console.error('세션 파라미터가 없습니다');
            setStatus('error');
            return;
        }

        // 고정 세션 ID와 비교하여 검증
        if (session !== fixedSessionId) {
            console.error('세션 ID 불일치:', { session, fixedSessionId });
            setStatus('error');
            return;
        }

        console.log('QR 검증 성공, 계정 생성 시작');

        try {
            // 1. 기존 회원 확인
            const savedMemberId = localStorage.getItem('badminton_member_id');
            let memberId = savedMemberId;

            if (!savedMemberId) {
                setMessage('게스트 계정을 생성하는 중...');
                
                // 2. 임의의 닉네임 생성 (Guest_랜덤번호)
                const randomNum = Math.floor(Math.random() * 100000);
                const guestNickname = `Guest_${randomNum}`;

                // 3. 회원 자동 생성
                const { data: memberData, error: memberError } = await supabase
                    .from('members')
                    .insert({ nickname: guestNickname })
                    .select('*')
                    .single();

                if (memberError) {
                    console.error('회원 생성 오류:', memberError);
                    setMessage(`회원 생성 실패: ${memberError.message}`);
                    setStatus('error');
                    return;
                }

                console.log('생성된 회원:', memberData);
                memberId = memberData.id;
                localStorage.setItem('badminton_member_id', memberId);
            }

            // 4. 입장 처리 (entry_sessions)
            setMessage('입장 처리 중...');
            console.log('입장 처리 시도, user_id:', memberId);
            
            // UUID 직접 생성 (DB에 기본값이 없으므로)
            const entryId = crypto.randomUUID();
            
            const { data: entryData, error: entryError } = await supabase
                .from('entry_sessions')
                .insert({ 
                    id: entryId,
                    user_id: memberId 
                })
                .select('*')
                .single();

            if (entryError) {
                console.error('입장 처리 오류:', entryError);
                console.error('오류 상세:', JSON.stringify(entryError, null, 2));
                setMessage(`입장 처리 실패: ${entryError.message}`);
                setStatus('error');
                return;
            }

            console.log('입장 처리 성공:', entryData);

            // 5. 성공 - 메인 페이지로 이동
            setStatus('success');
            setTimeout(() => {
                router.push('/');
            }, 2000);

        } catch (error) {
            console.error('QR 스캔 처리 오류:', error);
            setStatus('error');
        }
    };

    if (status === 'validating') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-indigo-200/30 w-full max-w-md border border-white/60 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <Loader2 className="text-indigo-600 w-10 h-10 animate-spin" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                        처리 중
                    </h1>
                    <p className="text-slate-500 font-medium leading-relaxed">
                        {message}
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
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left">
                        <p className="text-xs font-bold text-slate-700 mb-2">디버그 정보:</p>
                        <p className="text-xs text-slate-600 font-mono break-all">
                            스캔된 세션: {searchParams.get('session') || '없음'}
                        </p>
                        <p className="text-xs text-slate-600 font-mono break-all mt-1">
                            예상 세션: {process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024'}
                        </p>
                    </div>
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
                    입장 완료!
                </h1>
                <p className="text-slate-500 mb-2 font-medium leading-relaxed">
                    코트 예약 화면으로 이동합니다.
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
