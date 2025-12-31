'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { Mail, Lock, LogIn, UserPlus } from 'lucide-react';
import { BadmintonIcon } from '../../components/BadmintonIcon';

export default function AdminLoginPage() {
    const router = useRouter();
    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

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
        } catch (error: any) {
            setError(error.message || '로그인에 실패했습니다.');
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
        } catch (error: any) {
            setError(error.message || '회원가입에 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* 로고 및 타이틀 */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 shadow-2xl">
                        <BadmintonIcon className="w-10 h-10 text-white" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-4xl font-black text-white mb-2">
                        {isSignUp ? '관리자 회원가입' : '관리자 로그인'}
                    </h1>
                    <p className="text-blue-200 font-medium">배드민턴 코트 관리 시스템</p>
                </div>

                {/* 로그인/회원가입 폼 */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <form onSubmit={isSignUp ? handleSignUp : handleLogin} className="space-y-6">
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
                                    required
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
                        {isSignUp && (
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
                                    {isSignUp ? '회원가입 중...' : '로그인 중...'}
                                </>
                            ) : (
                                <>
                                    {isSignUp ? (
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
                    <div className="mt-6 pt-6 border-t border-slate-200 text-center">
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
                            {isSignUp ? '이미 계정이 있으신가요? 로그인' : '계정이 없으신가요? 회원가입'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
