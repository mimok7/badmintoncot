'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User,
  Clock,
  Users,
  MapPin,
  Info,
  QrCode,
  LogOut,
  ChevronRight
} from 'lucide-react';

interface Member {
  id: string;
  member_number: number;
  nickname: string;
}

interface Court {
  id: number;
  name: string;
  status: string;
  current_users_count: number;
}

interface EntrySession {
  id: number;
  expires_at: string;
  is_active: boolean;
}

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [nickname, setNickname] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  const [session, setSession] = useState<EntrySession | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkUser();
    fetchCourts();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courts' }, () => fetchCourts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => fetchCourts())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (session?.expires_at) {
      const timer = setInterval(() => {
        const now = new Date().getTime();
        const expiry = new Date(session.expires_at).getTime();
        const diff = expiry - now;

        if (diff <= 0) {
          setTimeLeft('만료됨');
          setSession(null);
          clearInterval(timer);
        } else {
          const hours = Math.floor(diff / (1000 * 60 * 60));
          const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
          const seconds = Math.floor((diff % (1000 * 60)) / 1000);
          setTimeLeft(`${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [session]);

  const checkUser = async () => {
    // QR 검증 확인
    const qrVerified = localStorage.getItem('qr_verified');

    const savedMemberId = localStorage.getItem('badminton_member_id');
    if (savedMemberId) {
      const { data: memberData } = await supabase
        .from('members')
        .select('*')
        .eq('id', savedMemberId)
        .single();

      if (memberData) {
        setMember(memberData);
        const { data: sessionData } = await supabase
          .from('entry_sessions')
          .select('*')
          .eq('member_id', savedMemberId)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('entry_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionData) setSession(sessionData);
      } else {
        localStorage.removeItem('badminton_member_id');
      }
    }
    setLoading(false);
  };

  const fetchCourts = async () => {
    const { data: courtsData } = await supabase.from('courts').select('*').order('id', { ascending: true });
    const { data: resData } = await supabase.from('reservations').select('court_id');

    if (courtsData) {
      const updatedCourts = courtsData.map(court => ({
        ...court,
        current_users_count: resData?.filter(r => r.court_id === court.id)?.length ?? 0
      }));
      setCourts(updatedCourts);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) return;

    const { data, error } = await supabase
      .from('members')
      .insert([{ nickname }])
      .select()
      .single();

    if (error) {
      alert('등록 중 오류가 발생했습니다.');
      console.error(error);
      return;
    }

    if (data) {
      localStorage.setItem('badminton_member_id', data.id);
      localStorage.removeItem('qr_session_id');
      setMember(data);
    }
  };

  const handleEntry = async () => {
    if (!member) return;
    const { data, error } = await supabase
      .from('entry_sessions')
      .insert([{ member_id: member.id }])
      .select()
      .single();

    if (error) {
      alert('입장 처리 중 오류가 발생했습니다.');
      console.error(error);
      return;
    }

    if (data) setSession(data);
  };

  const handleReserve = async (courtId: number) => {
    if (!member || !session) {
      alert('입장 처리가 필요합니다.');
      return;
    }

    const { error } = await supabase
      .from('reservations')
      .insert([{ court_id: courtId, member_id: member.id }]);

    if (error) {
      if (error.code === '23505') alert('이미 이 코트에 대기 중입니다.');
      else alert('예약 중 오류가 발생했습니다.');
    } else {
      fetchCourts();
    }
  };

  if (loading) return (
    <div className="flex flex-col justify-center items-center h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200"></div>
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-indigo-600 border-r-transparent border-b-transparent border-l-transparent absolute top-0"></div>
      </div>
      <p className="text-slate-600 font-semibold mt-6 tracking-wide">시스템을 불러오는 중...</p>
    </div>
  );

  if (!member) {
    // QR 검증이 없으면 QR 스캔 안내 표시
    const qrVerified = localStorage.getItem('qr_verified');

    if (!qrVerified) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6">
          <div className="bg-white/95 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl w-full max-w-md border border-white/60 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[2rem] flex items-center justify-center mb-8 mx-auto animate-pulse">
              <QrCode className="text-indigo-600 w-12 h-12" strokeWidth={2.5} />
            </div>
            <h1 className="text-4xl font-black mb-4 text-center bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
              QR 코드 스캔 필요
            </h1>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed">
              배드민턴 코트 시스템을 이용하시려면<br />
              먼저 입구의 <span className="text-indigo-600 font-bold">QR 코드를 스캔</span>해주세요.
            </p>
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 text-left">
              <p className="text-sm font-bold text-indigo-900 mb-3">📱 스캔 방법</p>
              <ol className="text-sm text-slate-700 space-y-2">
                <li className="flex gap-2">
                  <span className="font-bold text-indigo-600">1.</span>
                  <span>스마트폰 카메라 앱을 실행하세요</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-indigo-600">2.</span>
                  <span>입구에 있는 QR 코드를 스캔하세요</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-indigo-600">3.</span>
                  <span>자동으로 이 페이지로 이동합니다</span>
                </li>
              </ol>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-50/50 p-6">
        <div className="bg-white/80 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl shadow-indigo-200/30 w-full max-w-md border border-white/60">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[1.5rem] flex items-center justify-center mb-8 mx-auto shadow-xl shadow-indigo-300/50 rotate-3 hover:rotate-0 transition-transform duration-300">
            <QrCode className="text-white w-10 h-10" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-black mb-3 text-center bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">반갑습니다!</h1>
          <p className="text-slate-500 mb-12 text-center font-medium leading-relaxed">배드민턴 코트 시스템 이용을 위해<br />사용하실 닉네임을 설정해주세요.</p>

          <form onSubmit={handleRegister} className="space-y-5">
            <div className="relative group">
              <User className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-indigo-600 transition-colors" />
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="사용할 닉네임 입력"
                className="w-full pl-14 pr-5 py-5 bg-slate-50/80 border border-slate-200/50 rounded-[1.5rem] focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800 placeholder:text-slate-400"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-indigo-700 text-white py-5 rounded-[1.5rem] font-bold hover:from-indigo-700 hover:to-indigo-800 transition-all shadow-xl shadow-indigo-300/40 hover:shadow-indigo-400/50 flex items-center justify-center gap-2 group active:scale-[0.98]"
            >
              시작하기
              <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" strokeWidth={3} />
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 pb-24">
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200/60 mb-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[0.875rem] flex items-center justify-center shadow-lg shadow-indigo-200/50">
              <QrCode className="text-white w-5 h-5" strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-black bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">BADMINTON<span className="bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text">COT</span></h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-3 bg-slate-50/80 px-4 py-2.5 rounded-2xl border border-slate-200/50">
              <div className="w-8 h-8 bg-indigo-100 rounded-xl flex items-center justify-center">
                <User className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-900 leading-tight">{member.nickname}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Member #{member.member_number}</p>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('badminton_member_id');
                window.location.reload();
              }}
              className="p-3 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" strokeWidth={2} />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6">
        <header className="flex flex-col md:flex-row justify-between items-end mb-12 gap-8">
          <div>
            <h2 className="text-5xl font-black bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent mb-3 tracking-tight leading-tight">코트 현황판</h2>
            <p className="text-slate-500 font-semibold flex items-center gap-2.5 text-base">
              <div className="relative flex h-3 w-3">
                <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></div>
                <div className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></div>
              </div>
              실시간으로 코트 상태를 확인하고 예약하세요.
            </p>
          </div>

          <div className="w-full md:w-auto">
            {session ? (
              <div className="bg-white/80 backdrop-blur-sm border border-indigo-200/60 p-5 rounded-[1.75rem] flex items-center gap-4 shadow-lg shadow-indigo-100/50">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1.25rem] flex items-center justify-center">
                  <Clock className="text-indigo-600 w-7 h-7" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">남은 이용 시간</p>
                  <p className="text-3xl font-mono font-black bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent leading-none">{timeLeft}</p>
                </div>
              </div>
            ) : (
              <button
                onClick={handleEntry}
                className="w-full md:w-auto bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-12 py-5 rounded-[1.75rem] font-bold hover:from-indigo-700 hover:to-indigo-800 shadow-xl shadow-indigo-300/40 hover:shadow-indigo-400/50 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
              >
                <QrCode className="w-6 h-6" strokeWidth={2.5} />
                QR 입장하기
              </button>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {courts.map((court) => (
            <div
              key={court.id}
              className="group bg-white/80 backdrop-blur-sm rounded-[2rem] border border-slate-200/60 p-7 shadow-md hover:shadow-2xl hover:shadow-indigo-200/30 transition-all duration-500 relative overflow-hidden hover:-translate-y-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 via-transparent to-slate-50/0 group-hover:from-indigo-50/50 group-hover:to-slate-50/30 transition-all duration-500 pointer-events-none"></div>

              <div className="relative z-10">
                <div className="flex justify-between items-start mb-7">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 mb-1.5">{court.name}</h3>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-300" strokeWidth={2.5} />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Court ID: {court.id}</span>
                    </div>
                  </div>
                  <span className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${court.status === 'available'
                    ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 border border-green-200/50'
                    : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 border border-amber-200/50'
                    }`}>
                    {court.status === 'available' ? 'Available' : 'In Use'}
                  </span>
                </div>

                <div className="space-y-5">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 rounded-[1.5rem] border border-slate-200/40">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">대기 인원</span>
                      </div>
                      <span className="text-xl font-black bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent">{court.current_users_count}<span className="text-slate-300 text-sm font-semibold"> / 4</span></span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden shadow-inner">
                      <div
                        className={`h-full transition-all duration-1000 ease-out rounded-full shadow-sm ${court.current_users_count >= 4 ? 'bg-gradient-to-r from-rose-500 to-pink-500' : 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                          }`}
                        style={{ width: `${(court.current_users_count / 4) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleReserve(court.id)}
                    className="w-full py-4 bg-gradient-to-r from-slate-900 to-slate-800 text-white text-sm rounded-[1.25rem] font-bold hover:from-indigo-600 hover:to-indigo-700 transition-all shadow-lg shadow-slate-900/20 hover:shadow-indigo-500/30 disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed disabled:hover:from-slate-900 disabled:hover:to-slate-800 flex items-center justify-center gap-2 group/btn active:scale-[0.98]"
                    disabled={!session || court.current_users_count >= 4}
                  >
                    {!session ? (
                      <>입장 후 신청 가능</>
                    ) : court.current_users_count >= 4 ? (
                      <>대기 마감</>
                    ) : (
                      <>
                        대기 신청하기
                        <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" strokeWidth={2.5} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 p-10 bg-gradient-to-br from-white via-white to-indigo-50/30 rounded-[2.5rem] border border-slate-200/60 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 p-12 opacity-[0.04] pointer-events-none">
            <Info className="w-72 h-72 text-indigo-600" />
          </div>

          <h3 className="text-3xl font-black mb-12 text-slate-900 flex items-center gap-4 relative z-10">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[1rem] flex items-center justify-center shadow-sm">
              <Info className="text-indigo-600 w-6 h-6" strokeWidth={2.5} />
            </div>
            이용 안내 및 규칙
          </h3>

          <div className="grid md:grid-cols-2 gap-x-16 gap-y-10 relative z-10">
            <div className="space-y-7">
              <div className="flex gap-5 group">
                <div className="flex-shrink-0 w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1rem] flex items-center justify-center text-indigo-600 font-black text-sm shadow-sm group-hover:shadow-md transition-shadow">01</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 text-base">QR 코드 입장</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">QR 코드를 스캔하여 입장하면 자동으로 로그인되며 <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">2시간</span> 동안 이용 권한이 부여됩니다.</p>
                </div>
              </div>
              <div className="flex gap-5 group">
                <div className="flex-shrink-0 w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1rem] flex items-center justify-center text-indigo-600 font-black text-sm shadow-sm group-hover:shadow-md transition-shadow">02</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 text-base">4인 매칭 시스템</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">모든 코트는 <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">4명이 모여야</span> 예약이 확정되며, 인원이 채워지면 즉시 경기를 시작할 수 있습니다.</p>
                </div>
              </div>
            </div>
            <div className="space-y-7">
              <div className="flex gap-5 group">
                <div className="flex-shrink-0 w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1rem] flex items-center justify-center text-indigo-600 font-black text-sm shadow-sm group-hover:shadow-md transition-shadow">03</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 text-base">회원 정보 저장</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">발급된 회원번호는 브라우저에 안전하게 저장되어 재방문 시 별도의 가입 없이 즉시 이용 가능합니다.</p>
                </div>
              </div>
              <div className="flex gap-5 group">
                <div className="flex-shrink-0 w-11 h-11 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1rem] flex items-center justify-center text-indigo-600 font-black text-sm shadow-sm group-hover:shadow-md transition-shadow">04</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-2 text-base">이용 시간 만료</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">이용 시간 종료 후에는 대기 신청이 불가능하며, 현재 대기 중인 목록에서도 자동으로 제외됩니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

