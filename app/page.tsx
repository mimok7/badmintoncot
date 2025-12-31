'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User,
  Clock,
  Users,
  MapPin,
  Info,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { BadmintonIcon } from './components/BadmintonIcon';

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
  current_playing_team: number | null;
  waitingMembers?: string[];
  waitingTeams?: {
    teamNumber: number;
    members: string[];
    status: 'waiting' | 'confirmed' | 'playing';
  }[];
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
  const [myReservedCourtId, setMyReservedCourtId] = useState<number | null>(null);
  const [myTeamNumber, setMyTeamNumber] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<{courtId: number, teamNumber: number} | null>(null);
  const [myCurrentStatus, setMyCurrentStatus] = useState<'waiting' | 'confirmed' | 'playing' | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');

  // 브라우저 알림 권한 요청
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      if (Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
          setNotificationPermission(permission);
        });
      }
    }
  }, []);

  const handleRequestNotification = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        alert('알림이 허용되었습니다! 경기 시작 시 알림을 받을 수 있습니다.');
      }
    }
  };

  useEffect(() => {
    checkUser();
    fetchCourts();

    const channel = supabase
      .channel('schema-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courts' }, () => {
        fetchCourts();
        checkMyReservation();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        fetchCourts();
        checkMyReservation();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 내 팀 상태 변경 감지 및 알림
  useEffect(() => {
    if (!member) return;

    const reservationChannel = supabase
      .channel(`reservation-${member.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: `user_id=eq.${member.id}`
        },
        (payload) => {
          const newStatus = payload.new.status;
          const oldStatus = payload.old.status;
          
          console.log('예야 상태 변경:', { oldStatus, newStatus });
          
          // 상태가 playing으로 변경되면 알림
          if (oldStatus !== 'playing' && newStatus === 'playing') {
            const courtId = payload.new.court_id;
            const teamNumber = payload.new.team_number;
            
            // 브라우저 알림
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🎾 경기 시작!', {
                body: `코트 ${courtId} - 대기${teamNumber}팀 경기가 시작되었습니다!`,
                icon: '/badminton-icon.png',
                requireInteraction: true
              });
            }
            
            // 소리 재생 (선택적)
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZRQ0NUrDn77BdGAg+ltryxnMnBSl+zPLaizsIGGS57OihUBELTKXh8bllHAU2jdXzzn0vBSZ6yvHeizYIGWe97OmiUBAMT6fj8LZjHAY4kdfy');
            audio.play().catch(() => {});
            
            // 화면 강조 효과
            document.body.style.backgroundColor = '#10b981';
            setTimeout(() => {
              document.body.style.backgroundColor = '';
            }, 1000);
          }
          
          setMyCurrentStatus(newStatus);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(reservationChannel);
    };
  }, [member]);

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
          .eq('user_id', savedMemberId)
          .eq('is_active', true)
          .gt('expires_at', new Date().toISOString())
          .order('entry_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sessionData) setSession(sessionData);
        
        // 예약 상태 확인
        const { data: reservationData } = await supabase
          .from('reservations')
          .select('court_id, team_number, status')
          .eq('user_id', savedMemberId)
          .maybeSingle();
        
        if (reservationData) {
          setMyReservedCourtId(reservationData.court_id);
          setMyTeamNumber(reservationData.team_number);
          setMyCurrentStatus(reservationData.status);
        }
      } else {
        localStorage.removeItem('badminton_member_id');
      }
    }
    setLoading(false);
  };

  const checkMyReservation = async () => {
    if (!member) return;
    
    const { data } = await supabase
      .from('reservations')
      .select('court_id, team_number, status')
      .eq('user_id', member.id)
      .maybeSingle();
    
    setMyReservedCourtId(data?.court_id ?? null);
    setMyTeamNumber(data?.team_number ?? null);
    setMyCurrentStatus(data?.status ?? null);
  };

  const fetchCourts = async () => {
    const { data: courtsData } = await supabase.from('courts').select('*').order('id', { ascending: true });
    const { data: resData } = await supabase
      .from('reservations')
      .select('court_id, user_id, team_number, status, members(nickname)')
      .order('team_number', { ascending: true });

    if (courtsData) {
      const updatedCourts = courtsData.map(court => {
        const courtReservations = resData?.filter(r => r.court_id === court.id) ?? [];
        
        // 팀별로 그룹핑 (상태 포함)
        const teamsMap = new Map<number, {members: string[], status: string}>();
        courtReservations.forEach(r => {
          const member = r.members as any;
          const nickname = member?.nickname || '알 수 없음';
          const teamNum = r.team_number || 1;
          const status = r.status || 'waiting';
          
          if (!teamsMap.has(teamNum)) {
            teamsMap.set(teamNum, {members: [], status});
          }
          teamsMap.get(teamNum)!.members.push(nickname);
        });
        
        // Map을 배열로 변환
        const waitingTeams = Array.from(teamsMap.entries())
          .map(([teamNumber, data]) => ({ 
            teamNumber, 
            members: data.members,
            status: data.status as 'waiting' | 'confirmed' | 'playing'
          }))
          .sort((a, b) => a.teamNumber - b.teamNumber);
        
        return {
          ...court,
          current_users_count: courtReservations.length,
          waitingMembers: courtReservations.map(r => {
            const member = r.members as any;
            return member?.nickname || '알 수 없음';
          }),
          waitingTeams
        };
      });
      setCourts(updatedCourts);
    }
    
    // 내 예약 상태도 함께 확인
    if (member) {
      checkMyReservation();
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
      setMember(data);
      
      // 자동으로 입장 처리 (id 직접 생성)
      const entryId = crypto.randomUUID();
      const { data: entryData } = await supabase
        .from('entry_sessions')
        .insert({ id: entryId, user_id: data.id })
        .select()
        .single();
      
      if (entryData) setSession(entryData);
    }
  };

  const handleEntry = async () => {
    if (!member) return;
    const entryId = crypto.randomUUID();
    const { data, error } = await supabase
      .from('entry_sessions')
      .insert({ id: entryId, user_id: member.id })
      .select()
      .single();

    if (error) {
      alert('입장 처리 중 오류가 발생했습니다.');
      console.error(error);
      return;
    }

    if (data) setSession(data);
  };

  const handleReserve = async (courtId: number, teamNumber: number) => {
    if (!member || !session) {
      alert('입장 처리가 필요합니다.');
      return;
    }

    // 이미 예약이 있는지 확인
    if (myReservedCourtId !== null) {
      alert('이미 다른 코트에 대기 중입니다. 먼저 취소해주세요.');
      return;
    }

    const { error } = await supabase
      .from('reservations')
      .insert({ court_id: courtId, user_id: member.id, team_number: teamNumber });

    if (error) {
      console.error('예약 오류:', error);
      console.error('오류 상세 JSON:', JSON.stringify(error, null, 2));
      if (error.code === '23505') {
        alert('이미 이 코트에 대기 중입니다.');
        // 예약 상태 다시 확인
        await checkMyReservation();
      } else if (error.message.includes('4명으로 마감')) {
        alert('해당 대기팀은 이미 4명으로 마감되었습니다. 다른 팀을 선택해주세요.');
      } else {
        alert(`예약 중 오류: ${error.message}`);
      }
    } else {
      alert(`대기${teamNumber}팀 신청이 완료되었습니다!`);
      setMyReservedCourtId(courtId);
      setMyTeamNumber(teamNumber);
      setSelectedTeam(null);
      fetchCourts();
    }
  };

  const handleCancelReservation = async () => {
    if (!member || !myReservedCourtId) return;

    const confirmed = confirm('대기 신청을 취소하시겠습니까?');
    if (!confirmed) return;

    const { error } = await supabase
      .from('reservations')
      .delete()
      .eq('user_id', member.id)
      .eq('court_id', myReservedCourtId);

    if (error) {
      console.error('예약 취소 오류:', error);
      alert('예약 취소 중 오류가 발생했습니다.');
    } else {
      alert('예약이 취소되었습니다.');
      setMyReservedCourtId(null);
      setMyTeamNumber(null);
      fetchCourts();
    }
  };

  const handleEndGame = async (courtId: number) => {
    if (!member) return;

    const confirmed = confirm('경기를 종료하시겠습니까?');
    if (!confirmed) return;

    try {
      const { data, error } = await supabase.rpc('end_game', {
        p_court_id: courtId,
        p_user_id: member.id
      });

      if (error) {
        console.error('경기 종료 오류:', error);
        alert('경기 종료 중 오류가 발생했습니다.');
        return;
      }

      if (data && data.success) {
        alert(data.message);
        setMyReservedCourtId(null);
        setMyTeamNumber(null);
        fetchCourts();
      } else {
        alert(data?.message || '경기 종료에 실패했습니다.');
      }
    } catch (error) {
      console.error('경기 종료 처리 오류:', error);
      alert('경기 종료 처리 중 오류가 발생했습니다.');
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
    // QR 스캔 안내 표시
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-6">
          <div className="bg-white/95 backdrop-blur-xl p-12 rounded-[3rem] shadow-2xl w-full max-w-md border border-white/60 text-center">
            <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-[2rem] flex items-center justify-center mb-8 mx-auto animate-pulse">
              <BadmintonIcon className="text-indigo-600 w-12 h-12" strokeWidth={2.5} />
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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 pb-24">
      {/* 경기 시작 알림 배너 */}
      {myCurrentStatus === 'playing' && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl shadow-green-500/50 flex items-center gap-3 border-4 border-white">
            <span className="text-3xl">🎾</span>
            <div>
              <p className="font-black text-lg">경기 시작!</p>
              <p className="text-sm font-medium">코트로 이동해주세요</p>
            </div>
          </div>
        </div>
      )}
      
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200/60 mb-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 h-20 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-[0.875rem] flex items-center justify-center shadow-lg shadow-indigo-200/50">
              <BadmintonIcon className="text-white w-5 h-5" strokeWidth={2.5} />
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
          <div className="flex-1">
            {/* 알림 허용 버튼 - 모바일에서는 위에, 데스크탑에서는 제목 옆 */}
            <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
              {/* 모바일용: 버튼이 위에 */}
              <div className="md:hidden">
                {'Notification' in window && notificationPermission !== 'granted' && (
                  <button
                    onClick={handleRequestNotification}
                    className="w-full px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-200/50 transition-all flex items-center justify-center gap-2 animate-pulse"
                    title="경기 시작 알림 받기"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                    알림 허용
                  </button>
                )}
                
                {'Notification' in window && notificationPermission === 'granted' && (
                  <div className="w-full px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 text-xs font-bold rounded-xl border border-green-200 flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    알림 활성화
                  </div>
                )}
              </div>

              {/* 제목과 데스크탑용 버튼 */}
              <div className="flex items-center gap-4">
                <h2 className="text-3xl font-black bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent tracking-tight leading-tight">코트 현황</h2>
                
                {/* 데스크탑용: 제목 옆 */}
                <div className="hidden md:block">
                  {'Notification' in window && notificationPermission !== 'granted' && (
                    <button
                      onClick={handleRequestNotification}
                      className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-200/50 transition-all flex items-center gap-2 animate-pulse"
                      title="경기 시작 알림 받기"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      알림 허용
                    </button>
                  )}
                  
                  {'Notification' in window && notificationPermission === 'granted' && (
                    <div className="px-4 py-2 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 text-xs font-bold rounded-xl border border-green-200 flex items-center gap-2">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      알림 활성화
                    </div>
                  )}
                </div>
              </div>
            </div>
            <p className="text-slate-500 font-semibold flex items-center gap-2.5 text-base">
              <div className="relative flex h-3 w-3">
                <div className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></div>
                <div className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></div>
              </div>
              실시간으로 코트 상태를 확인하고 예약하세요.
            </p>
          </div>

          <div className="w-full md:w-auto">
            {session && (
              <div className="bg-white/80 backdrop-blur-sm border border-indigo-200/60 p-5 rounded-[1.75rem] flex items-center gap-4 shadow-lg shadow-indigo-100/50">
                <div className="w-14 h-14 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[1.25rem] flex items-center justify-center">
                  <Clock className="text-indigo-600 w-7 h-7" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">남은 이용 시간</p>
                  <p className="text-3xl font-mono font-black bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent leading-none">{timeLeft}</p>
                </div>
              </div>
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
                  </div>
                  <span className={`px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${
                    court.status === 'available'
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 border border-green-200/50'
                      : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 border border-amber-200/50'
                  }`}>
                    {court.status === 'available' ? '사용가능' : '사용중'}
                  </span>
                </div>

                <div className="space-y-5">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 rounded-[1.5rem] border border-slate-200/40">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-indigo-100 rounded-lg flex items-center justify-center">
                          <Users className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                        </div>
                        <span className="text-xs font-bold text-slate-600">대기팀 현황</span>
                      </div>
                    </div>
                    
                    {/* 대기팀 목록 */}
                    {court.waitingTeams && court.waitingTeams.length > 0 ? (
                      <div className="space-y-3">
                        {court.waitingTeams.map((team) => {
                          const isMyTeam = myReservedCourtId === court.id && myTeamNumber === team.teamNumber;
                          const statusColor = 
                            team.status === 'playing' ? 'bg-green-50 border-green-400' :
                            team.status === 'confirmed' ? 'bg-blue-50 border-blue-400' :
                            isMyTeam ? 'bg-indigo-50 border-indigo-300' : 'bg-white border-slate-200';
                          
                          const statusBadge = 
                            team.status === 'playing' ? '🎾 경기중' :
                            team.status === 'confirmed' ? '✅ 확정' : '';
                          
                          return (
                            <div 
                              key={team.teamNumber} 
                              className={`p-3 rounded-xl border-2 transition-all ${statusColor}`}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-indigo-600">대기 {team.teamNumber}</span>
                                  {statusBadge && (
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white">
                                      {statusBadge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs font-semibold text-slate-500">{team.members.length}/4명</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {team.members.map((nickname, idx) => (
                                  <span 
                                    key={idx} 
                                    className={`px-2 py-1 rounded-lg text-[10px] font-medium ${
                                      team.status === 'playing' ? 'bg-green-100 text-green-700' :
                                      team.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
                                      'bg-indigo-100 text-indigo-700'
                                    }`}
                                  >
                                    {nickname}
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-4">대기 중인 팀이 없습니다</p>
                    )}
                  </div>

                  {/* 경기 종료 버튼 (경기 중인 팀의 멤버에게만 표시) */}
                  {myReservedCourtId === court.id && court.waitingTeams?.find(t => t.teamNumber === myTeamNumber && t.status === 'playing') ? (
                    <button
                      onClick={() => handleEndGame(court.id)}
                      className="w-full py-4 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm rounded-[1.25rem] font-bold hover:from-green-700 hover:to-green-800 transition-all shadow-lg shadow-green-500/30 flex items-center justify-center gap-2 group/btn active:scale-[0.98]"
                    >
                      🏁 경기 종료
                      <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" strokeWidth={2.5} />
                    </button>
                  ) : myReservedCourtId === court.id ? (
                    <button
                      onClick={handleCancelReservation}
                      className="w-full py-4 bg-gradient-to-r from-rose-600 to-rose-700 text-white text-sm rounded-[1.25rem] font-bold hover:from-rose-700 hover:to-rose-800 transition-all shadow-lg shadow-rose-500/30 flex items-center justify-center gap-2 group/btn active:scale-[0.98]"
                    >
                      신청 취소 (대기 {myTeamNumber})
                      <ChevronRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {/* 대기팀 선택 버튼들 */}
                      <div className="grid grid-cols-2 gap-2">
                        {[1, 2, 3].map((teamNum) => {
                          const team = court.waitingTeams?.find(t => t.teamNumber === teamNum);
                          const isFull = team && team.members.length >= 4;
                          const nextAvailableTeam = court.waitingTeams?.length 
                            ? Math.max(...court.waitingTeams.map(t => t.teamNumber)) + 1 
                            : 1;
                          
                          return (
                            <button
                              key={teamNum}
                              onClick={() => handleReserve(court.id, teamNum)}
                              className={`py-3 px-4 text-xs rounded-xl font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                                isFull
                                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                  : !session || myReservedCourtId !== null
                                  ? 'bg-slate-300 text-slate-600'
                                  : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 shadow-indigo-200/50'
                              }`}
                              disabled={!session || myReservedCourtId !== null || isFull}
                            >
                              대기 {teamNum}
                              {team && <span className="text-[10px]">({team.members.length}/4)</span>}
                              {isFull && <span className="text-[10px]">마감</span>}
                            </button>
                          );
                        })}
                        
                        {/* 새 대기팀 생성 버튼 */}
                        <button
                          onClick={() => {
                            const nextTeam = court.waitingTeams?.length 
                              ? Math.max(...court.waitingTeams.map(t => t.teamNumber)) + 1 
                              : 1;
                            handleReserve(court.id, nextTeam);
                          }}
                          className="py-3 px-4 text-xs rounded-xl font-bold transition-all shadow-md bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 shadow-emerald-200/50 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 col-span-2"
                          disabled={!session || myReservedCourtId !== null}
                        >
                          + 새 대기팀 만들기
                        </button>
                      </div>
                      
                      {!session && (
                        <p className="text-xs text-slate-500 text-center">입장 후 신청 가능</p>
                      )}
                      {myReservedCourtId !== null && (
                        <p className="text-xs text-slate-500 text-center">다른 코트 대기 중</p>
                      )}
                    </div>
                  )}
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
                  <h4 className="font-bold text-slate-900 mb-2 text-base">QR 코드 스캔</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">입구의 QR 코드를 스캔하면 자동으로 게스트 계정이 생성되며 <span className="text-indigo-600 font-bold bg-indigo-50 px-1.5 py-0.5 rounded">2시간</span> 동안 이용 권한이 부여됩니다.</p>
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
                  <h4 className="font-bold text-slate-900 mb-2 text-base">자동 회원 생성</h4>
                  <p className="text-sm text-slate-600 leading-relaxed">QR 스캔 시 자동으로 임의의 게스트 계정이 생성되며, 브라우저에 저장되어 재방문 시 동일한 계정으로 이용 가능합니다.</p>
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

