'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, UserPlus, Home } from 'lucide-react';

export default function AdminLoginPage() {
    const router = useRouter();
    const [isSignUp, setIsSignUp] = useState(false);
    const [isRecovery, setIsRecovery] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecovery(true);
                setIsSignUp(false);
                setError('');
                setSuccessMessage('새 비밀번호를 입력해 주세요.');
            }
        });

        return () => authListener.subscription.unsubscribe();
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;

            if (data.user) {
                router.push('/admin');
            }
        } catch (error) {
            setError(error instanceof Error ? error.message : '로그인에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignUp = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        // 비밀번호 확인
        if (password !== confirmPassword) {
            setError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (password.length < 6) {
            setError('비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        setIsLoading(true);

        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) throw error;

            if (data.user) {
                setSuccessMessage('회원가입이 완료되었습니다! 이메일을 확인해주세요.');
                // 이메일 확인 후 로그인하도록 안내
                setTimeout(() => {
                    setIsSignUp(false);
                    setEmail('');
                    setPassword('');
                    setConfirmPassword('');
                }, 3000);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : '';
            if (/already registered|already exists|duplicate|user.*exist|등록된 사용자가 있/i.test(message)) {
                setIsSignUp(false);
                setPassword('');
                setConfirmPassword('');
                setSuccessMessage('이미 등록된 관리자 이메일입니다. 회원가입이 아니라 로그인해 주세요. 비밀번호를 모르면 초기화 SQL을 실행하세요.');
                return;
            }
            setError(message || '회원가입에 실패했습니다. Supabase Auth 설정과 이메일 주소를 확인해주세요.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecovery = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');

        if (password.length < 6) {
            setError('비밀번호는 최소 6자리 이상이어야 합니다.');
            return;
        }
        if (password !== confirmPassword) {
            setError('새 비밀번호가 일치하지 않습니다.');
            return;
        }

        setIsLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            alert('비밀번호가 변경되었습니다.');
            router.push('/admin');
        } catch (error) {
            setError(error instanceof Error ? error.message : '비밀번호 변경에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4 relative">
            {/* 우측 상단 사용자 홈 버튼 */}
            <div className="absolute top-4 right-4 md:top-8 md:right-8 z-50">
                <button
                    onClick={() => router.push('/')}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl font-bold text-sm transition-all shadow-lg backdrop-blur-md active:scale-95"
                >
                    <Home className="w-4 h-4" />
                    사용자 홈
                </button>
            </div>

            <div className="w-full max-w-md">
                {/* 로고 및 타이틀 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-2xl mb-4 shadow-2xl p-2 border border-slate-100">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <h1 className="text-4xl font-black text-white mb-2">
                        {isRecovery ? '비밀번호 변경' : isSignUp ? '관리자 회원가입' : '관리자 로그인'}
                    </h1>
                    <p className="text-blue-200 font-medium">배드민턴 코트 관리 시스템</p>
                </div>

                {/* 로그인/회원가입 폼 */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <form onSubmit={isRecovery ? handleRecovery : isSignUp ? handleSignUp : handleLogin} className="space-y-6">
                        {/* 이메일 입력 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                이메일
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@example.com"
                                    required={!isRecovery}
                                    disabled={isRecovery}
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 outline-none transition-all font-semibold text-slate-800"
                                />
                            </div>
                        </div>

                        {/* 비밀번호 입력 */}
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                비밀번호
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 outline-none transition-all font-semibold text-slate-800"
                                />
                            </div>
                        </div>

                        {/* 비밀번호 확인 (회원가입 시에만) */}
                        {(isSignUp || isRecovery) && (
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    비밀번호 확인
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-300 outline-none transition-all font-semibold text-slate-800"
                                    />
                                </div>
                            </div>
                        )}

                        {/* 성공 메시지 */}
                        {successMessage && (
                            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                                <p className="text-sm font-semibold text-green-600">{successMessage}</p>
                            </div>
                        )}

                        {/* 에러 메시지 */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                                <p className="text-sm font-semibold text-red-600">{error}</p>
                            </div>
                        )}

                        {/* 로그인/회원가입 버튼 */}
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 rounded-xl font-bold text-lg hover:from-blue-600 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    {isRecovery ? '변경 중...' : isSignUp ? '회원가입 중...' : '로그인 중...'}
                                </>
                            ) : (
                                <>
                                    {isRecovery ? (
                                        <>
                                            <Lock className="w-5 h-5" />
                                            비밀번호 변경
                                        </>
                                    ) : isSignUp ? (
                                        <>
                                            <UserPlus className="w-5 h-5" />
                                            회원가입
                                        </>
                                    ) : (
                                        <>
                                            <LogIn className="w-5 h-5" />
                                            로그인
                                        </>
                                    )}
                                </>
                            )}
                        </button>
                    </form>

                    {/* 전환 버튼 */}
                    {!isRecovery && <div className="mt-6 pt-6 border-t border-slate-200 text-center">
                        <button
                            onClick={() => {
                                setIsSignUp(!isSignUp);
                                setError('');
                                setSuccessMessage('');
                                setEmail('');
                                setPassword('');
                                setConfirmPassword('');
                            }}
                            className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '관리자 계정 회원가입'}
                        </button>
                    </div>}
                </div>
            </div>
        </div>
    );
}
