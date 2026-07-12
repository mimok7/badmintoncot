'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle, Loader2, User, AlertTriangle, BellOff } from 'lucide-react';
import { BadmintonIcon } from '../components/BadmintonIcon';
import { supabase } from '@/lib/supabase';
import { getDistanceInMeters } from '@/lib/geo';

function ScanContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [status, setStatus] = useState<'validating' | 'nickname-input' | 'processing' | 'success' | 'error'>('validating');
    const [message, setMessage] = useState('QR 코드를 확인하는 중...');
    const [nickname, setNickname] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(120);
    const [useGeofence, setUseGeofence] = useState<boolean>(false);
    const [locationLat, setLocationLat] = useState<number>(37.5665);
    const [locationLng, setLocationLng] = useState<number>(126.9780);
    const [locationRadius, setLocationRadius] = useState<number>(100);
    const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
    const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

    useEffect(() => {
        if ('Notification' in window) {
            setNotificationPermission(Notification.permission);
        }
    }, []);

    const fetchSettings = async () => {
        try {
            const { data } = await supabase
                .from('settings')
                .select('*')
                .eq('id', 1)
                .single();
            if (data) {
                const rulesText = data.rules || '';
                
                let loadedDuration = 120;
                if (data.duration_minutes !== null && data.duration_minutes !== undefined) {
                    loadedDuration = Number(data.duration_minutes);
                } else {
                    const matchDuration = rulesText.match(/\[duration_minutes:(\d+)\]/);
                    if (matchDuration) loadedDuration = parseInt(matchDuration[1], 10);
                }
                setDurationMinutes(loadedDuration);

                let loadedUseGeofence = false;
                if (data.use_geofence !== null && data.use_geofence !== undefined) {
                    loadedUseGeofence = Boolean(data.use_geofence);
                } else {
                    const matchGeofence = rulesText.match(/\[use_geofence:(\w+)\]/);
                    loadedUseGeofence = matchGeofence ? matchGeofence[1] === 'true' : false;
                }
                setUseGeofence(loadedUseGeofence);

                let loadedLat = 37.5665;
                if (data.location_lat !== null && data.location_lat !== undefined) {
                    loadedLat = Number(data.location_lat);
                } else {
                    const matchLat = rulesText.match(/\[location_lat:([\d.-]+)\]/);
                    loadedLat = matchLat ? parseFloat(matchLat[1]) : 37.5665;
                }
                setLocationLat(loadedLat);

                let loadedLng = 126.9780;
                if (data.location_lng !== null && data.location_lng !== undefined) {
                    loadedLng = Number(data.location_lng);
                } else {
                    const matchLng = rulesText.match(/\[location_lng:([\d.-]+)\]/);
                    loadedLng = matchLng ? parseFloat(matchLng[1]) : 126.9780;
                }
                setLocationLng(loadedLng);

                let loadedRadius = 100;
                if (data.location_radius !== null && data.location_radius !== undefined) {
                    loadedRadius = Number(data.location_radius);
                } else {
                    const matchRadius = rulesText.match(/\[location_radius:(\d+)\]/);
                    loadedRadius = matchRadius ? parseInt(matchRadius[1], 10) : 100;
                }
                setLocationRadius(loadedRadius);
            }
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        const init = async () => {
            await fetchSettings();
            await handleQRScan();
        };
        init();
    }, [searchParams, router]);

    useEffect(() => {
        if (!useGeofence) {
            setIsInsideGeofence(true);
            return;
        }

        let watchId: number;

        if ('geolocation' in navigator) {
            // 1차 위치 확인
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const dist = getDistanceInMeters(pos.coords.latitude, pos.coords.longitude, locationLat, locationLng);
                    setIsInsideGeofence(dist <= locationRadius);
                },
                (err) => {
                    console.error('Scan initial geo err:', err);
                    setIsInsideGeofence(false);
                }
            );

            // 실시간 트래킹
            watchId = navigator.geolocation.watchPosition(
                (pos) => {
                    const dist = getDistanceInMeters(pos.coords.latitude, pos.coords.longitude, locationLat, locationLng);
                    setIsInsideGeofence(dist <= locationRadius);
                },
                (err) => {
                    console.error('Scan geo watch err:', err);
                    setIsInsideGeofence(false);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        } else {
            setIsInsideGeofence(false);
        }

        return () => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
        };
    }, [useGeofence, locationLat, locationLng, locationRadius]);

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
            const { data: existingMember } = await supabase
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

        // 위치 기반 체크
        if (useGeofence && (isInsideGeofence === false || isInsideGeofence === null)) {
            alert('구장 내에서만 입장(닉네임 등록)이 가능합니다. 위치 서비스를 승인하고 구장에 접근해 주세요.');
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
            // 위치 기반 체크
            if (useGeofence && (isInsideGeofence === false || isInsideGeofence === null)) {
                setMessage('구장 내에서만 입장이 가능합니다. 위치 서비스를 승인하고 구장에 접근해 주세요.');
                setStatus('error');
                return;
            }

            // 1시간 이내 재로그인(재입장) 차단 검사
            const { data: recentSessions } = await supabase
                .from('entry_sessions')
                .select('entry_at')
                .eq('user_id', memberId)
                .order('entry_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (recentSessions) {
                const lastEntryTime = new Date(recentSessions.entry_at).getTime();
                const diffMs = Date.now() - lastEntryTime;
                const oneHourMs = 60 * 60 * 1000;
                if (diffMs < oneHourMs) {
                    const remainingMinutes = Math.ceil((oneHourMs - diffMs) / (60 * 1000));
                    setMessage(`한 번 로그인 후 1시간 이내에는 재로그인이 불가합니다. ${remainingMinutes}분 후에 다시 이용해 주세요.`);
                    setStatus('error');
                    return;
                }
            }

            // UUID 직접 생성 (DB에 기본값이 없으므로)
            const entryId = crypto.randomUUID();
            const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
            
            const { error: entryError } = await supabase
                .from('entry_sessions')
                .insert({ 
                    id: entryId,
                    user_id: memberId,
                    expires_at: expiresAt
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
                    {useGeofence && (
                        <div className="mb-4 text-center">
                            {isInsideGeofence === null ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400 animate-ping"></span>
                                    위치 확인 중...
                                </span>
                            ) : isInsideGeofence ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-50 text-green-700 border border-green-200">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-500"></span>
                                    구장 내 위치 확인됨
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    구장 외 접근 불가
                                </span>
                            )}
                        </div>
                    )}
                    
                    {/* 위치 및 알림 경고 안내문구 */}
                    {useGeofence && (isInsideGeofence === false || isInsideGeofence === null) && (
                        <div className="bg-rose-50 border border-rose-100 text-rose-700 px-3.5 py-3 rounded-2xl mb-3 text-[10px] font-bold text-left leading-normal flex items-start gap-1.5 shadow-sm">
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-500" />
                            <span>위치 기반 서비스 권한이 허용되지 않았거나 구장 밖입니다. 위치 권한을 허용하고 구장 내에 계셔야 앱을 사용하실 수 있습니다.</span>
                        </div>
                    )}
                    {notificationPermission !== 'granted' && (
                        <div className="bg-amber-50 border border-amber-100 text-amber-800 px-3.5 py-3 rounded-2xl mb-3 text-[10px] font-bold text-left leading-normal flex items-start gap-1.5 shadow-sm">
                            <BellOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
                            <span>알림 권한이 허용되지 않았습니다. 알림을 허용하지 않으면 본인의 대기 순서(입장 차례)를 실시간 알림으로 받지 못합니다.</span>
                        </div>
                    )}

                    <p className="text-slate-500 mb-6 font-medium leading-relaxed text-center text-xs">
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
                            className={`w-full py-4 rounded-[1.5rem] font-bold transition-all shadow-lg active:scale-95 ${
                                useGeofence && (isInsideGeofence === false || isInsideGeofence === null)
                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 shadow-indigo-200/50'
                            }`}
                            disabled={!nickname.trim() || (useGeofence && (isInsideGeofence === false || isInsideGeofence === null))}
                        >
                            입장하기
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        const isQrError = message === 'QR 코드를 확인하는 중...' || message.includes('QR 코드를 스캔') || !searchParams.get('session');
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-white to-slate-50/50 p-6">
                <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-rose-200/30 w-full max-w-md border border-white/60 text-center">
                    <div className="w-20 h-20 bg-gradient-to-br from-rose-100 to-rose-200 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto">
                        <BadmintonIcon className="text-rose-600 w-10 h-10" strokeWidth={2.5} />
                    </div>
                    <h1 className="text-3xl font-black mb-3 text-center bg-gradient-to-r from-rose-900 to-rose-700 bg-clip-text text-transparent tracking-tight">
                        {isQrError ? '유효하지 않은 QR 코드' : '입장 제한'}
                    </h1>
                    <p className="text-slate-500 mb-8 font-medium leading-relaxed">
                        {isQrError ? '올바른 QR 코드를 스캔해주세요.' : message}
                    </p>
                    {isQrError && (
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 text-left">
                            <p className="text-xs font-bold text-slate-700 mb-2">디버그 정보:</p>
                            <p className="text-xs text-slate-600 font-mono break-all">
                                스캔된 세션: {searchParams.get('session') || '없음'}
                            </p>
                            <p className="text-xs text-slate-600 font-mono break-all mt-1">
                                예상 세션: {process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024'}
                            </p>
                        </div>
                    )}
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
