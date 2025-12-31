'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, User } from 'lucide-react';
import { BadmintonIcon } from '../components/BadmintonIcon';
import { supabase } from '@/lib/supabase';

function ScanContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'validating' | 'nickname-input' | 'processing' | 'success' | 'error'>('validating');
    const [message, setMessage] = useState('QR 코드를 확인하는 중...');
    const [nickname, setNickname] = useState('');

    useEffect(() => {
        handleQRScan();
    }, [searchParams, router]);

    const handleQRScan = async () => {
        const session = searchParams.get('session');
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';

        if (!session) {
            setStatus('error');
            return;
        }

        // 고정 세션 ID와 비교하여 검증
        if (session !== fixedSessionId) {
            setStatus('error');
            return;
        }

        // 기존 회원 확인 (localStorage + DB 검증)
        const savedMemberId = localStorage.getItem('badminton_member_id');
        
        if (savedMemberId) {
            const { data: existingMember, error: checkError } = await supabase
                .from('members')
                .select('id')
                .eq('id', savedMemberId)
                .single();
            
            if (existingMember) {
                // 기존 회원이면 바로 입장 처리
                await processEntry(savedMemberId);
                return;
            } else {
                // DB에 없으면 localStorage 삭제
                localStorage.removeItem('badminton_member_id');
            }
        }

        // 신규 회원이면 닉네임 입력 화면으로
        setStatus('nickname-input');
    };

    const handleNicknameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!nickname.trim()) {
            alert('이름을 입력해주세요.');
            return;
        }

        setStatus('processing');
        setMessage('계정을 생성하는 중...');

        try {
            // 회원 생성
            const { data: memberData, error: memberError } = await supabase
                .from('members')
                .insert({ nickname: nickname.trim() })
                .select('*')
                .single();

            if (memberError) {
                setMessage(`회원 생성 실패: ${memberError.message}`);
                setStatus('error');
                return;
            }

            localStorage.setItem('badminton_member_id', memberData.id);

            // 입장 처리
            await processEntry(memberData.id);

        } catch (error) {
            setStatus('error');
        }
    };

    const processEntry = async (memberId: string) => {
        setMessage('입장 처리 중...');

        try {
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
                setMessage(`입장 처리 실패: ${entryError.message}`);
                setStatus('error');
                return;
            }

            // 성공 - 메인 페이지로 이동
            setStatus('success');
            setTimeout(() => {
                router.push('/');
            }, 2000);

        } catch (error) {
            setStatus('error');
        }
    };

    if (status === 'validating' || status === 'processing') {
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

    if (status === 'nickname-input') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-indigo-200/30 w-full max-w-md border border-white/60">
                    <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <User className="text-indigo-600 w-10 h-10" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
                        닉네임 입력
                    </h1>
                    <p className="text-slate-500 mb-8 font-medium leading-relaxed text-center">
                        사용하실 닉네임을 입력해주세요
                    </p>
                    
                    <form onSubmit={handleNicknameSubmit} className="space-y-6">
                        <div>
                            <input
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                placeholder="닉네임을 입력하세요"
                                className="w-full px-6 py-4 rounded-[1.5rem] border-2 border-slate-200 focus:border-indigo-400 focus:outline-none text-slate-800 font-medium placeholder:text-slate-400 bg-white/50 backdrop-blur-sm transition-all"
                                maxLength={20}
                                autoFocus
                            />
                        </div>
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-4 rounded-[1.5rem] font-bold hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-lg shadow-indigo-200/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!nickname.trim()}
                        >
                            입장하기
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-rose-200/30 w-full max-w-md border border-white/60 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-rose-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <BadmintonIcon className="text-rose-600 w-10 h-10" strokeWidth={2.5} />
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
