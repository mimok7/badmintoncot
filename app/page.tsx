'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import {
  User,
  Clock,
  Users,
  Info,
  LogOut,
  ChevronRight,
  Settings,
  AlertTriangle,
  BellOff
} from 'lucide-react';
import {
  evaluateGeofence,
  GeofenceResult,
  GeofenceStadium,
  isValidStadiumLocation,
  MAX_ACCEPTABLE_ACCURACY_METERS,
} from '@/lib/geofence';

interface Member {
  id: string;
  member_number: number;
  nickname: string;
  club_name?: string;
}

interface Court {
  id: number;
  name: string;
  status: string;
  is_active?: boolean;
  current_users_count: number;
  current_playing_team: number | null;
  waitingMembers?: string[];
  waitingTeams?: {
    teamNumber: number;
    members: { nickname: string; clubName: string }[];
    status: 'waiting' | 'confirmed' | 'playing';
  }[];
}

interface Stadium extends GeofenceStadium {
  address: string;
}

interface EntrySession {
  id: string;
  expires_at: string;
  is_active: boolean;
}

interface LocationDiagnostic {
  distanceMeters: number;
  accuracyMeters: number;
  allowedMeters: number;
}

interface VerifiedLocation {
  stadium: Stadium;
  latitude: number;
  longitude: number;
  accuracy: number;
}

const MEMBER_TOKEN_STORAGE_KEY = 'badminton_member_access_token';

const HIGH_ACCURACY_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 20000,
  maximumAge: 0,
};

const FALLBACK_LOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 0,
};

async function requestFreshPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let bestPosition: GeolocationPosition | null = null;
    let lastError: GeolocationPositionError | null = null;
    let watchId: number | undefined;
    let settled = false;

    const finish = (position?: GeolocationPosition) => {
      if (settled) return;
      settled = true;
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
      window.clearTimeout(timeoutId);
      if (position || bestPosition) resolve(position ?? bestPosition!);
      else if (lastError) reject(lastError);
      else reject(new Error('위치 정보를 가져오지 못했습니다.'));
    };

    const handlePosition = (position: GeolocationPosition) => {
      if (!bestPosition || position.coords.accuracy < bestPosition.coords.accuracy) {
        bestPosition = position;
      }
      // 구장 판정 기준(100m) 안으로 들어온 샘플은 더 기다리지 않는다.
      if (position.coords.accuracy <= MAX_ACCEPTABLE_ACCURACY_METERS) finish(position);
    };

    const handleError = (error: GeolocationPositionError) => {
      lastError = error;
      if (error.code === error.PERMISSION_DENIED) finish();
    };

    const timeoutId = window.setTimeout(() => {
      if (bestPosition) {
        finish();
        return;
      }
      navigator.geolocation.getCurrentPosition(
        handlePosition,
        (error) => {
          lastError = error;
          finish();
        },
        FALLBACK_LOCATION_OPTIONS,
      );
    }, 30000);

    watchId = navigator.geolocation.watchPosition(handlePosition, handleError, HIGH_ACCURACY_OPTIONS);
    navigator.geolocation.getCurrentPosition(handlePosition, handleError, HIGH_ACCURACY_OPTIONS);
  });
}

function getLocationErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) {
    return '위치 권한이 차단되어 있습니다. 브라우저 또는 홈 화면 앱 설정에서 위치 권한을 허용해 주세요.';
  }
  if (error.code === error.TIMEOUT) {
    return '위치 확인 시간이 초과되었습니다. GPS와 Wi‑Fi를 켠 뒤 다시 시도해 주세요.';
  }
  return '현재 위치를 가져올 수 없습니다. GPS 또는 Wi‑Fi 연결을 확인해 주세요.';
}

const getClubColorClass = (clubName: string | undefined): string => {
  if (!clubName || clubName === '무소속') {
    return 'bg-slate-100 text-slate-700 border-slate-200/50';
  }
  
  let hash = 0;
  for (let i = 0; i < clubName.length; i++) {
    hash = clubName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const colors = [
    'bg-red-50 text-red-700 border-red-200/50',
    'bg-orange-50 text-orange-700 border-orange-200/50',
    'bg-amber-50 text-amber-700 border-amber-200/50',
    'bg-emerald-50 text-emerald-700 border-emerald-200/50',
    'bg-teal-50 text-teal-700 border-teal-200/50',
    'bg-sky-50 text-sky-700 border-sky-200/50',
    'bg-blue-50 text-blue-700 border-blue-200/50',
    'bg-indigo-50 text-indigo-700 border-indigo-200/50',
    'bg-violet-50 text-violet-700 border-violet-200/50',
    'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200/50',
    'bg-pink-50 text-pink-700 border-pink-200/50',
    'bg-rose-50 text-rose-700 border-rose-200/50'
  ];
  
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export default function Home() {
  const [member, setMember] = useState<Member | null>(null);
  const [nickname, setNickname] = useState('');
  const [courts, setCourts] = useState<Court[]>([]);
  const [session, setSession] = useState<EntrySession | null>(null);
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [myReservedCourtId, setMyReservedCourtId] = useState<number | null>(null);
  const [myTeamNumber, setMyTeamNumber] = useState<number | null>(null);
  const [myCurrentStatus, setMyCurrentStatus] = useState<'waiting' | 'confirmed' | 'playing' | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [courtCount, setCourtCount] = useState<number>(8);
  const [venueName, setVenueName] = useState<string>('배드민턴 코트');
  const [clubs, setClubs] = useState<string[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>('');
  const [stadiums, setStadiums] = useState<Stadium[]>([]);
  const [currentStadium, setCurrentStadium] = useState<Stadium | null>(null);
  const [selectedStadiumId, setSelectedStadiumId] = useState<number | null>(null);
  const [findingStadium, setFindingStadium] = useState<boolean>(true);
  const [isInsideGeofence, setIsInsideGeofence] = useState<boolean | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationDiagnostic, setLocationDiagnostic] = useState<LocationDiagnostic | null>(null);
  const [locationChecking, setLocationChecking] = useState(false);
  const currentStadiumIdRef = useRef<number | null>(null);
  const creatingSessionRef = useRef(false);
  const memberAccessTokenRef = useRef<string | null>(null);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  // 브라우저 알림 권한 요청 (최초 1회만 팝업)
  useEffect(() => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
      
      const askedBefore = localStorage.getItem('asked_notification_permission');
      if (Notification.permission === 'default' && !askedBefore) {
        localStorage.setItem('asked_notification_permission', 'true');
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

  const fetchClubs = async () => {
    if (!currentStadium) return;
    const stadiumId = currentStadium.id;
    try {
      const { data } = await supabase
        .from('clubs')
        .select('name')
        .eq('stadium_id', stadiumId)
        .order('name', { ascending: true });
      if (data && currentStadiumIdRef.current === stadiumId) {
        setClubs(data.map((c: any) => c.name));
      }
    } catch (error) {
      console.error('Error fetching clubs:', error);
    }
  };

  
  useEffect(() => {
    const fetchStadiums = async () => {
      try {
        const { data, error } = await supabase
          .from('stadiums')
          .select('id, name, address, latitude, longitude, radius_meter')
          .order('id', { ascending: true });
        if (error) throw error;

        const validStadiums = (data ?? [])
          .map((stadium) => ({
            id: Number(stadium.id),
            name: String(stadium.name ?? ''),
            address: String(stadium.address ?? ''),
            latitude: Number(stadium.latitude),
            longitude: Number(stadium.longitude),
            radius_meter: Number(stadium.radius_meter),
          }))
          .filter(isValidStadiumLocation);

        setStadiums(validStadiums);
        if (validStadiums.length === 0) {
          setLocationError('사용 가능한 구장 위치 정보가 없습니다. 관리자에게 문의해 주세요.');
          setFindingStadium(false);
        }
      } catch (err) {
        console.error('구장 위치 조회 실패:', err);
        setLocationError('구장 위치 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
        setFindingStadium(false);
      }
    };
    fetchStadiums();
    checkUser();

    // PWA Install prompt listener & iOS detection
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (!isStandalone) {
      if (isIosDevice) {
        const timer = setTimeout(() => {
          const dismissed = localStorage.getItem('pwa_install_dismissed');
          if (!dismissed) {
            setShowInstallBanner(true);
          }
        }, 3000);
        return () => clearTimeout(timer);
      }

      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        const dismissed = localStorage.getItem('pwa_install_dismissed');
        if (!dismissed) {
          setShowInstallBanner(true);
        }
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  useEffect(() => {
    if (!currentStadium) return;

    fetchClubs();
    fetchCourts();
    fetchSettings();

    const channel = supabase
      .channel('schema-db-changes-' + currentStadium.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'courts', filter: 'stadium_id=eq.' + currentStadium.id }, () => {
        fetchCourts();
        checkMyReservation();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: 'stadium_id=eq.' + currentStadium.id }, () => {
        fetchCourts();
        checkMyReservation();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stadium_settings', filter: 'stadium_id=eq.' + currentStadium.id }, () => {
        fetchSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStadium]);


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
          
          // 상태가 playing으로 변경되면 알림
          if (oldStatus !== 'playing' && newStatus === 'playing') {
            const courtId = payload.new.court_id;
            const teamNumber = payload.new.team_number;
            
            // 브라우저 알림
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('🎾 경기 시작!', {
                body: `코트 ${courtId} - 신청${teamNumber}팀 경기가 시작되었습니다!`,
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

  const applyGeofenceResult = useCallback((result: GeofenceResult) => {
    setLocationDiagnostic(result.distanceMeters === null || result.allowedMeters === null ? null : {
      distanceMeters: Math.round(result.distanceMeters),
      accuracyMeters: Math.round(result.accuracyMeters),
      allowedMeters: Math.round(result.allowedMeters),
    });

    if (result.status === 'inside' && result.stadium) {
      const matchedStadium = stadiums.find((stadium) => stadium.id === result.stadium?.id)
        ?? (result.stadium as Stadium);
      if (matchedStadium) {
        currentStadiumIdRef.current = matchedStadium.id;
        setSelectedStadiumId(matchedStadium.id);
        setCurrentStadium((previous) => previous?.id === matchedStadium.id ? previous : matchedStadium);
        setVenueName(matchedStadium.name);
        setIsInsideGeofence(true);
        setLocationError(null);
      }
    } else if (result.status === 'low-accuracy') {
      // 부정확한 위치를 구장 밖으로 오판정하지 않되 신청은 막습니다.
      setIsInsideGeofence(null);
      setLocationError(null);
    } else {
      // 정확한 위치가 구장 밖이면 선택 구장과 신청 가능한 코트를 즉시 해제합니다.
      currentStadiumIdRef.current = null;
      setCurrentStadium(null);
      setVenueName('배드민턴 코트');
      setCourts([]);
      setClubs([]);
      setIsInsideGeofence(false);
      if (result.status === 'unavailable') {
        setLocationError('구장 위치 또는 현재 위치 정보가 올바르지 않습니다.');
      } else {
        setLocationError(null);
      }
    }
    setFindingStadium(false);
  }, [stadiums]);

  // DB의 구장 좌표를 기준으로 접속 중 위치를 계속 판정합니다.
  useEffect(() => {
    if (stadiums.length === 0) return;
    if (!('geolocation' in navigator)) {
      setLocationError('이 브라우저는 위치 정보를 지원하지 않습니다.');
      setIsInsideGeofence(false);
      setFindingStadium(false);
      return;
    }

    let watchId: number | undefined;
    let hasLocation = false;

    const checkPosition = (position: GeolocationPosition) => {
      hasLocation = true;
      applyGeofenceResult(evaluateGeofence(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        stadiums,
      ));
    };

    const setFinalLocationError = (error: GeolocationPositionError) => {
      console.error('Geolocation error:', error);
      if (hasLocation) return;
      setLocationError(getLocationErrorMessage(error));
      setIsInsideGeofence(false);
      setFindingStadium(false);
    };

    const handleWatchError = async (error: GeolocationPositionError) => {
      if (hasLocation) return;
      console.error('실시간 위치 추적 실패:', error);
      try {
        checkPosition(await requestFreshPosition());
      } catch (fallbackError) {
        setFinalLocationError(fallbackError as GeolocationPositionError);
      }
    };

    requestFreshPosition().then(checkPosition).catch((error) => {
      setFinalLocationError(error as GeolocationPositionError);
    });
    watchId = navigator.geolocation.watchPosition(
      checkPosition,
      handleWatchError,
      HIGH_ACCURACY_OPTIONS,
    );

    return () => {
      if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
    };
  }, [applyGeofenceResult, stadiums]);

  const verifyCurrentStadiumLocation = async (stadiumId: number): Promise<VerifiedLocation | null> => {
    if (!('geolocation' in navigator)) {
      alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
      return null;
    }

    setLocationChecking(true);
    try {
      // 신청 시점마다 DB 원본 좌표를 다시 읽어 오래된 위치 설정 사용을 방지합니다.
      const { data, error } = await supabase
        .from('stadiums')
        .select('id, name, address, latitude, longitude, radius_meter')
        .eq('id', stadiumId)
        .single();
      if (error) throw error;

      const stadium: Stadium = {
        id: Number(data.id),
        name: String(data.name ?? ''),
        address: String(data.address ?? ''),
        latitude: Number(data.latitude),
        longitude: Number(data.longitude),
        radius_meter: Number(data.radius_meter),
      };
      if (!isValidStadiumLocation(stadium)) {
        setLocationError('구장 위치 설정이 올바르지 않습니다. 관리자에게 문의해 주세요.');
        alert('구장 위치 설정이 올바르지 않아 신청할 수 없습니다.');
        return null;
      }

      const position = await requestFreshPosition();
      const result = evaluateGeofence(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        [stadium],
      );
      setStadiums((previous) => previous.map((item) => item.id === stadium.id ? stadium : item));
      applyGeofenceResult(result);

      if (result.status === 'inside') {
        return {
          stadium,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
      }
      if (result.status === 'low-accuracy') {
        alert(`GPS 정확도가 낮아 신청할 수 없습니다. 잠시 후 다시 시도해 주세요. (현재 오차 ±${Math.round(result.accuracyMeters)}m)`);
      } else if (result.status === 'outside') {
        alert(`구장 밖에서는 신청할 수 없습니다. (구장까지 ${Math.round(result.distanceMeters ?? 0)}m / 허용 ${Math.round(result.allowedMeters ?? 0)}m)`);
      } else {
        alert('현재 위치를 확인할 수 없어 신청할 수 없습니다.');
      }
      return null;
    } catch (error) {
      const locationFailure = error as GeolocationPositionError;
      const message = typeof locationFailure?.code === 'number'
        ? getLocationErrorMessage(locationFailure)
        : '구장 위치 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.';
      setLocationError(message);
      alert(message);
      return null;
    } finally {
      setLocationChecking(false);
    }
  };

  const handleStadiumSelection = (stadiumId: number) => {
    const selected = stadiums.find((stadium) => stadium.id === stadiumId);
    if (!selected) return;
    setSelectedStadiumId(selected.id);
    setVenueName(selected.name);

    // 드롭다운 선택만으로 위치 인증을 우회하지 않는다. 이미 위치 인증된 경우에만 대상 구장을 변경한다.
    if (isInsideGeofence === true) {
      currentStadiumIdRef.current = selected.id;
      setCurrentStadium(selected);
    }
  };


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
    const savedNickname = localStorage.getItem('badminton_member_nickname');
    if (savedNickname) {
      setNickname(savedNickname);
    }
    const savedClub = localStorage.getItem('badminton_member_club_name');
    if (savedClub) {
      setSelectedClub(savedClub);
    }

    const savedMemberId = localStorage.getItem('badminton_member_id');
    const savedAccessToken = localStorage.getItem(MEMBER_TOKEN_STORAGE_KEY);
    if (savedMemberId && savedAccessToken) {
      const { data: memberData, error } = await supabase.rpc('get_member_profile', {
        p_member_id: savedMemberId,
        p_access_token: savedAccessToken,
      });

      if (!error && memberData) {
        memberAccessTokenRef.current = savedAccessToken;
        setMember(memberData);
        setNickname(memberData.nickname);
        setSelectedClub(memberData.club_name || '');
        localStorage.setItem('badminton_member_nickname', memberData.nickname);
        localStorage.setItem('badminton_member_club_name', memberData.club_name || '');
      } else {
        localStorage.removeItem('badminton_member_id');
        localStorage.removeItem(MEMBER_TOKEN_STORAGE_KEY);
      }
    } else if (savedMemberId || savedAccessToken) {
      localStorage.removeItem('badminton_member_id');
      localStorage.removeItem(MEMBER_TOKEN_STORAGE_KEY);
    }
    setLoading(false);
  };

  const checkMyReservation = async () => {
    if (!member) return;
    const stadiumId = currentStadiumIdRef.current;
    if (!stadiumId) {
      setMyReservedCourtId(null);
      setMyTeamNumber(null);
      setMyCurrentStatus(null);
      return;
    }
    
    const { data } = await supabase
      .from('reservations')
      .select('court_id, team_number, status')
      .eq('user_id', member.id)
      .eq('stadium_id', stadiumId)
      .maybeSingle();
    
    setMyReservedCourtId(data?.court_id ?? null);
    setMyTeamNumber(data?.team_number ?? null);
    setMyCurrentStatus(data?.status ?? null);
  };

  useEffect(() => {
    if (!member || !currentStadium || isInsideGeofence !== true) {
      setSession(null);
      return;
    }

    const stadiumId = currentStadium.id;
    const loadStadiumSession = async () => {
      if (creatingSessionRef.current) return;
      const accessToken = memberAccessTokenRef.current;
      if (!accessToken) return;
      creatingSessionRef.current = true;
      try {
        const position = await requestFreshPosition();
        const localResult = evaluateGeofence(
          position.coords.latitude,
          position.coords.longitude,
          position.coords.accuracy,
          [currentStadium],
        );
        if (localResult.status !== 'inside') return;

        const { data: createdSession, error: createError } = await supabase.rpc('enter_stadium_by_location', {
          p_member_id: member.id,
          p_access_token: accessToken,
          p_stadium_id: stadiumId,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_accuracy: position.coords.accuracy,
        });
        if (createError) throw createError;
        if (currentStadiumIdRef.current === stadiumId) setSession(createdSession);
      } catch (createError) {
        console.error('위치 기반 입장 세션 생성 실패:', createError);
      } finally {
        creatingSessionRef.current = false;
      }
    };

    loadStadiumSession();
    checkMyReservation();
  }, [member, currentStadium, isInsideGeofence]);

  const fetchCourts = async () => {
    if (!currentStadium) return;
    const stadiumId = currentStadium.id;
    const { data: courtsData } = await supabase.from('courts').select('*').eq('stadium_id', stadiumId).order('id', { ascending: true });
    const { data: resData } = await supabase
      .from('reservations')
      .select('court_id, user_id, team_number, status, confirmed_at, members(nickname, club_name)')
      .eq('stadium_id', stadiumId)
      .order('team_number', { ascending: true });

    if (courtsData && currentStadiumIdRef.current === stadiumId) {
      const updatedCourts = courtsData.map(court => {
        const courtReservations = resData?.filter(r => r.court_id === court.id) ?? [];
        
        // 팀별로 그룹핑 (상태 및 확정시점 포함)
        const teamsMap = new Map<number, {members: {nickname: string, clubName: string}[], status: string, confirmed_at: string | null}>();
        courtReservations.forEach(r => {
          const member = r.members as any;
          const nickname = member?.nickname || '알 수 없음';
          const clubName = member?.club_name || '';
          const teamNum = r.team_number || 1;
          const status = r.status || 'waiting';
          const confirmedAt = r.confirmed_at || null;
          
          if (!teamsMap.has(teamNum)) {
            teamsMap.set(teamNum, {members: [], status, confirmed_at: confirmedAt});
          }
          teamsMap.get(teamNum)!.members.push({nickname, clubName});

          if (confirmedAt && (!teamsMap.get(teamNum)!.confirmed_at || confirmedAt < (teamsMap.get(teamNum)!.confirmed_at as string))) {
            teamsMap.get(teamNum)!.confirmed_at = confirmedAt;
          }
        });
        
        // Map을 배열로 변환
        const waitingTeams = Array.from(teamsMap.entries())
          .map(([teamNumber, data]) => ({ 
            teamNumber, 
            members: data.members,
            status: data.status as 'waiting' | 'confirmed' | 'playing',
            confirmed_at: data.confirmed_at
          }))
          .sort((a, b) => {
            if (a.status === 'playing' && b.status !== 'playing') return -1;
            if (b.status === 'playing' && a.status !== 'playing') return 1;

            if (a.status === 'confirmed' && b.status !== 'confirmed') return -1;
            if (b.status === 'confirmed' && a.status !== 'confirmed') return 1;

            if (a.status === 'confirmed' && b.status === 'confirmed') {
              if (a.confirmed_at && b.confirmed_at) {
                return new Date(a.confirmed_at).getTime() - new Date(b.confirmed_at).getTime();
              }
              return a.teamNumber - b.teamNumber;
            }

            return a.teamNumber - b.teamNumber;
          });
        
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

  const fetchSettings = async () => {
    if (!currentStadium) return;
    const stadiumId = currentStadium.id;
    try {
      const { data } = await supabase
        .from('stadium_settings')
        .select('court_count')
        .eq('stadium_id', stadiumId)
        .maybeSingle();

      if (data && currentStadiumIdRef.current === stadiumId) {
        setVenueName(currentStadium.name);
        setCourtCount(Number(data.court_count ?? 8));
      }
    } catch (e) {
      // Ignore settings fetch error
    }
  };

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setShowInstallBanner(false);
  };

  const handleDismissBanner = () => {
    localStorage.setItem('pwa_install_dismissed', 'true');
    setShowInstallBanner(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || locationChecking) return;

    // 위치 기반 체크
    if (isInsideGeofence !== true || !currentStadium) {
      alert('구장 내에서만 입장(닉네임 등록)이 가능합니다. 위치 서비스를 승인하고 구장에 접근해 주세요.');
      return;
    }
    const verifiedLocation = await verifyCurrentStadiumLocation(currentStadium.id);
    if (!verifiedLocation) return;

    const { data, error } = await supabase.rpc('register_member_at_stadium', {
      p_nickname: nickname.trim(),
      p_club_name: selectedClub || null,
      p_stadium_id: verifiedLocation.stadium.id,
      p_latitude: verifiedLocation.latitude,
      p_longitude: verifiedLocation.longitude,
      p_accuracy: verifiedLocation.accuracy,
    });

    if (error) {
      alert('등록 중 오류가 발생했습니다.');
      return;
    }

    if (data?.member && data?.access_token && data?.session) {
      const registeredMember = data.member as Member;
      const accessToken = String(data.access_token);
      localStorage.setItem('badminton_member_id', registeredMember.id);
      localStorage.setItem(MEMBER_TOKEN_STORAGE_KEY, accessToken);
      localStorage.setItem('badminton_member_nickname', registeredMember.nickname);
      localStorage.setItem('badminton_member_club_name', registeredMember.club_name || '');
      memberAccessTokenRef.current = accessToken;
      setSession(data.session as EntrySession);
      setMember(registeredMember);
    }
  };

  const handleReserve = async (courtId: number, teamNumber: number) => {
    if (!member || !session) {
      alert('입장 처리가 필요합니다.');
      return;
    }
    if (locationChecking) return;
    if (isInsideGeofence !== true || !currentStadium) {
      alert('현재 구장 안에서만 코트 신청이 가능합니다.');
      return;
    }
    const verifiedLocation = await verifyCurrentStadiumLocation(currentStadium.id);
    if (!verifiedLocation) return;
    const accessToken = memberAccessTokenRef.current;
    if (!accessToken) {
      alert('회원 인증 정보가 없습니다. 다시 등록해 주세요.');
      return;
    }

    // 이미 예약이 있는지 확인
    if (myReservedCourtId !== null) {
      alert('이미 다른 코트에 신청 중입니다. 먼저 취소해주세요.');
      return;
    }

    // 클럽 정합성 검증 (같은 신청팀에 다른 클럽원이 신청하는 것 제한)
    const courtData = courts.find(c => c.id === courtId);
    const targetTeam = courtData?.waitingTeams?.find(t => t.teamNumber === teamNumber);
    if (targetTeam && targetTeam.members.length > 0) {
      const firstMemberClub = targetTeam.members[0].clubName;
      if (firstMemberClub && firstMemberClub !== member.club_name) {
        alert(`동일한 클럽 회원들끼리만 같은 팀에 신청할 수 있습니다.\n(이 팀의 소속 클럽: ${firstMemberClub || '무소속'})`);
        return;
      }
    }

    const { error } = await supabase.rpc('reserve_court_at_stadium', {
      p_member_id: member.id,
      p_access_token: accessToken,
      p_court_id: courtId,
      p_team_number: teamNumber,
      p_stadium_id: verifiedLocation.stadium.id,
      p_latitude: verifiedLocation.latitude,
      p_longitude: verifiedLocation.longitude,
      p_accuracy: verifiedLocation.accuracy,
    });

    if (error) {
      if (error.code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(error.message)) {
        alert('신청 기능이 현재 연결되지 않았습니다. 관리자에게 reserve_court_at_stadium RPC 복구 SQL 실행을 요청해 주세요.');
      } else if (error.code === '23505') {
        alert('이미 이 코트에 신청 중입니다.');
        // 예약 상태 다시 확인
        await checkMyReservation();
      } else if (error.message.includes('4명으로 마감')) {
        alert('해당 신청팀은 이미 4명으로 마감되었습니다. 다른 팀을 선택해주세요.');
      } else {
        alert(`예약 중 오류: ${error.message}`);
      }
    } else {
      alert(`신청${teamNumber}팀 신청이 완료되었습니다!`);
      setMyReservedCourtId(courtId);
      setMyTeamNumber(teamNumber);
      fetchCourts();
    }
  };

  const handleCancelReservation = async () => {
    if (!member || !myReservedCourtId) return;

    const confirmed = confirm('신청을 취소하시겠습니까?');
    if (!confirmed) return;
    const accessToken = memberAccessTokenRef.current;
    if (!accessToken) return;

    const { error } = await supabase.rpc('cancel_court_reservation', {
      p_member_id: member.id,
      p_access_token: accessToken,
      p_court_id: myReservedCourtId,
    });

    if (error) {
      alert('예약 취소 중 오류가 발생했습니다.');
    } else {
      alert('예약이 취소되었습니다.');
      setMyReservedCourtId(null);
      setMyTeamNumber(null);
      setMyCurrentStatus(null);
      fetchCourts();
    }
  };

  const handleEndGame = async (courtId: number) => {
    if (!member || !currentStadium) return;

    const confirmed = confirm('경기를 종료하시겠습니까?');
    if (!confirmed) return;

    try {
      const verifiedLocation = await verifyCurrentStadiumLocation(currentStadium.id);
      const accessToken = memberAccessTokenRef.current;
      if (!verifiedLocation || !accessToken) return;

      const { data, error } = await supabase.rpc('end_game_secure', {
        p_court_id: courtId,
        p_member_id: member.id,
        p_access_token: accessToken,
        p_stadium_id: verifiedLocation.stadium.id,
        p_latitude: verifiedLocation.latitude,
        p_longitude: verifiedLocation.longitude,
        p_accuracy: verifiedLocation.accuracy,
      });

      if (error) {
        alert('경기 종료 중 오류가 발생했습니다.');
        return;
      }

      if (data && data.success) {
        alert(data.message);
        setMyReservedCourtId(null);
        setMyTeamNumber(null);
        setMyCurrentStatus(null);
        fetchCourts();
      } else {
        alert(data?.message || '경기 종료에 실패했습니다.');
      }
    } catch (error) {
      alert('경기 종료 처리 중 오류가 발생했습니다.');
    }
  };

  if (loading || findingStadium) return (
    <div className="flex flex-col justify-center items-center h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30">
      <div className="relative">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200"></div>
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-t-indigo-600 border-r-transparent border-b-transparent border-l-transparent absolute top-0"></div>
      </div>
      <p className="text-slate-600 font-semibold mt-6 tracking-wide">시스템을 불러오는 중...</p>
    </div>
  );

  if (!member) {
    if (findingStadium) return null;
    // Show entry form directly to bypass QR scan requirement
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-3 relative">
        {/* 관리자 페이지 이동 버튼 */}
        <a
          href="/admin"
          className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white px-4 py-2 rounded-2xl text-xs font-bold transition-all backdrop-blur-md border border-white/10 active:scale-95 flex items-center gap-1.5 shadow-lg"
        >
          <Settings className="w-3.5 h-3.5" strokeWidth={2.5} />
          관리자
        </a>

        <div className="bg-white/95 backdrop-blur-xl p-5 rounded-3xl shadow-2xl w-full max-w-sm border border-white/60 text-center animate-fade-in">
          <div className="w-44 h-44 mb-5 mx-auto rounded-3xl overflow-hidden shadow-lg border border-slate-100/30">
            <img src="/logo.png" alt="BadmintonCot Logo" className="w-full h-full object-cover" />
          </div>
          <p className="text-2xl font-black text-indigo-600 tracking-tight mb-1">{venueName}</p>
          <>
            <div className="mb-3">
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
                  {locationError ? '위치 확인 실패' : '구장 외 접근 불가'}
                </span>
              )}
            </div>
          </>
          
          {/* 위치 및 알림 경고 안내문구 */}
          {stadiums.length > 1 && (
            <div className="bg-white border border-indigo-100 px-3.5 py-3 rounded-2xl mb-3 text-left shadow-sm">
              <label htmlFor="stadium-select" className="block text-[10px] font-bold text-slate-500 mb-1.5">
                📍 이용할 구장 선택
              </label>
              <select
                id="stadium-select"
                value={selectedStadiumId ?? currentStadium?.id ?? ''}
                onChange={(event) => handleStadiumSelection(Number(event.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 focus:border-indigo-500 focus:outline-none"
              >
                <option value="" disabled>구장을 선택하세요</option>
                {stadiums.map((stadium) => (
                  <option key={stadium.id} value={stadium.id}>{stadium.name}</option>
                ))}
              </select>
              {isInsideGeofence !== true && (
                <p className="mt-1.5 text-[10px] font-semibold text-slate-500">
                  구장 선택은 표시용이며, 입장과 신청은 선택한 구장 위치 안에서만 가능합니다.
                </p>
              )}
            </div>
          )}
          {(isInsideGeofence === false || isInsideGeofence === null) && (
            <div className="bg-rose-50 border border-rose-100 text-rose-700 px-3.5 py-3 rounded-2xl mb-3 text-[10px] font-bold text-left leading-normal flex items-start gap-1.5 shadow-sm">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-rose-500" />
              <span>
                {locationError || (isInsideGeofence === null
                  ? 'GPS 정확도를 개선하는 중입니다. 창가나 야외에서 잠시 기다려 주세요.'
                  : '구장 밖으로 확인되었습니다. 구장 내로 이동한 뒤 잠시 후 다시 확인해 주세요.')}
                {locationDiagnostic && !locationError && (
                  <span className="block mt-1 text-rose-500">
                    현재 거리 {locationDiagnostic.distanceMeters}m · GPS 오차 ±{locationDiagnostic.accuracyMeters}m · 허용 거리 {locationDiagnostic.allowedMeters}m
                  </span>
                )}
                {locationDiagnostic && locationDiagnostic.accuracyMeters > 1000 && (
                  <span className="block mt-1 text-rose-600">
                    컴퓨터 위치 서비스의 오차가 너무 큽니다. Windows 위치 서비스를 켜고 Wi‑Fi를 연결한 뒤 브라우저 위치 권한을 허용하고 다시 시도해 주세요.
                  </span>
                )}
              </span>
            </div>
          )}
          {notificationPermission !== 'granted' && (
            <div className="bg-amber-50 border border-amber-100 text-amber-800 px-3.5 py-3 rounded-2xl mb-3 text-[10px] font-bold text-left leading-normal flex items-start gap-1.5 shadow-sm">
              <BellOff className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-amber-600" />
              <span>알림 권한이 허용되지 않았습니다. 알림을 허용하지 않으면 본인의 대기 순서(입장 차례)를 실시간 알림으로 받지 못합니다.</span>
            </div>
          )}
          <h1 className="text-2xl font-black mb-1 bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent tracking-tight">
            입장 등록
          </h1>
          <p className="text-xs text-slate-500 mb-4 leading-normal">
            닉네임을 입력하고 코트 배정을 신청할 수 있습니다.
          </p>
          
          <form onSubmit={handleRegister} className="space-y-3 mb-4 text-left">
            <div>
              <label htmlFor="club" className="block text-[11px] font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">
                소속 클럽 선택
              </label>
              <select
                id="club"
                value={selectedClub}
                onChange={(e) => setSelectedClub(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none text-slate-800 font-semibold bg-slate-50/50 transition-all text-xs"
                required
              >
                <option value="">클럽을 선택하세요</option>
                {clubs.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label htmlFor="nickname" className="block text-[11px] font-bold text-slate-500 mb-1 ml-1 uppercase tracking-wider">
                사용할 닉네임
              </label>
              <input
                id="nickname"
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="닉네임을 입력하세요"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 focus:border-indigo-500 focus:outline-none text-slate-800 font-semibold placeholder:text-slate-400 bg-slate-50/50 transition-all text-xs"
                maxLength={20}
                required
              />
            </div>
            <button
              type="submit"
              disabled={isInsideGeofence !== true || locationChecking}
              className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-lg active:scale-[0.98] ${
                isInsideGeofence !== true || locationChecking
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800'
              }`}
            >
              {locationChecking ? '위치 재확인 중...' : '닉네임 등록하고 입장하기'}
            </button>
          </form>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-4 text-slate-400 text-[11px] font-bold uppercase tracking-wider">안내</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          <div className="mt-2 text-left">
            <p className="text-[11px] font-bold text-indigo-900 mb-1 flex items-center gap-1.5 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
              <span>📱 자동 로그인 지원</span>
            </p>
            <p className="text-[11px] text-slate-500 leading-normal pl-1">
              이전에 사용하셨던 닉네임은 자동으로 입력창에 복원됩니다. 등록 완료 후 바로 신청을 이용하실 수 있습니다.
            </p>
          </div>
        </div>

        {/* PWA Install Banner */}
        {showInstallBanner && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-sm px-4">
            <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg overflow-hidden shadow-md flex-shrink-0 border border-slate-800">
                  <img src="/logo.png" alt="BadmintonCot Logo" className="w-full h-full object-cover" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-black text-white">앱으로 더 편리하게 이용하세요!</p>
                  <p className="text-[11px] text-slate-400 font-semibold leading-tight">
                    {isIOS ? '공유 버튼 클릭 후 "홈 화면에 추가"' : '홈 화면에 바로가기 추가'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isIOS && (
                  <button
                    onClick={handleInstallPWA}
                    className="px-3 py-1.5 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold rounded-lg shadow-lg active:scale-95 transition-all"
                  >
                    설치
                  </button>
                )}
                <button
                  onClick={handleDismissBanner}
                  className="p-1 text-slate-500 hover:text-slate-300 rounded-lg transition-all"
                  title="닫기"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/20 pb-6">
      {/* 위치 및 알림 제한 안내 경고 */}
      {(isInsideGeofence === false || isInsideGeofence === null) && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className="bg-rose-50 border border-rose-100 text-rose-700 px-4 py-3 rounded-2xl text-xs font-semibold text-left leading-normal flex items-start gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{locationError || (isInsideGeofence === null
              ? 'GPS 정확도를 확인하는 중입니다. 정확한 위치가 확인될 때까지 신청할 수 없습니다.'
              : '구장 밖으로 확인되어 신청할 수 없습니다. 구장 안으로 이동해 주세요.')}</span>
          </div>
        </div>
      )}
      {notificationPermission !== 'granted' && (
        <div className="max-w-7xl mx-auto px-4 mt-3">
          <div className="bg-amber-50 border border-amber-100 text-amber-800 px-4 py-3 rounded-2xl text-xs font-semibold text-left leading-normal flex items-start gap-2 shadow-sm">
            <BellOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>알림 권한이 비활성화 상태입니다. 알림을 허용하지 않으면 본인의 게임 대기 순서(입장 차례) 알림을 실시간으로 받지 못합니다.</span>
          </div>
        </div>
      )}
      {/* 경기 시작 알림 배너 */}
      {myCurrentStatus === 'playing' && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-6 py-3 rounded-2xl shadow-xl shadow-green-500/50 flex items-center gap-3 border-4 border-white">
            <span className="text-2xl">🎾</span>
            <div>
              <p className="font-black text-base">경기 시작!</p>
              <p className="text-xs font-medium">코트로 이동해주세요</p>
            </div>
          </div>
        </div>
      )}
      
      <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-lg border-b border-slate-200/60 mb-3 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-12 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-[0.5rem] overflow-hidden shadow-md border border-slate-100">
              <img src="/logo.png" alt="BadmintonCot Logo" className="w-full h-full object-cover" />
            </div>
            <h1 className="max-w-[150px] truncate text-base font-black bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent tracking-tight" title={venueName}>
              {venueName || '배드민턴 코트'}
            </h1>
          </div>
          <div className="flex items-center gap-1.5">
            {/* 로그인 후 실시간 클럽 변경 셀렉트 박스 */}
            <select
              value={selectedClub}
              onChange={async (e) => {
                const newClub = e.target.value;
                if (!newClub) return;
                try {
                  const accessToken = memberAccessTokenRef.current;
                  if (!accessToken) throw new Error('회원 인증 정보가 없습니다.');
                  const { error } = await supabase.rpc('update_member_club', {
                    p_member_id: member.id,
                    p_access_token: accessToken,
                    p_club_name: newClub,
                  });
                  if (error) {
                    alert('클럽 변경에 실패했습니다.');
                  } else {
                    setSelectedClub(newClub);
                    localStorage.setItem('badminton_member_club_name', newClub);
                    setMember({ ...member, club_name: newClub });
                  }
                } catch (err) {
                  console.error(err);
                }
              }}
              className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-[11px] font-bold outline-none cursor-pointer focus:ring-1 focus:ring-amber-400 transition-all max-w-[85px] md:max-w-[120px] truncate"
            >
              <option value="">클럽선택</option>
              {clubs.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <div className="flex items-center gap-2 bg-slate-50/80 px-2 py-1 rounded-xl border border-slate-200/50">
              <div className="w-6 h-6 bg-indigo-100 rounded-lg flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-indigo-600" strokeWidth={2.5} />
              </div>
              <div className="text-right">
                <p className="text-xs font-bold text-slate-900 leading-none">{member.nickname}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-0.5">#{member.member_number}</p>
              </div>
            </div>
            <button
              onClick={() => {
                localStorage.removeItem('badminton_member_id');
                localStorage.removeItem(MEMBER_TOKEN_STORAGE_KEY);
                localStorage.removeItem('badminton_member_nickname');
                localStorage.removeItem('badminton_member_club_name');
                window.location.reload();
              }}
              className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-3 gap-2">
          <div className="flex-1 text-left">
            {/* 알림 허용 버튼 - 모바일에서는 위에, 데스크탑에서는 제목 옆 */}
            <div className="flex flex-col md:flex-row md:items-center gap-2 mb-1 items-start">
              {/* 모바일용: 버튼이 위에 */}
              <div className="md:hidden">
                {'Notification' in window && notificationPermission !== 'granted' && (
                  <button
                    onClick={handleRequestNotification}
                    className="w-full px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[11px] font-bold rounded-lg shadow-lg shadow-amber-200/50 transition-all flex items-center justify-center gap-1.5 animate-pulse"
                    title="경기 시작 알림 받기"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                    알림 허용
                  </button>
                )}
                
                {'Notification' in window && notificationPermission === 'granted' && (
                  <div className="w-full px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 text-[11px] font-bold rounded-lg border border-green-200 flex items-center justify-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                    </svg>
                    알림 활성화
                  </div>
                )}
              </div>

              {/* 제목과 데스크탑용 버튼 */}
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 bg-clip-text text-transparent tracking-tight leading-none">코트 현황</h2>
                
                {/* 데스크탑용: 제목 옆 */}
                <div className="hidden md:block">
                  {'Notification' in window && notificationPermission !== 'granted' && (
                    <button
                      onClick={handleRequestNotification}
                      className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-[11px] font-bold rounded-lg shadow-lg shadow-amber-200/50 transition-all flex items-center gap-1.5 animate-pulse"
                      title="경기 시작 알림 받기"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      알림 허용
                    </button>
                  )}
                  
                  {'Notification' in window && notificationPermission === 'granted' && (
                    <div className="px-3 py-1.5 bg-gradient-to-r from-green-50 to-emerald-50 text-green-700 text-[11px] font-bold rounded-lg border border-green-200 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
                      </svg>
                      알림 활성화
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="text-slate-500 font-semibold flex items-center gap-1 text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              실시간으로 코트 상태를 확인하고 예약하세요.
            </div>

            {/* 노란색 안내문구 추가 */}
            <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-bold text-amber-900 leading-relaxed max-w-sm text-left flex items-start gap-1.5 shadow-sm">
              <span className="text-sm leading-none">⚠️</span>
              <div>
                <p>선수 4명이 같은 팀에 신청하세요.</p>
                <p className="mt-0.5 text-amber-700 font-semibold">모르는 사람이 신청한 팀에는 신청하지 마세요 ^^</p>
                <p className="mt-0.5 text-amber-600 font-medium">클럽을 변경하고자 하면 위쪽에서 변경하고 신청하세요 ^^</p>
              </div>
            </div>
          </div>

          <div className="w-full md:w-auto">
            {session && (
              <div className="bg-white/80 backdrop-blur-sm border border-indigo-200/60 p-2.5 rounded-2xl flex items-center gap-3 shadow-md shadow-indigo-100/30">
                <div className="w-8 h-8 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg flex items-center justify-center">
                  <Clock className="text-indigo-600 w-4 h-4" strokeWidth={2.5} />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none">남은 이용 시간</p>
                  <p className="text-lg font-mono font-black bg-gradient-to-r from-indigo-600 to-indigo-700 bg-clip-text text-transparent leading-none mt-1">{timeLeft}</p>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {courts.slice(0, courtCount).map((court) => (
            <div
              key={court.id}
              className="group bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 p-3.5 shadow-sm hover:shadow-lg transition-all duration-300 relative overflow-hidden"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/0 via-transparent to-slate-50/0 group-hover:from-indigo-50/20 group-hover:to-slate-50/10 transition-all duration-300 pointer-events-none"></div>

              <div className="relative z-10">
                <div className="flex justify-between items-center mb-2.5">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">{court.name}</h3>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider shadow-sm ${
                    court.status === 'available'
                      ? 'bg-gradient-to-r from-green-50 to-emerald-50 text-green-600 border border-green-200/50'
                      : court.status === 'occupied'
                      ? 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-600 border border-amber-200/50'
                      : court.status === 'lesson'
                      ? 'bg-gradient-to-r from-rose-50 to-red-50 text-rose-600 border border-rose-200/50'
                      : court.status === 'beginner'
                      ? 'bg-gradient-to-r from-violet-50 to-purple-50 text-violet-600 border border-violet-200/50'
                      : court.status === 'reservation_only'
                      ? 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-600 border border-blue-200/50'
                      : 'bg-gradient-to-r from-slate-100 to-slate-200 text-slate-600 border border-slate-300/50'
                  }`}>
                    {court.status === 'available' ? '사용가능' :
                     court.status === 'occupied' ? '사용중' :
                     court.status === 'lesson' ? '레슨중' :
                     court.status === 'beginner' ? '초보연습' :
                     court.status === 'reservation_only' ? '예약 전용' : '수리중'}
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 p-2.5 rounded-xl border border-slate-200/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-indigo-100 rounded flex items-center justify-center">
                          <Users className="w-3 h-3 text-indigo-600" strokeWidth={2.5} />
                        </div>
                        <span className="text-[11px] font-bold text-slate-600">대기팀 현황</span>
                      </div>
                    </div>
                    
                    {/* 대기팀 목록 */}
                    {court.waitingTeams && court.waitingTeams.filter(t => t.status !== 'playing').length > 0 ? (
                      <div className="space-y-1.5">
                        {court.waitingTeams.filter(t => t.status !== 'playing').map((team) => {
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
                              className={`p-1.5 rounded-lg border transition-all ${statusColor}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] font-bold text-indigo-600">대기 {team.teamNumber}</span>
                                  {statusBadge && (
                                    <span className="text-[10px] font-bold px-1 py-0.5 rounded-full bg-white">
                                      {statusBadge}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-semibold text-slate-500">{team.members.length}/4명</span>
                              </div>
                              <div className="flex flex-wrap gap-1">
                                {team.members.map((m, idx) => (
                                  <span 
                                    key={idx} 
                                    className={`px-1.5 py-0.5 rounded text-xs font-medium border ${getClubColorClass(m.clubName)}`}
                                  >
                                    {m.nickname} <span className="opacity-75 text-[11px] font-normal">({m.clubName || '무소속'})</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 text-center py-2">신청된 팀이 없습니다</p>
                    )}
                  </div>

                  {/* 경기 종료 버튼 (경기 중인 팀의 멤버에게만 표시) */}
                  {myReservedCourtId === court.id && court.waitingTeams?.find(t => t.teamNumber === myTeamNumber && t.status === 'playing') ? (
                    <button
                      onClick={() => handleEndGame(court.id)}
                      className="w-full py-2 bg-gradient-to-r from-green-600 to-green-700 text-white text-xs rounded-xl font-bold hover:from-green-700 hover:to-green-800 transition-all shadow-md flex items-center justify-center gap-1.5 group/btn active:scale-[0.98]"
                    >
                      🏁 경기 종료
                      <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" strokeWidth={2.5} />
                    </button>
                  ) : myReservedCourtId === court.id ? (
                    <button
                      onClick={handleCancelReservation}
                      className="w-full py-2 bg-gradient-to-r from-rose-600 to-rose-700 text-white text-xs rounded-xl font-bold hover:from-rose-700 hover:to-rose-800 transition-all shadow-md flex items-center justify-center gap-1.5 group/btn active:scale-[0.98]"
                    >
                      신청 취소 (신청 {myTeamNumber})
                      <ChevronRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 transition-transform" strokeWidth={2.5} />
                    </button>
                  ) : (
                    <div className="space-y-1.5">
                      {/* 대기팀 선택 버튼들 */}
                      <div className="grid grid-cols-2 gap-1.5">
                        {(() => {
                          const currentPlaying = court.current_playing_team || 0;
                          const nextTeams = [currentPlaying + 1, currentPlaying + 2, currentPlaying + 3, currentPlaying + 4];
                          return nextTeams.map((teamNum) => {
                            const team = court.waitingTeams?.find(t => t.teamNumber === teamNum);
                            const isFull = team && team.members.length >= 4;
                            // 클럽 정합성 비활성화 검증
                            const isDifferentClub = (() => {
                              if (!member || !team || !team.members || team.members.length === 0) return false;
                              const firstMemberClub = team.members[0].clubName;
                              return firstMemberClub ? firstMemberClub !== member.club_name : false;
                            })();
                            
                            return (
                              <button
                                key={teamNum}
                                onClick={() => handleReserve(court.id, teamNum)}
                                className={`py-2 px-2 text-[11px] rounded-lg font-bold transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 ${
                                  isFull || court.is_active === false || ['occupied', 'lesson', 'beginner', 'reservation_only', 'maintenance'].includes(court.status)
                                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                                    : isDifferentClub
                                    ? 'bg-slate-100 text-slate-400 border border-slate-200/50 cursor-not-allowed'
                                    : !session || myReservedCourtId !== null
                                    ? 'bg-slate-300 text-slate-600'
                                    : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800'
                                }`}
                                disabled={isInsideGeofence !== true || locationChecking || !session || myReservedCourtId !== null || isFull || court.is_active === false || ['occupied', 'lesson', 'beginner', 'reservation_only', 'maintenance'].includes(court.status) || isDifferentClub}
                              >
                                {locationChecking ? '위치 확인' : isDifferentClub ? '클럽다름' : `신청 ${teamNum}`}
                                {team && <span className="text-[10px]">({team.members.length}/4)</span>}
                                {isFull && <span className="text-[10px]">마감</span>}
                              </button>
                            );
                          });
                        })()}
                      </div>
                      
                      {(court.is_active === false || ['occupied', 'lesson', 'beginner', 'reservation_only', 'maintenance'].includes(court.status)) && (
                        <p className="text-[10px] text-rose-500 text-center font-bold">
                          {court.is_active === false ? '⛔ 사용 중지된 코트 (예약 불가)' :
                           court.status === 'occupied' ? '🏸 사용 중인 코트 (예약 불가)' :
                           court.status === 'lesson' ? '🎾 레슨 중 (예약 불가)' :
                           court.status === 'beginner' ? '🐣 초보자 연습 중 (예약 불가)' :
                           court.status === 'reservation_only' ? '🎟️ 예약 전용 코트 (일반 신청 불가)' :
                           '🛠️ 코트 수리 중 (예약 불가)'}
                        </p>
                      )}
                      {!['lesson', 'beginner', 'maintenance'].includes(court.status) && !session && (
                        <p className="text-[10px] text-slate-500 text-center">입장 후 신청 가능</p>
                      )}
                      {!['lesson', 'beginner', 'maintenance'].includes(court.status) && session && myReservedCourtId !== null && (
                        <p className="text-[10px] text-slate-500 text-center">다른 코트 신청 중</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-8 p-5 bg-gradient-to-br from-white via-white to-indigo-50/30 rounded-2xl border border-slate-200/60 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-6 opacity-[0.02] pointer-events-none">
            <Info className="w-48 h-48 text-indigo-600" />
          </div>

          <h3 className="text-xl font-black mb-4 text-slate-900 flex items-center gap-3 relative z-10">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-100 to-indigo-200 rounded-lg flex items-center justify-center shadow-sm">
              <Info className="text-indigo-600 w-4 h-4" strokeWidth={2.5} />
            </div>
            이용 안내 및 규칙
          </h3>

          <div className="grid md:grid-cols-2 gap-x-8 gap-y-4 relative z-10">
            <div className="space-y-4">
              <div className="flex gap-3 group">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs shadow-sm">01</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1 text-sm">닉네임 등록 및 입장</h4>
                  <p className="text-xs text-slate-600 leading-normal">사용할 닉네임을 입력하고 입장하시면 자동으로 2시간 동안의 코트 신청 및 경기 이용 권한이 부여됩니다.</p>
                </div>
              </div>
              <div className="flex gap-3 group">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs shadow-sm">02</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1 text-sm">4인 매칭 시스템</h4>
                  <p className="text-xs text-slate-600 leading-normal">모든 코트는 <span className="text-indigo-600 font-bold bg-indigo-50 px-1 py-0.5 rounded">4명이 모여야</span> 신청이 확정되며, 인원이 채워지면 즉시 경기를 시작할 수 있습니다.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-3 group">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs shadow-sm">03</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1 text-sm">자동 회원 생성</h4>
                  <p className="text-xs text-slate-600 leading-normal">닉네임 등록 시 자동으로 임의의 게스트 계정이 생성되며, 브라우저에 저장되어 재방문 시 동일한 계정으로 이용 가능합니다.</p>
                </div>
              </div>
              <div className="flex gap-3 group">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-black text-xs shadow-sm">04</div>
                <div>
                  <h4 className="font-bold text-slate-900 mb-1 text-sm">이용 시간 만료</h4>
                  <p className="text-xs text-slate-600 leading-normal">이용 시간 종료 후에는 신청이 불가능하며, 현재 신청 중인 목록에서도 자동으로 제외됩니다.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PWA Install Banner */}
      {showInstallBanner && (
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-[100] w-full max-w-md px-4 transition-all duration-500 ease-out">
          <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 p-5 rounded-3xl shadow-2xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md flex-shrink-0 border border-slate-800">
                <img src="/logo.png" alt="BadmintonCot Logo" className="w-full h-full object-cover" />
              </div>
              <div className="text-left">
                <p className="text-sm font-black text-white">앱으로 더 편리하게 이용하세요!</p>
                <p className="text-xs text-slate-400 font-semibold leading-tight">
                  {isIOS ? '공유 버튼 클릭 후 "홈 화면에 추가"' : '홈 화면에 바로가기 추가'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isIOS && (
                <button
                  onClick={handleInstallPWA}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                >
                  설치
                </button>
              )}
              <button
                onClick={handleDismissBanner}
                className="p-2 text-slate-500 hover:text-slate-300 rounded-xl transition-all"
                title="닫기"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

