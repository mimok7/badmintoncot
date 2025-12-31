'use client';

import { useState, useEffect } from 'react';
import QRCode from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import {
    QrCode,
    RefreshCw,
    Copy,
    Check,
    Shield,
    LayoutDashboard,
    Users,
    Activity,
    Settings,
    ChevronRight,
    Clock,
    MapPin,
    Printer
} from 'lucide-react';

type MenuType = 'qr' | 'courts' | 'usage' | 'settings';

interface Court {
    id: number;
    name: string;
    status: string;
    current_users_count: number;
}

interface Member {
    id: string;
    member_number: number;
    nickname: string;
    created_at: string;
}

interface EntrySession {
    id: number;
    member_id: string;
    entry_at: string;
    expires_at: string;
    is_active: boolean;
    members?: Member;
}

interface Settings {
    venueName: string;
    operatingHours: string;
    contactInfo: string;
    rules: string;
}

export default function AdminPage() {
    const [activeMenu, setActiveMenu] = useState<MenuType>('qr');
    const [qrUrl, setQrUrl] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [copied, setCopied] = useState(false);
    const [courts, setCourts] = useState<Court[]>([]);
    const [activeSessions, setActiveSessions] = useState<EntrySession[]>([]);
    const [settings, setSettings] = useState<Settings>({
        venueName: '스마트 배드민턴 코트',
        operatingHours: '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
        contactInfo: '전화: 02-1234-5678 | 이메일: info@badminton.com',
        rules: '• 코트 이용 시간은 2시간으로 제한됩니다.\n• 4명이 모여야 코트 사용이 가능합니다.\n• 안전을 위해 운동화를 착용해주세요.\n• 코트 내 음식물 반입을 금지합니다.'
    });

    useEffect(() => {
        const host = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        setBaseUrl(host);
        generateQRWithFixedSession(host);
        fetchCourts();
        fetchActiveSessions();

        // 실시간 업데이트 구독
        const channel = supabase
            .channel('admin-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'courts' }, fetchCourts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_sessions' }, fetchActiveSessions)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const generateQRWithFixedSession = (currentBaseUrl?: string) => {
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';
        const host = currentBaseUrl || baseUrl;
        const url = `${host}/scan?session=${fixedSessionId}`;
        setQrUrl(url);
    };

    const fetchCourts = async () => {
        const { data: courtsData } = await supabase.from('courts').select('*').order('id');
        const { data: resData } = await supabase.from('reservations').select('court_id');

        if (courtsData) {
            const updatedCourts = courtsData.map(court => ({
                ...court,
                current_users_count: resData?.filter(r => r.court_id === court.id)?.length ?? 0
            }));
            setCourts(updatedCourts);
        }
    };

    const fetchActiveSessions = async () => {
        const { data } = await supabase
            .from('entry_sessions')
            .select(`
        *,
        members (
          id,
          member_number,
          nickname,
          created_at
        )
      `)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('entry_at', { ascending: false });

        if (data) setActiveSessions(data as EntrySession[]);
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(qrUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const getTimeRemaining = (expiresAt: string) => {
        const now = new Date().getTime();
        const expiry = new Date(expiresAt).getTime();
        const diff = expiry - now;

        if (diff <= 0) return '만료됨';

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}시간 ${minutes}분`;
    };

    const getSessionsByHour = () => {
        const hourMap: { [key: string]: number } = {};

        activeSessions.forEach(session => {
            const hour = new Date(session.entry_at).getHours();
            const hourKey = `${hour}:00`;
            hourMap[hourKey] = (hourMap[hourKey] || 0) + 1;
        });

        return Object.entries(hourMap)
            .sort(([a], [b]) => parseInt(a) - parseInt(b))
            .map(([hour, count]) => ({ hour, count }));
    };

    const handlePrint = async () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        // QR Canvas 추출
        const canvas = document.querySelector('#qr-code-canvas') as HTMLCanvasElement;

        const getQrDataUrl = (): Promise<string> => {
            return new Promise((resolve) => {
                if (!canvas) {
                    resolve('');
                    return;
                }
                resolve(canvas.toDataURL('image/png'));
            });
        };

        const qrDataUrl = await getQrDataUrl();
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';
        const printContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>QR 코드 - ${settings.venueName}</title>
                <style>
                @media print {
                    @page { size: A4; margin: 0; }
                    body { margin: 1cm; }
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    text-align: center;
                    color: #0f172a;
                    padding: 40px;
                }
                .container { max-width: 800px; margin: 0 auto; }
                .card { 
                    border: 1px solid #e2e8f0; 
                    border-radius: 32px; 
                    padding: 60px 40px; 
                    background: white;
                }
                h1 { font-size: 42px; font-weight: 800; margin-bottom: 8px; color: #1e293b; }
                .subtitle { font-size: 20px; color: #64748b; margin-bottom: 40px; }
                .qr-frame {
                    display: inline-block;
                    padding: 30px;
                    background: white;
                    border: 8px solid #f1f5f9;
                    border-radius: 40px;
                    margin-bottom: 40px;
                }
                .qr-image { width: 400px; height: 400px; display: block; }
                .instructions {
                    text-align: left;
                    background: #f8fafc;
                    padding: 40px;
                    border-radius: 24px;
                    margin: 40px 0;
                }
                .instructions h2 { font-size: 24px; font-weight: 700; margin-bottom: 24px; text-align: center; }
                .instructions ol { font-size: 18px; line-height: 2; color: #334155; }
                .footer { color: #94a3b8; font-size: 12px; margin-top: 40px; border-top: 1px solid #f1f5f9; padding-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                <div class="card">
                    <h1>${settings.venueName}</h1>
                    <p class="subtitle">배드민턴 코트 스마트 입장 가이드</p>
                    
                    <div class="qr-frame">
                    <img src="${qrDataUrl}" class="qr-image" alt="QR Code" />
                    </div>

                    <div class="instructions">
                    <h2>📱 입장 방법 (60초 완료)</h2>
                    <ol>
                        <li>휴대폰 <strong>기본 카메라</strong>를 실행합니다.</li>
                        <li>위 <strong>QR 코드를 스캔</strong>하여 링크로 접속합니다.</li>
                        <li><strong>닉네임을 등록</strong>합니다 (최초 1회).</li>
                        <li>화면 중앙의 <strong>'QR 입장하기'</strong> 버튼을 클릭합니다.</li>
                        <li>원하는 <strong>코트에 대기 신청</strong>을 완료합니다.</li>
                    </ol>
                    </div>

                    <div class="footer">
                    고정 세션 ID: ${fixedSessionId} | 자동 매칭 시스템 활성화 중
                    </div>
                </div>
                </div>
            </body>
            </html>
        `;

        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for image to render in the new window
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 1000);
    };

    const menuItems = [
        { id: 'qr' as MenuType, icon: QrCode, label: 'QR 생성', color: 'indigo' },
        { id: 'courts' as MenuType, icon: LayoutDashboard, label: '코트 현황', color: 'blue' },
        { id: 'usage' as MenuType, icon: Activity, label: '사용 현황', color: 'green' },
        { id: 'settings' as MenuType, icon: Settings, label: '환경설정', color: 'slate' },
    ];

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-slate-200 shadow-lg">
                <div className="p-6 border-b border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
                            <Shield className="w-6 h-6 text-white" strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900">관리자</h1>
                            <p className="text-xs text-slate-500 font-semibold">Admin Dashboard</p>
                        </div>
                    </div>
                </div>

                <nav className="p-4">
                    <ul className="space-y-2">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = activeMenu === item.id;

                            return (
                                <li key={item.id}>
                                    <button
                                        onClick={() => setActiveMenu(item.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${isActive
                                            ? `bg-gradient-to-r from-${item.color}-600 to-${item.color}-700 text-white shadow-lg shadow-${item.color}-200`
                                            : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        <Icon className="w-5 h-5" strokeWidth={2.5} />
                                        <span className="flex-1 text-left">{item.label}</span>
                                        {isActive && <ChevronRight className="w-4 h-4" strokeWidth={3} />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-200 bg-slate-50">
                    <div className="text-center">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                            Badminton Court System
                        </p>
                        <p className="text-xs text-slate-400 mt-1">v1.0.0</p>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-auto">
                {/* QR 생성 */}
                {activeMenu === 'qr' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2">QR 코드 생성</h2>
                            <p className="text-slate-600 font-medium">사용자가 스캔할 QR 코드를 생성하고 인쇄하세요</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                            {/* QR 코드 표시 영역 (좌측) */}
                            <div className="md:col-span-3">
                                <div className="bg-white rounded-3xl p-8 shadow-xl border border-slate-200 flex flex-col items-center">
                                    <div className="bg-white p-6 rounded-2xl shadow-inner mb-6 border-2 border-indigo-50">
                                        {qrUrl ? (
                                            <QRCode
                                                id="qr-code-canvas"
                                                value={qrUrl}
                                                size={320}
                                                level="H"
                                                includeMargin={true}
                                                bgColor="#ffffff"
                                                fgColor="#1e293b"
                                            />
                                        ) : (
                                            <div className="w-[320px] h-[320px] flex items-center justify-center">
                                                <QrCode className="w-24 h-24 text-slate-200 animate-pulse" />
                                            </div>
                                        )}
                                    </div>

                                    <div className="w-full grid grid-cols-2 gap-4 mb-4">
                                        <button
                                            onClick={handlePrint}
                                            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold hover:shadow-lg transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                        >
                                            <Printer className="w-5 h-5" />
                                            인쇄하기
                                        </button>
                                        <button
                                            onClick={() => generateQRWithFixedSession()}
                                            disabled={true}
                                            className="bg-slate-400 text-white py-4 rounded-xl font-bold cursor-not-allowed flex items-center justify-center gap-2 opacity-50"
                                            title="고정 QR 코드는 변경되지 않습니다"
                                        >
                                            <RefreshCw className="w-5 h-5" />
                                            새로고침
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* 설정 및 정보 영역 (우측) */}
                            <div className="md:col-span-2 space-y-6">
                                <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2">기본 호스트 설정 (모바일 접속용)</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={baseUrl}
                                            onChange={(e) => {
                                                setBaseUrl(e.target.value);
                                                const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';
                                                const url = `${e.target.value}/scan?session=${fixedSessionId}`;
                                                setQrUrl(url);
                                            }}
                                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
                                            placeholder="http://192.168.0.x:3000"
                                        />
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-2 font-medium">※ 스마트폰 스캔을 위해 IP 주소(예: 192.168.0.98)를 입력하세요.</p>
                                </div>

                                <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-bold text-slate-400 uppercase">QR 연결 URL</p>
                                        <button
                                            onClick={copyToClipboard}
                                            className="text-indigo-600 hover:text-indigo-700 font-bold text-xs flex items-center gap-1"
                                        >
                                            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                            {copied ? '복사됨' : '복사'}
                                        </button>
                                    </div>
                                    <p className="text-xs font-mono text-slate-500 break-all bg-slate-50 p-3 rounded-lg border border-slate-200">{qrUrl || '생성 중...'}</p>
                                </div>

                                <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-100">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-2">세션 ID (고정)</p>
                                    <p className="text-xs font-mono text-slate-500 break-all bg-slate-50 p-3 rounded-lg border border-slate-200">
                                        {process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024'}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-2 font-medium">※ 모든 사용자가 동일한 고정 QR 코드를 사용합니다.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 코트 현황 */}
                {activeMenu === 'courts' && (
                    <div>
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2">코트 현황</h2>
                            <p className="text-slate-600 font-medium">실시간 코트 상태 및 대기 인원을 확인하세요</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {courts.map((court) => (
                                <div
                                    key={court.id}
                                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-all"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-2xl font-black text-slate-900 mb-1">{court.name}</h3>
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="w-3.5 h-3.5 text-slate-300" strokeWidth={2.5} />
                                                <span className="text-xs font-bold text-slate-400">ID: {court.id}</span>
                                            </div>
                                        </div>
                                        <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase ${court.status === 'available'
                                            ? 'bg-green-100 text-green-700 border border-green-200'
                                            : 'bg-amber-100 text-amber-700 border border-amber-200'
                                            }`}>
                                            {court.status === 'available' ? '사용가능' : '사용중'}
                                        </span>
                                    </div>

                                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <Users className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                <span className="text-xs font-bold text-slate-600">대기 인원</span>
                                            </div>
                                            <span className="text-xl font-black text-indigo-600">
                                                {court.current_users_count}<span className="text-slate-300 text-sm">/4</span>
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={`h-full transition-all duration-500 rounded-full ${court.current_users_count >= 4 ? 'bg-rose-500' : 'bg-indigo-600'
                                                    }`}
                                                style={{ width: `${(court.current_users_count / 4) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 사용 현황 */}
                {activeMenu === 'usage' && (
                    <div>
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2">사용 현황</h2>
                            <p className="text-slate-600 font-medium">시간대별 사용자 현황을 확인하세요</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                                <h3 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
                                    <Users className="w-5 h-5 text-green-600" />
                                    현재 활성 사용자
                                </h3>
                                <div className="text-5xl font-black text-green-600 mb-2">{activeSessions.length}</div>
                                <p className="text-sm text-slate-500 font-semibold">명이 현재 이용 중입니다</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                                <h3 className="text-xl font-black text-slate-900 mb-4 flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-blue-600" />
                                    시간대별 입장
                                </h3>
                                <div className="space-y-3">
                                    {getSessionsByHour().slice(-5).map(({ hour, count }) => (
                                        <div key={hour} className="flex items-center gap-3">
                                            <span className="text-sm font-bold text-slate-600 w-16">{hour}</span>
                                            <div className="flex-1 bg-slate-100 rounded-full h-8 overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-end pr-3"
                                                    style={{ width: `${(count / Math.max(...getSessionsByHour().map(s => s.count))) * 100}%` }}
                                                >
                                                    <span className="text-xs font-bold text-white">{count}명</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200">
                            <h3 className="text-xl font-black text-slate-900 mb-6">활성 세션 목록</h3>
                            <div className="space-y-3">
                                {activeSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100 transition-colors"
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-xl flex items-center justify-center">
                                                <Users className="w-6 h-6 text-indigo-600" strokeWidth={2.5} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-slate-900">{session.members?.nickname || '알 수 없음'}</p>
                                                <p className="text-xs text-slate-500 font-semibold">
                                                    회원 #{session.members?.member_number || 'N/A'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-600 mb-1">
                                                <Clock className="w-4 h-4" />
                                                {getTimeRemaining(session.expires_at)}
                                            </div>
                                            <p className="text-xs text-slate-400">
                                                입장: {new Date(session.entry_at).toLocaleTimeString('ko-KR')}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {activeSessions.length === 0 && (
                                    <div className="text-center py-12 text-slate-400">
                                        <Users className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="font-semibold">현재 활성 세션이 없습니다</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* 환경설정 */}
                {activeMenu === 'settings' && (
                    <div>
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2">환경설정</h2>
                            <p className="text-slate-600 font-medium">배드민턴장 정보 및 운영 설정을 관리하세요</p>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
                                <h3 className="text-xl font-black text-slate-900 mb-6">기본 정보</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">배드민턴장 이름</label>
                                        <input
                                            type="text"
                                            value={settings.venueName}
                                            onChange={(e) => setSettings({ ...settings, venueName: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">운영 시간</label>
                                        <input
                                            type="text"
                                            value={settings.operatingHours}
                                            onChange={(e) => setSettings({ ...settings, operatingHours: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">연락처 정보</label>
                                        <input
                                            type="text"
                                            value={settings.contactInfo}
                                            onChange={(e) => setSettings({ ...settings, contactInfo: e.target.value })}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
                                <h3 className="text-xl font-black text-slate-900 mb-6">이용 안내 및 규칙</h3>
                                <textarea
                                    value={settings.rules}
                                    onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
                                    rows={8}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800 resize-none"
                                />
                            </div>

                            <button className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-4 rounded-xl font-bold hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-xl shadow-indigo-300/40 hover:shadow-indigo-400/50 active:scale-[0.98]">
                                설정 저장
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
