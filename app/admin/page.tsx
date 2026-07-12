'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode.react';
import { supabase } from '@/lib/supabase';
import {
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
    Printer,
    LogOut
} from 'lucide-react';
import { BadmintonIcon } from '../components/BadmintonIcon';

type MenuType = 'qr' | 'courts' | 'usage' | 'settings' | 'clubs' | 'managers';

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
    courtCount: number;
    durationMinutes: number;
    useGeofence: boolean;
    locationLat: number;
    locationLng: number;
    locationRadius: number;
}

export default function AdminPage() {
    const router = useRouter();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [userEmail, setUserEmail] = useState('');
    const [tempCourtStatuses, setTempCourtStatuses] = useState<{ [key: number]: string }>({});
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
        rules: '• 코트 이용 시간은 2시간으로 제한됩니다.\n• 4명이 모여야 코트 사용이 가능합니다.\n• 안전을 위해 운동화를 착용해주세요.\n• 코트 내 음식물 반입을 금지합니다.',
        courtCount: 8,
        durationMinutes: 120,
        useGeofence: false,
        locationLat: 37.5665,
        locationLng: 126.9780,
        locationRadius: 100
    });
    const [clubs, setClubs] = useState<any[]>([]);
    const [newClubName, setNewClubName] = useState<string>('');
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [newAdminPassword, setNewAdminPassword] = useState('');
    const [mapLoaded, setMapLoaded] = useState(false);
    const [stadiums, setStadiums] = useState<any[]>([]);
    const [currentStadiumId, setCurrentStadiumId] = useState<number | null>(null);
    const [adminRole, setAdminRole] = useState<'superadmin' | 'manager' | null>(null);
    const [adminStadiumId, setAdminStadiumId] = useState<number | null>(null);
    const [adminUsers, setAdminUsers] = useState<any[]>([]);
    const [newAdminRole, setNewAdminRole] = useState<'superadmin' | 'manager'>('manager');
    const [newAdminTargetStadium, setNewAdminTargetStadium] = useState<number | null>(null);

    // States for adding new stadiums
    const [isAddStadiumOpen, setIsAddStadiumOpen] = useState(false);
    const [newStadiumName, setNewStadiumName] = useState('');
    const [newStadiumAddress, setNewStadiumAddress] = useState('');
    const [newStadiumLat, setNewStadiumLat] = useState(37.5665);
    const [newStadiumLng, setNewStadiumLng] = useState(126.9780);
    const [newStadiumRadius, setNewStadiumRadius] = useState(100);

    // 인증 체크
    useEffect(() => {
        checkAuth();

        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) {
                router.push('/admin/login');
            } else if (event === 'SIGNED_IN' && session) {
                setIsAuthenticated(true);
                setUserEmail(session.user.email || '');
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [router]);

    

    
    const fetchAdminUsers = async () => {
        if (adminRole !== 'superadmin') return;
        const { data } = await supabase.from('admin_users').select('*, stadiums(name)').order('id', { ascending: true });
        if (data) setAdminUsers(data);
    };

    useEffect(() => {
        if (isAuthenticated && adminRole === 'superadmin' && activeMenu === 'managers') {
            fetchAdminUsers();
        }
    }, [isAuthenticated, adminRole, activeMenu]);

    const handleAddAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminEmail) return;
        
        try {
            const { error } = await supabase.from('admin_users').insert({
                email: newAdminEmail,
                role: newAdminRole,
                stadium_id: newAdminRole === 'manager' ? newAdminTargetStadium : null
            });
            if (error) throw error;
            alert('관리자가 추가되었습니다.');
            setNewAdminEmail('');
            fetchAdminUsers();
        } catch (err: any) {
            alert('오류가 발생했습니다: ' + err.message);
        }
    };

    const handleDeleteAdmin = async (id: number) => {
        if (!confirm('정말 삭제하시겠습니까?')) return;
        await supabase.from('admin_users').delete().eq('id', id);
        fetchAdminUsers();
    };

    const fetchStadiumsList = async () => {
        const { data: stData } = await supabase
            .from('stadiums')
            .select('*')
            .order('id', { ascending: true });
        if (stData) {
            setStadiums(stData);
        }
    };

    const handleCreateStadium = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newStadiumName.trim()) {
            alert('구장 이름을 입력해주세요.');
            return;
        }

        try {
            // 1. Add stadium
            const { data: newStadium, error: stadiumError } = await supabase
                .from('stadiums')
                .insert({
                    name: newStadiumName.trim(),
                    address: newStadiumAddress.trim() || '주소 미지정',
                    latitude: newStadiumLat,
                    longitude: newStadiumLng,
                    radius_meter: newStadiumRadius
                })
                .select()
                .single();

            if (stadiumError) throw stadiumError;

            // 2. Create default settings for the new stadium
            const rulesText = '• 코트 이용 시간은 2시간으로 제한됩니다.\n• 4명이 모여야 코트 사용이 가능합니다.\n• 안전을 위해 운동화를 착용해주세요.\n• 코트 내 음식물 반입을 금지합니다.';
            const rulesWithMetadata = `${rulesText}\n\n[court_count:8][duration_minutes:120][use_geofence:false][location_lat:${newStadiumLat}][location_lng:${newStadiumLng}][location_radius:${newStadiumRadius}]`;
            
            const { error: settingsError } = await supabase
                .from('settings')
                .insert({
                    stadium_id: newStadium.id,
                    venue_name: newStadiumName.trim(),
                    operating_hours: '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
                    contact_info: '전화번호 미등록',
                    rules: rulesWithMetadata,
                    court_count: 8,
                    duration_minutes: 120,
                    use_geofence: false,
                    location_lat: newStadiumLat,
                    location_lng: newStadiumLng,
                    location_radius: newStadiumRadius
                });

            if (settingsError) throw settingsError;

            // 3. Create 8 default courts for the new stadium
            const defaultCourts = [];
            for (let i = 1; i <= 8; i++) {
                defaultCourts.push({
                    stadium_id: newStadium.id,
                    name: `코트 ${i}`,
                    status: 'available'
                });
            }
            const { error: courtsError } = await supabase.from('courts').insert(defaultCourts);
            if (courtsError) throw courtsError;

            alert(`새 구장 '${newStadiumName}'이(가) 추가되었습니다. 8개 코트와 기본 설정이 완료되었습니다.`);
            
            setNewStadiumName('');
            setNewStadiumAddress('');
            setNewStadiumLat(37.5665);
            setNewStadiumLng(126.9780);
            setNewStadiumRadius(100);
            setIsAddStadiumOpen(false);
            
            await fetchStadiumsList();
        } catch (err: any) {
            alert('구장 추가 중 오류가 발생했습니다: ' + err.message);
        }
    };

    const checkAuth = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            
            if (!session) {
                router.push('/admin/login');
                return;
            }

            const email = session.user.email || '';
            setUserEmail(email);

            const { data: adminUser } = await supabase.from('admin_users').select('*').eq('email', email).maybeSingle();
            
            let currentRole: 'superadmin' | 'manager' = 'superadmin';
            let currentAdminStadiumId: number | null = null;

            if (!adminUser) {
                const { count } = await supabase.from('admin_users').select('*', { count: 'exact', head: true });
                if (count === 0) {
                    await supabase.from('admin_users').insert({ email, role: 'superadmin' });
                    setAdminRole('superadmin');
                } else {
                    alert('승인되지 않은 관리자 계정입니다. 최고 관리자에게 문의하세요.');
                    await supabase.auth.signOut();
                    router.push('/admin/login');
                    return;
                }
            } else {
                currentRole = adminUser.role;
                currentAdminStadiumId = adminUser.stadium_id;
                setAdminRole(currentRole);
                if (currentRole === 'manager' && currentAdminStadiumId) {
                    setAdminStadiumId(currentAdminStadiumId);
                }
            }

            // Fetch Stadiums based on role
            let query = supabase.from('stadiums').select('*').order('id', { ascending: true });
            if (currentRole === 'manager' && currentAdminStadiumId) {
                query = query.eq('id', currentAdminStadiumId);
            }
            const { data: stData } = await query;
            if (stData && stData.length > 0) {
                setStadiums(stData);
                setCurrentStadiumId(currentRole === 'manager' && currentAdminStadiumId ? currentAdminStadiumId : stData[0].id);
            }

            setIsAuthenticated(true);
        } catch (error) {
            router.push('/admin/login');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            router.push('/admin/login');
        } catch (error) {
            // 로그아웃 오류 무시
        }
    };

    const handleSaveSettings = async () => {
        try {
            // Sync courts in DB based on configuration
            const targetCount = settings.courtCount;
            const currentCourtsCount = courts.length;

            if (targetCount > currentCourtsCount) {
                const newCourts = [];
                for (let i = currentCourtsCount + 1; i <= targetCount; i++) {
                    newCourts.push({
                        name: `코트 ${i}`,
                        status: 'available'
                    });
                }

                const { error: insertError } = await supabase
                    .from('courts')
                    .insert(newCourts.map(c => ({...c, stadium_id: currentStadiumId})));

                if (insertError) {
                    console.error('Failed to add courts:', insertError);
                    alert(`코트 추가 생성 중 권한 오류가 발생했습니다.\nSupabase SQL Editor에서 아래 SQL을 실행해 주세요:\n\nCREATE POLICY "Enable insert for authenticated users" ON courts FOR INSERT TO authenticated WITH CHECK (true);`);
                    return;
                }
            }

            // Save individual court statuses
            const updatePromises = Object.entries(tempCourtStatuses).map(([courtId, status]) => {
                return supabase
                    .from('courts')
                    .update({ status })
                    .eq('id', parseInt(courtId, 10));
            });
            await Promise.all(updatePromises);

            // Append court_count & duration_minutes & geofence info hidden metadata to rules text
            const rulesWithMetadata = `${settings.rules}\n\n[court_count:${settings.courtCount}][duration_minutes:${settings.durationMinutes || 120}][use_geofence:${settings.useGeofence}][location_lat:${settings.locationLat}][location_lng:${settings.locationLng}][location_radius:${settings.locationRadius}]`;

            // Supabase settings 테이블에 저장 (id=1로 upsert)
            // Update stadium info only if superadmin
            if (adminRole === 'superadmin') {
                await supabase.from('stadiums').update({
                    name: settings.venueName,
                    latitude: settings.locationLat,
                    longitude: settings.locationLng,
                    radius_meter: settings.locationRadius
                }).eq('id', currentStadiumId);
            }

            const { error } = await supabase
                .from('settings')
                .upsert({
                    stadium_id: currentStadiumId,
                    
                    venue_name: settings.venueName,
                    operating_hours: settings.operatingHours,
                    contact_info: settings.contactInfo,
                    rules: rulesWithMetadata,
                    updated_at: new Date().toISOString(),
                    court_count: settings.courtCount,
                    duration_minutes: settings.durationMinutes,
                    use_geofence: settings.useGeofence,
                    location_lat: settings.locationLat,
                    location_lng: settings.locationLng,
                    location_radius: settings.locationRadius
                }, {
                    onConflict: 'stadium_id'
                });

            if (error) throw error;

            alert('설정이 저장되었습니다!');
            fetchCourts();
            fetchSettings();
        } catch (error) {
            alert('설정 저장 중 오류가 발생했습니다.');
        }
    };

    const handleSaveLocationSettings = async () => {
        if (!currentStadiumId) return;
        try {
            const rulesWithMetadata = `${settings.rules}\n\n[court_count:${settings.courtCount}][duration_minutes:${settings.durationMinutes || 120}][use_geofence:${settings.useGeofence}][location_lat:${settings.locationLat}][location_lng:${settings.locationLng}][location_radius:${settings.locationRadius}]`;

            const { error } = await supabase
                .from('settings')
                .upsert({
                    stadium_id: currentStadiumId,
                    venue_name: settings.venueName,
                    operating_hours: settings.operatingHours,
                    contact_info: settings.contactInfo,
                    rules: rulesWithMetadata,
                    updated_at: new Date().toISOString(),
                    court_count: settings.courtCount,
                    duration_minutes: settings.durationMinutes,
                    use_geofence: settings.useGeofence,
                    location_lat: settings.locationLat,
                    location_lng: settings.locationLng,
                    location_radius: settings.locationRadius
                }, {
                    onConflict: 'stadium_id'
                });

            if (error) throw error;
            alert('위치 정보가 저장되었습니다!');
            fetchSettings();
        } catch (error) {
            alert('위치 정보 저장 중 오류가 발생했습니다.');
        }
    };

    const handleCreateAdmin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAdminEmail.trim() || !newAdminPassword.trim()) {
            alert('이메일과 비밀번호를 입력하세요.');
            return;
        }
        if (newAdminPassword.length < 6) {
            alert('비밀번호는 최소 6자리 이상이어야 합니다.');
            return;
        }
        try {
            const { data, error } = await supabase.auth.signUp({
                email: newAdminEmail.trim(),
                password: newAdminPassword.trim(),
            });
            if (error) throw error;
            alert('새 관리자 계정이 등록되었습니다!');
            setNewAdminEmail('');
            setNewAdminPassword('');
        } catch (error: any) {
            alert(`관리자 추가 실패: ${error.message || error}`);
        }
    };

    useEffect(() => {
        const host = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        setBaseUrl(host);
        generateQRWithFixedSession(host);

        if (!currentStadiumId) return;

        fetchCourts();
        fetchActiveSessions();
        fetchSettings();
        fetchClubs();

        // 실시간 업데이트 구독 (stadium_id별 채널 및 필터 적용)
        const channel = supabase
            .channel(`admin-changes-${currentStadiumId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'courts', filter: `stadium_id=eq.${currentStadiumId}` }, fetchCourts)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'entry_sessions', filter: `stadium_id=eq.${currentStadiumId}` }, fetchActiveSessions)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: `stadium_id=eq.${currentStadiumId}` }, fetchSettings)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [currentStadiumId]);

    // 1. Leaflet CDN 자원 동적 로드
    useEffect(() => {
        if (typeof window === 'undefined') return;

        if ((window as any).L) {
            setMapLoaded(true);
            return;
        }

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
        script.async = true;
        script.onload = () => {
            setMapLoaded(true);
        };
        document.head.appendChild(script);
    }, []);

    // 2. Leaflet 지도 인스턴스 초기화 (구글 맵 레이어)
    useEffect(() => {
        if (!mapLoaded || activeMenu !== 'settings') return;

        const L = (window as any).L;
        if (!L) return;

        const mapContainer = document.getElementById('admin-map');
        if (!mapContainer) return;
        
        if ((mapContainer as any)._leaflet_id) {
            const map = (window as any).adminMapInstance;
            if (map) {
                setTimeout(() => {
                    map.invalidateSize();
                }, 100);
            }
            return;
        }

        const map = L.map('admin-map').setView([settings.locationLat, settings.locationLng], 16);

        L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}', {
            attribution: '&copy; Google Maps'
        }).addTo(map);

        const marker = L.marker([settings.locationLat, settings.locationLng], {
            draggable: true
        }).addTo(map);

        marker.on('dragend', () => {
            const position = marker.getLatLng();
            setSettings(prev => ({
                ...prev,
                locationLat: Number(position.lat.toFixed(6)),
                locationLng: Number(position.lng.toFixed(6))
            }));
        });

        map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            marker.setLatLng([lat, lng]);
            setSettings(prev => ({
                ...prev,
                locationLat: Number(lat.toFixed(6)),
                locationLng: Number(lng.toFixed(6))
            }));
        });

        (window as any).adminMapInstance = map;
        (window as any).adminMapMarker = marker;

        setTimeout(() => {
            map.invalidateSize();
        }, 300);

    }, [mapLoaded, activeMenu]);

    const handleReloadMap = () => {
        const map = (window as any).adminMapInstance;
        const marker = (window as any).adminMapMarker;
        const L = (window as any).L;

        if (map) {
            map.invalidateSize();
            map.setView([settings.locationLat, settings.locationLng], 16);
            if (marker) {
                marker.setLatLng([settings.locationLat, settings.locationLng]);
            }
        } else {
            const mapContainer = document.getElementById('admin-map');
            if (mapContainer && L) {
                if ((mapContainer as any)._leaflet_id) {
                    mapContainer.innerHTML = '';
                    delete (mapContainer as any)._leaflet_id;
                }
                
                const newMap = L.map('admin-map').setView([settings.locationLat, settings.locationLng], 16);
                L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=ko&x={x}&y={y}&z={z}', {
                    attribution: '&copy; Google Maps'
                }).addTo(newMap);

                const newMarker = L.marker([settings.locationLat, settings.locationLng], {
                    draggable: true
                }).addTo(newMap);

                newMarker.on('dragend', () => {
                    const position = newMarker.getLatLng();
                    setSettings(prev => ({
                        ...prev,
                        locationLat: Number(position.lat.toFixed(6)),
                        locationLng: Number(position.lng.toFixed(6))
                    }));
                });

                newMap.on('click', (e: any) => {
                    const { lat, lng } = e.latlng;
                    newMarker.setLatLng([lat, lng]);
                    setSettings(prev => ({
                        ...prev,
                        locationLat: Number(lat.toFixed(6)),
                        locationLng: Number(lng.toFixed(6))
                    }));
                });

                (window as any).adminMapInstance = newMap;
                (window as any).adminMapMarker = newMarker;
                
                setTimeout(() => {
                    newMap.invalidateSize();
                }, 100);
            }
        }
    };

    // 3. 인풋 값 수동 수정 혹은 "현재 내 위치" 버튼 클릭 시 맵 좌표 동기화
    useEffect(() => {
        const map = (window as any).adminMapInstance;
        const marker = (window as any).adminMapMarker;
        if (map && marker) {
            const curLatLng = marker.getLatLng();
            if (Math.abs(curLatLng.lat - settings.locationLat) > 0.00001 || Math.abs(curLatLng.lng - settings.locationLng) > 0.00001) {
                marker.setLatLng([settings.locationLat, settings.locationLng]);
                map.panTo([settings.locationLat, settings.locationLng]);
            }
        }
    }, [settings.locationLat, settings.locationLng]);

    const generateQRWithFixedSession = (currentBaseUrl?: string) => {
        const fixedSessionId = process.env.NEXT_PUBLIC_QR_SESSION_ID || 'qr_entrance_fixed_2024';
        const host = currentBaseUrl || baseUrl;
        const url = `${host}/scan?session=${fixedSessionId}`;
        setQrUrl(url);
    };

    const fetchCourts = async () => {
        if (!currentStadiumId) return;
        const { data: courtsData } = await supabase.from('courts').select('*').eq('stadium_id', currentStadiumId).order('id');
        const { data: resData } = await supabase.from('reservations').select('court_id').eq('stadium_id', currentStadiumId);

        if (courtsData) {
            const updatedCourts = courtsData.map(court => ({
                ...court,
                current_users_count: resData?.filter(r => r.court_id === court.id)?.length ?? 0
            }));
            setCourts(updatedCourts);

            const statuses: { [key: number]: string } = {};
            courtsData.forEach(c => {
                statuses[c.id] = c.status;
            });
            setTempCourtStatuses(statuses);
        }
    };

    const fetchActiveSessions = async () => {
        if (!currentStadiumId) return;
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
            .eq('stadium_id', currentStadiumId)
            .eq('is_active', true)
            .gt('expires_at', new Date().toISOString())
            .order('entry_at', { ascending: false });

        if (data) setActiveSessions(data as EntrySession[]);
    };
    const fetchSettings = async () => {
        if (!currentStadiumId) return;
        try {
            const { data, error } = await supabase
                .from('settings')
                .select('*')
                .eq('stadium_id', currentStadiumId)
                .maybeSingle();

            if (error) throw error;

            if (!data) {
                // If settings do not exist for the stadium, initialize with defaults
                const rulesText = '• 코트 이용 시간은 2시간으로 제한됩니다.\n• 4명이 모여야 코트 사용이 가능합니다.\n• 안전을 위해 운동화를 착용해주세요.\n• 코트 내 음식물 반입을 금지합니다.';
                const rulesWithMetadata = `${rulesText}\n\n[court_count:8][duration_minutes:120][use_geofence:false][location_lat:37.5665][location_lng:126.9780][location_radius:100]`;
                await supabase.from('settings').insert({
                    stadium_id: currentStadiumId,
                    venue_name: '스마트 배드민턴 코트',
                    operating_hours: '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
                    contact_info: '전화번호 미등록',
                    rules: rulesWithMetadata,
                    court_count: 8,
                    duration_minutes: 120,
                    use_geofence: false,
                    location_lat: 37.5665,
                    location_lng: 126.9780,
                    location_radius: 100
                });
                fetchSettings();
                return;
            }

            if (data) {
                const rulesText = data.rules || '';
                const cleanRules = rulesText
                    .replace(/\n\n\[court_count:\d+\].*$/, '')
                    .replace(/\[court_count:\d+\]/, '')
                    .replace(/\[duration_minutes:\d+\]/, '')
                    .replace(/\[use_geofence:\w+\]/, '')
                    .replace(/\[location_lat:[\d.-]+\]/, '')
                    .replace(/\[location_lng:[\d.-]+\]/, '')
                    .replace(/\[location_radius:\d+\]/, '');
                
                let loadedCourtCount = 8;
                if (data.court_count !== null && data.court_count !== undefined) {
                    loadedCourtCount = Number(data.court_count);
                } else {
                    const matchCount = rulesText.match(/\[court_count:(\d+)\]/);
                    if (matchCount) loadedCourtCount = parseInt(matchCount[1], 10);
                }

                let loadedDuration = 120;
                if (data.duration_minutes !== null && data.duration_minutes !== undefined) {
                    loadedDuration = Number(data.duration_minutes);
                } else {
                    const matchDuration = rulesText.match(/\[duration_minutes:(\d+)\]/);
                    if (matchDuration) loadedDuration = parseInt(matchDuration[1], 10);
                }

                let loadedUseGeofence = false;
                if (data.use_geofence !== null && data.use_geofence !== undefined) {
                    loadedUseGeofence = Boolean(data.use_geofence);
                } else {
                    const matchGeofence = rulesText.match(/\[use_geofence:(\w+)\]/);
                    if (matchGeofence) loadedUseGeofence = matchGeofence[1] === 'true';
                }

                let loadedLat = 37.5665;
                if (data.location_lat !== null && data.location_lat !== undefined) {
                    loadedLat = Number(data.location_lat);
                } else {
                    const matchLat = rulesText.match(/\[location_lat:([\d.-]+)\]/);
                    if (matchLat) loadedLat = parseFloat(matchLat[1]);
                }

                let loadedLng = 126.9780;
                if (data.location_lng !== null && data.location_lng !== undefined) {
                    loadedLng = Number(data.location_lng);
                } else {
                    const matchLng = rulesText.match(/\[location_lng:([\d.-]+)\]/);
                    if (matchLng) loadedLng = parseFloat(matchLng[1]);
                }

                let loadedRadius = 100;
                if (data.location_radius !== null && data.location_radius !== undefined) {
                    loadedRadius = Number(data.location_radius);
                } else {
                    const matchRadius = rulesText.match(/\[location_radius:(\d+)\]/);
                    if (matchRadius) loadedRadius = parseInt(matchRadius[1], 10);
                }

                setSettings({
                    venueName: data.venue_name || '',
                    operatingHours: data?.operating_hours || '',
                    contactInfo: data?.contact_info || '',
                    rules: cleanRules.trim(),
                    courtCount: loadedCourtCount,
                    durationMinutes: loadedDuration,
                    useGeofence: loadedUseGeofence,
                    locationLat: loadedLat,
                    locationLng: loadedLng,
                    locationRadius: loadedRadius
                });
            }
        } catch (error) {
            // Ignore settings fetch error
        }
    };

    const fetchClubs = async () => {
        if (!currentStadiumId) return;
        const { data } = await supabase
            .from('clubs')
            .select('*')
            .eq('stadium_id', currentStadiumId)
            .order('name', { ascending: true });
        if (data) setClubs(data);
    };

    const handleAddClub = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClubName.trim() || !currentStadiumId) return;
        const { error } = await supabase
            .from('clubs')
            .insert([{ name: newClubName.trim(), stadium_id: currentStadiumId }]);
        if (error) {
            alert('클럽 등록 중 오류가 발생했습니다. (이미 존재하는 이름일 수 있습니다)');
        } else {
            setNewClubName('');
            fetchClubs();
        }
    };

    const handleDeleteClub = async (id: number) => {
        if (!confirm('해당 클럽을 삭제하시겠습니까?')) return;
        const { error } = await supabase
            .from('clubs')
            .delete()
            .eq('id', id);
        if (error) {
            alert('클럽 삭제 중 오류가 발생했습니다.');
        } else {
            fetchClubs();
        }
    };

    const handleResetCourtReservations = async (courtId: number) => {
        if (!confirm('해당 코트의 신청자를 모두 초기화하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('reservations')
                .delete()
                .eq('court_id', courtId);
            
            if (error) throw error;
            alert('해당 코트의 신청자가 초기화되었습니다.');
            fetchCourts();
        } catch (err: any) {
            console.error('Failed to reset reservations:', err);
            alert('신청자 초기화 중 오류가 발생했습니다.');
        }
    };

    const handleResetAllReservations = async () => {
        if (!confirm('모든 코트의 신청자를 초기화하시겠습니까?')) return;
        try {
            const { error } = await supabase
                .from('reservations')
                .delete()
                .eq('stadium_id', currentStadiumId);
            
            if (error) throw error;
            alert('모든 코트의 신청자가 초기화되었습니다.');
            fetchCourts();
        } catch (err: any) {
            console.error('Failed to reset all reservations:', err);
            alert('전체 신청자 초기화 중 오류가 발생했습니다.');
        }
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
        const timeMap: { [key: string]: number } = {};
        const now = new Date();
        const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

        // 3시간 전부터 현재까지의 세션만 필터링
        const recentSessions = activeSessions.filter(session => {
            const entryTime = new Date(session.entry_at);
            return entryTime >= threeHoursAgo && entryTime <= now;
        });

        // 10분 단위로 그룹화
        recentSessions.forEach(session => {
            const entryTime = new Date(session.entry_at);
            const hours = entryTime.getHours();
            const minutes = Math.floor(entryTime.getMinutes() / 10) * 10;
            const timeKey = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
            timeMap[timeKey] = (timeMap[timeKey] || 0) + 1;
        });

        return Object.entries(timeMap)
            .sort(([a], [b]) => {
                const [aHour, aMin] = a.split(':').map(Number);
                const [bHour, bMin] = b.split(':').map(Number);
                return (aHour * 60 + aMin) - (bHour * 60 + bMin);
            })
            .map(([time, count]) => ({ hour: time, count }));
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
                        <li>원하는 <strong>코트에 신청</strong>을 완료합니다.</li>
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
        { id: 'qr' as MenuType, icon: BadmintonIcon, label: 'QR 생성', color: 'slate' },
        { id: 'courts' as MenuType, icon: LayoutDashboard, label: '코트 현황', color: 'slate' },
        { id: 'usage' as MenuType, icon: Activity, label: '사용 현황', color: 'slate' },
        { id: 'clubs' as MenuType, icon: Users, label: '클럽 관리', color: 'slate' },
        { id: 'settings' as MenuType, icon: Settings, label: '환경설정', color: 'slate' },
        ...(adminRole === 'superadmin' ? [{ id: 'managers' as MenuType, icon: Shield, label: '매니저 관리', color: 'slate' }] : []),
    ];

    // 로딩 중이거나 인증되지 않은 경우
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mb-4 mx-auto shadow-2xl p-2 animate-pulse">
                        <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <p className="text-white font-bold text-lg">로딩 중...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return null;
    }

    return (
        <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Sidebar */}
            <aside className="w-72 bg-white border-r border-slate-200 shadow-lg">
                <div className="p-6 border-b border-slate-200">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg p-1.5 border border-slate-100">
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="text-xl font-black text-slate-900">관리자</h1>
                            <p className="text-xs text-slate-500 font-semibold">Admin Dashboard</p>
                        </div>
                    </div>
                    <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-600 font-semibold truncate">{userEmail}</p>
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
                                        {item.id === 'qr' ? (
                                            <img src="/logo.png" alt="QR" className={`w-5 h-5 object-contain ${isActive ? 'brightness-0 invert' : ''}`} />
                                        ) : (
                                            <Icon className="w-5 h-5" strokeWidth={2.5} />
                                        )}
                                        <span className="flex-1 text-left">{item.label}</span>
                                        {isActive && <ChevronRight className="w-4 h-4" strokeWidth={3} />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </nav>

                {/* 로그아웃 버튼 */}
                <div className="absolute bottom-0 left-0 right-0 w-72 p-4 border-t border-slate-200 bg-white">
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm text-red-600 hover:bg-red-50 transition-all"
                    >
                        <LogOut className="w-5 h-5" strokeWidth={2.5} />
                        <span>로그아웃</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 p-8 overflow-auto">
                {/* Stadium Selector Bar */}
                <div className="bg-white rounded-2xl p-6 shadow-md border border-slate-200 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <MapPin className="w-6 h-6 text-indigo-600" />
                        <div>
                            <h2 className="text-sm font-bold text-slate-400 uppercase">현재 관리 구장</h2>
                            {adminRole === 'superadmin' ? (
                                <select
                                    value={currentStadiumId || ''}
                                    onChange={(e) => setCurrentStadiumId(Number(e.target.value))}
                                    className="text-lg font-black text-slate-800 bg-transparent border-b-2 border-indigo-600 focus:outline-none pr-8 py-1 cursor-pointer"
                                >
                                    {stadiums.map((stadium) => (
                                        <option key={stadium.id} value={stadium.id}>
                                            {stadium.name} ({stadium.address})
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <span className="text-lg font-black text-slate-800">
                                    {stadiums.find(s => s.id === currentStadiumId)?.name || '지정 구장'}
                                </span>
                            )}
                        </div>
                    </div>
                    {adminRole === 'superadmin' && (
                        <button
                            onClick={() => setIsAddStadiumOpen(true)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 text-xs flex items-center gap-1.5 self-start md:self-center"
                        >
                            ➕ 새 구장 추가
                        </button>
                    )}
                </div>

                {/* 구장 추가 모달 */}
                {isAddStadiumOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
                        <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
                            <h3 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                <MapPin className="w-7 h-7 text-indigo-600" />
                                <span>새 구장 추가</span>
                            </h3>
                            <form onSubmit={handleCreateStadium} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">구장 이름</label>
                                    <input
                                        type="text"
                                        value={newStadiumName}
                                        onChange={(e) => setNewStadiumName(e.target.value)}
                                        placeholder="예: 스마트 배드민턴 마포점"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">구장 주소</label>
                                    <input
                                        type="text"
                                        value={newStadiumAddress}
                                        onChange={(e) => setNewStadiumAddress(e.target.value)}
                                        placeholder="예: 서울시 마포구 독막로 123"
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">위도 (Latitude)</label>
                                        <input
                                            type="number"
                                            value={newStadiumLat}
                                            onChange={(e) => setNewStadiumLat(parseFloat(e.target.value) || 0)}
                                            step="any"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">경도 (Longitude)</label>
                                        <input
                                            type="number"
                                            value={newStadiumLng}
                                            onChange={(e) => setNewStadiumLng(parseFloat(e.target.value) || 0)}
                                            step="any"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">입장 허용 반경 (미터)</label>
                                    <input
                                        type="number"
                                        value={newStadiumRadius}
                                        onChange={(e) => setNewStadiumRadius(parseInt(e.target.value, 10) || 100)}
                                        min={10}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setIsAddStadiumOpen(false)}
                                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl text-sm transition-all"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md active:scale-95"
                                    >
                                        구장 등록
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
                {/* QR 생성 */}
                {activeMenu === 'qr' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                <Printer className="w-10 h-10 text-indigo-600" />
                                QR 코드 생성
                            </h2>
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
                                                <img src="/logo.png" alt="Logo" className="w-24 h-24 object-contain animate-pulse" />
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
                                    <p className="text-[11px] text-slate-400 mt-2 font-medium">※ 스마트폰 스캔을 위해 IP 주소(예: 192.168.0.98)를 입력하세요.</p>
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
                                    <p className="text-[11px] text-slate-400 mt-2 font-medium">※ 모든 사용자가 동일한 고정 QR 코드를 사용합니다.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 코트 현황 */}
                {activeMenu === 'courts' && (
                    <div>
                        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div>
                                <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                    <LayoutDashboard className="w-10 h-10 text-indigo-600" />
                                    코트 현황
                                </h2>
                                <p className="text-slate-600 font-medium">실시간 코트 상태 및 신청 인원을 확인하세요</p>
                            </div>
                            <button
                                onClick={handleResetAllReservations}
                                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 text-sm flex items-center gap-2 self-start sm:self-center"
                            >
                                전체 신청자 초기화
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            {courts.slice(0, settings.courtCount).map((court) => (
                                <div
                                    key={court.id}
                                    className="bg-white rounded-2xl p-6 shadow-lg border border-slate-200 hover:shadow-xl transition-all flex flex-col justify-between"
                                >
                                    <div>
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <h3 className="text-2xl font-black text-slate-900 mb-1">{court.name}</h3>
                                                <div className="flex items-center gap-1.5">
                                                    <MapPin className="w-3.5 h-3.5 text-slate-300" strokeWidth={2.5} />
                                                    <span className="text-xs font-bold text-slate-400">ID: {court.id}</span>
                                                </div>
                                            </div>
                                            <span className={`px-3 py-1.5 rounded-full text-xs font-black uppercase ${
                                                court.status === 'available' ? 'bg-green-100 text-green-700 border border-green-200' :
                                                court.status === 'occupied' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                                                court.status === 'lesson' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                                                court.status === 'beginner' ? 'bg-violet-100 text-violet-700 border border-violet-200' :
                                                'bg-slate-100 text-slate-700 border border-slate-200'
                                                }`}>
                                                {court.status === 'available' ? '사용가능' :
                                                 court.status === 'occupied' ? '사용중' :
                                                 court.status === 'lesson' ? '레슨중' :
                                                 court.status === 'beginner' ? '초보연습' : '수리중'}
                                            </span>
                                        </div>

                                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <Users className="w-4 h-4 text-indigo-600" strokeWidth={2.5} />
                                                    <span className="text-xs font-bold text-slate-600">신청 인원</span>
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

                                    <button
                                        onClick={() => handleResetCourtReservations(court.id)}
                                        className="w-full bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 hover:border-red-200 py-2.5 rounded-xl font-bold text-xs transition-all active:scale-98 flex items-center justify-center gap-1.5"
                                    >
                                        신청자 초기화
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 사용 현황 */}
                {activeMenu === 'usage' && (
                    <div>
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                <Activity className="w-10 h-10 text-indigo-600" />
                                사용 현황
                            </h2>
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
                                    시간대별 입장 (최근 3시간)
                                </h3>
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {getSessionsByHour().length > 0 ? (
                                        getSessionsByHour().map(({ hour, count }) => (
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
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400">
                                            <p className="text-sm font-semibold">최근 3시간 동안 입장 기록이 없습니다</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 환경설정 */}
                {activeMenu === 'settings' && (
                    <div>
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                <Settings className="w-10 h-10 text-indigo-600" />
                                환경설정
                            </h2>
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
                                        <label className="block text-sm font-bold text-slate-700 mb-2">코트 수 설정</label>
                                        <input
                                            type="number"
                                            value={settings.courtCount}
                                            onChange={(e) => setSettings({ ...settings, courtCount: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                                            min={1}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-bold text-slate-700 mb-2">이용 제한 시간 (분)</label>
                                        <input
                                            type="number"
                                            value={settings.durationMinutes || 120}
                                            onChange={(e) => setSettings({ ...settings, durationMinutes: Math.max(10, parseInt(e.target.value, 10) || 10) })}
                                            step={10}
                                            min={10}
                                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                        />
                                    </div>
                                    <div className="mt-4 border-t border-slate-100 pt-4">
                                        <label className="block text-sm font-bold text-slate-700 mb-3">개별 코트 사용 설정</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {courts.slice(0, settings.courtCount).map((court) => (
                                                <div key={court.id} className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                                                    <span className="text-sm font-bold text-slate-700">{court.name}</span>
                                                    <select
                                                        value={tempCourtStatuses[court.id] || court.status}
                                                        onChange={(e) => setTempCourtStatuses({
                                                            ...tempCourtStatuses,
                                                            [court.id]: e.target.value
                                                        })}
                                                        className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    >
                                                        <option value="available">사용 가능</option>
                                                        <option value="lesson">레슨중</option>
                                                        <option value="beginner">초보자 연습중</option>
                                                        <option value="maintenance">수리중</option>
                                                    </select>
                                                </div>
                                            ))}
                                        </div>
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

                            {adminRole === 'superadmin' && (
                                <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
                                    <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                        <span>📍 위치 기반 서비스(지오펜싱) 제한</span>
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
                                            <div>
                                                <span className="text-sm font-bold text-slate-700 block">위치기반 제한 활성화</span>
                                                <span className="text-xs text-slate-400">구장 반경 내의 사용자만 입장하도록 제한합니다.</span>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={settings.useGeofence}
                                                onChange={(e) => setSettings({ ...settings, useGeofence: e.target.checked })}
                                                className="w-5 h-5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50/50 border border-slate-200/60 rounded-xl">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">구장 위도 (Latitude)</label>
                                                <input
                                                    type="number"
                                                    value={settings.locationLat}
                                                    onChange={(e) => setSettings({ ...settings, locationLat: parseFloat(e.target.value) || 0 })}
                                                    step="any"
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">구장 경도 (Longitude)</label>
                                                <input
                                                    type="number"
                                                    value={settings.locationLng}
                                                    onChange={(e) => setSettings({ ...settings, locationLng: parseFloat(e.target.value) || 0 })}
                                                    step="any"
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 mb-1">허용 반경 (미터)</label>
                                                <input
                                                    type="number"
                                                    value={settings.locationRadius}
                                                    onChange={(e) => setSettings({ ...settings, locationRadius: parseInt(e.target.value, 10) || 100 })}
                                                    min={10}
                                                    step={10}
                                                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                            <div className="col-span-1 md:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if ('geolocation' in navigator) {
                                                            navigator.geolocation.getCurrentPosition((pos) => {
                                                                setSettings({
                                                                    ...settings,
                                                                    locationLat: pos.coords.latitude,
                                                                    locationLng: pos.coords.longitude
                                                                });
                                                                alert('현재 관리자 브라우저의 위치로 설정되었습니다.');
                                                            }, (err) => {
                                                                alert(`위치 정보를 가져오지 못했습니다: ${err.message}`);
                                                            });
                                                        } else {
                                                            alert('이 브라우저는 위치 서비스를 지원하지 않습니다.');
                                                        }
                                                    }}
                                                    className="py-2.5 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 font-bold rounded-lg text-xs transition-all border border-indigo-200 text-center"
                                                >
                                                    📍 현재 내 위치로 구장 설정
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const map = (window as any).adminMapInstance;
                                                        const marker = (window as any).adminMapMarker;
                                                        if (map && marker) {
                                                            const center = map.getCenter();
                                                            setSettings({
                                                                ...settings,
                                                                locationLat: Number(center.lat.toFixed(6)),
                                                                locationLng: Number(center.lng.toFixed(6))
                                                            });
                                                            marker.setLatLng(center);
                                                            alert('현재 지도 화면의 중심 좌표로 설정되었습니다.');
                                                        } else {
                                                            alert('지도가 아직 완전히 로드되지 않았습니다.');
                                                        }
                                                    }}
                                                    className="py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold rounded-lg text-xs transition-all border border-emerald-200 text-center"
                                                >
                                                    🎯 지도 중심 위치로 설정
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleReloadMap}
                                                    className="py-2.5 px-4 bg-amber-50 hover:bg-amber-100 text-amber-600 font-bold rounded-lg text-xs transition-all border border-amber-200 text-center"
                                                >
                                                    🔄 지도 다시로드
                                                </button>
                                            </div>
                                            <div className="col-span-1 md:col-span-3 mt-2">
                                                <label className="block text-xs font-bold text-slate-500 mb-2">📍 구글 지도에서 위치 선택 (클릭 또는 마커 드래그)</label>
                                                <div 
                                                    id="admin-map" 
                                                    className="w-full h-[280px] bg-slate-100 rounded-xl border border-slate-200 overflow-hidden shadow-inner z-10"
                                                />
                                            </div>
                                            <div className="col-span-1 md:col-span-3 mt-4 flex justify-end gap-3">
                                                <button 
                                                    type="button"
                                                    onClick={handleSaveLocationSettings}
                                                    className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center gap-1.5"
                                                >
                                                    💾 위치 설정 저장
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={handleSaveSettings}
                                                    className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white font-bold rounded-xl text-sm transition-all shadow-md hover:shadow-lg active:scale-[0.98] flex items-center gap-1.5"
                                                >
                                                    ⚙️ 전체 설정 저장
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
                                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-indigo-600" />
                                    <span>이용 안내 및 규칙</span>
                                </h3>
                                <textarea
                                    value={settings.rules}
                                    onChange={(e) => setSettings({ ...settings, rules: e.target.value })}
                                    rows={8}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800 resize-none"
                                />
                            </div>



                            {/* 저장 버튼이 지도 아래로 이동되었습니다. */}
                        </div>
                    </div>
                )}

                {/* 매니저 관리 (최고 관리자 전용) */}
                {activeMenu === 'managers' && adminRole === 'superadmin' && (
                    <div className="max-w-6xl mx-auto space-y-8">
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                <Shield className="w-10 h-10 text-indigo-600" />
                                매니저 관리
                            </h2>
                            <p className="text-slate-600 font-medium">관리자 및 구장 담당 매니저 권한을 관리하세요</p>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* 매니저 추가 폼 */}
                            <div className="bg-white rounded-3xl p-8 shadow-lg border border-slate-200 h-fit">
                                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                    <span>➕ 신규 관리자/매니저 추가</span>
                                </h3>
                                <form onSubmit={async (e) => {
                                    e.preventDefault();
                                    const email = newAdminEmail.trim().toLowerCase();
                                    const password = newAdminPassword.trim();

                                    if (!email || !password) {
                                        alert('이메일과 비밀번호를 입력해주세요.');
                                        return;
                                    }
                                    if (password.length < 6) {
                                        alert('비밀번호는 6자리 이상이어야 합니다.');
                                        return;
                                    }
                                    if (newAdminRole === 'manager' && !newAdminTargetStadium) {
                                        alert('매니저가 담당할 구장을 선택해주세요.');
                                        return;
                                    }

                                    try {
                                        // 1. Create the login account in Supabase Auth.
                                        const { data: authData, error: authError } = await supabase.auth.signUp({
                                            email,
                                            password,
                                            options: {
                                                data: { role: newAdminRole },
                                            },
                                        });
                                        if (authError) {
                                            throw new Error(
                                                authError.message.includes('already registered')
                                                    ? '이미 등록된 이메일입니다. 다른 이메일을 사용해주세요.'
                                                    : `인증 계정 생성 실패: ${authError.message}`
                                            );
                                        }
                                        if (!authData.user) {
                                            throw new Error('인증 계정이 생성되지 않았습니다. Supabase Auth 설정과 트리거를 확인해주세요.');
                                        }

                                        // 2. Upsert the role so retrying after a partial failure is safe.
                                        const { error: dbError } = await supabase.from('admin_users').upsert({
                                            email,
                                            role: newAdminRole,
                                            stadium_id: newAdminRole === 'manager' ? newAdminTargetStadium : null
                                        }, { onConflict: 'email' });
                                        if (dbError) {
                                            throw new Error(`관리자 권한 저장 실패: ${dbError.message}`);
                                        }

                                        alert(`${newAdminRole === 'superadmin' ? '최고 관리자' : '매니저'} 계정이 추가되었습니다.`);
                                        setNewAdminEmail('');
                                        setNewAdminPassword('');
                                        setNewAdminTargetStadium(null);
                                        await fetchAdminUsers();
                                    } catch (err: any) {
                                        alert('추가 실패: ' + err.message);
                                    }
                                }} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">이메일 주소</label>
                                        <input
                                            type="email"
                                            value={newAdminEmail}
                                            onChange={(e) => setNewAdminEmail(e.target.value)}
                                            placeholder="manager@example.com"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">임시 비밀번호 (로그인용)</label>
                                        <input
                                            type="password"
                                            value={newAdminPassword}
                                            onChange={(e) => setNewAdminPassword(e.target.value)}
                                            placeholder="비밀번호 입력"
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">역할 (Role)</label>
                                        <select
                                            value={newAdminRole}
                                            onChange={(e) => {
                                                const role = e.target.value as 'superadmin' | 'manager';
                                                setNewAdminRole(role);
                                                if (role === 'manager' && stadiums.length > 0 && !newAdminTargetStadium) {
                                                    setNewAdminTargetStadium(stadiums[0].id);
                                                }
                                            }}
                                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            <option value="manager">일반 매니저 (지정 구장 관리)</option>
                                            <option value="superadmin">최고 관리자 (전체 관리/추가)</option>
                                        </select>
                                    </div>
                                    {newAdminRole === 'manager' && (
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 mb-1">담당 구장 배정</label>
                                            <select
                                                value={newAdminTargetStadium || ''}
                                                onChange={(e) => setNewAdminTargetStadium(Number(e.target.value))}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                required
                                            >
                                                {stadiums.map((stadium) => (
                                                    <option key={stadium.id} value={stadium.id}>
                                                        {stadium.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    )}
                                    <button
                                        type="submit"
                                        className="w-full py-3 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
                                    >
                                        💾 계정 등록 및 권한 부여
                                    </button>
                                </form>
                            </div>

                            {/* 등록된 관리자 목록 */}
                            <div className="bg-white rounded-3xl p-8 shadow-lg border border-slate-200 lg:col-span-2">
                                <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                    <span>👤 현재 등록된 관리자 목록</span>
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-200 text-xs font-bold text-slate-400">
                                                <th className="py-3 px-4">이메일</th>
                                                <th className="py-3 px-4">권한</th>
                                                <th className="py-3 px-4">담당 구장</th>
                                                <th className="py-3 px-4 text-right">관리</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {adminUsers.map((admin) => (
                                                <tr key={admin.id} className="text-sm font-semibold text-slate-700">
                                                    <td className="py-4 px-4 truncate max-w-[200px]">{admin.email}</td>
                                                    <td className="py-4 px-4">
                                                        <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                                                            admin.role === 'superadmin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700'
                                                        }`}>
                                                            {admin.role === 'superadmin' ? '최고 관리자' : '구장 매니저'}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-4 text-slate-500">
                                                        {admin.role === 'superadmin' ? '모든 구장 접근가능' : (admin.stadiums?.name || '미배정')}
                                                    </td>
                                                    <td className="py-4 px-4 text-right">
                                                        {admin.email !== userEmail && (
                                                            <button
                                                                onClick={() => handleDeleteAdmin(admin.id)}
                                                                className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-all"
                                                            >
                                                                삭제
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* 클럽 관리 독립 탭 */}
                {activeMenu === 'clubs' && (
                    <div className="max-w-5xl mx-auto">
                        <div className="mb-8">
                            <h2 className="text-4xl font-black text-slate-900 mb-2 flex items-center gap-3">
                                <Users className="w-10 h-10 text-indigo-600" />
                                클럽 관리
                            </h2>
                            <p className="text-slate-600 font-medium">배드민턴 회원 클럽 리스트를 등록하고 관리하세요</p>
                        </div>

                        <div className="bg-white rounded-2xl p-8 shadow-lg border border-slate-200">
                            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
                                <Users className="w-6 h-6 text-amber-600" />
                                등록된 클럽 리스트
                            </h3>
                            
                            <form onSubmit={handleAddClub} className="flex gap-3 mb-6">
                                <input
                                    type="text"
                                    value={newClubName}
                                    onChange={(e) => setNewClubName(e.target.value)}
                                    placeholder="등록할 클럽명을 입력하세요"
                                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-300 outline-none transition-all font-semibold text-slate-800"
                                    maxLength={50}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-md active:scale-95 text-sm"
                                >
                                    클럽 추가
                                </button>
                            </form>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {clubs.length > 0 ? (
                                    clubs.map((club) => (
                                        <div key={club.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow-md transition-all">
                                            <span className="text-sm font-bold text-slate-800">{club.name}</span>
                                            <button
                                                onClick={() => handleDeleteClub(club.id)}
                                                className="text-xs font-bold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-2 rounded-xl transition-all"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400 col-span-3">
                                        <p className="text-sm font-semibold">등록된 클럽이 없습니다</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
