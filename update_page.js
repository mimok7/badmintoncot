const fs = require('fs');

let content = fs.readFileSync('c:/SHT-DATA/badmintoncot/app/page.tsx', 'utf8');

// Add Stadium interface
content = content.replace(
  'interface EntrySession {',
  `interface Stadium {\n  id: number;\n  name: string;\n  address: string;\n  latitude: number;\n  longitude: number;\n  radius_meter: number;\n}\n\ninterface EntrySession {`
);

// Add currentStadium state
content = content.replace(
  'const [useGeofence, setUseGeofence] = useState<boolean>(false);',
  `const [useGeofence, setUseGeofence] = useState<boolean>(true);\n  const [stadiums, setStadiums] = useState<Stadium[]>([]);\n  const [currentStadium, setCurrentStadium] = useState<Stadium | null>(null);\n  const [findingStadium, setFindingStadium] = useState<boolean>(true);`
);

// Remove old location states
content = content.replace(/const \[locationLat.*?\n/, '');
content = content.replace(/const \[locationLng.*?\n/, '');
content = content.replace(/const \[locationRadius.*?\n/, '');

// Replace fetchClubs
content = content.replace(
  /const fetchClubs = async \(\) => \{\s*try \{\s*const \{ data \} = await supabase\s*\.from\('clubs'\)\s*\.select\('name'\)\s*\.order\('name', \{ ascending: true \}\);/m,
  `const fetchClubs = async () => {\n    if (!currentStadium) return;\n    try {\n      const { data } = await supabase\n        .from('clubs')\n        .select('name')\n        .eq('stadium_id', currentStadium.id)\n        .order('name', { ascending: true });`
);

// Update fetchCourts
content = content.replace(
  /const \{ data: courtsData \} = await supabase\.from\('courts'\)\.select\('\*'\)\.order\('id', \{ ascending: true \}\);/,
  `if (!currentStadium) return;\n    const { data: courtsData } = await supabase.from('courts').select('*').eq('stadium_id', currentStadium.id).order('id', { ascending: true });`
);
content = content.replace(
  /\.select\('court_id, user_id, team_number, status, confirmed_at, members\(nickname, club_name\)'\)\s*\.order\('team_number', \{ ascending: true \}\);/m,
  `.select('court_id, user_id, team_number, status, confirmed_at, members(nickname, club_name)')\n      .eq('stadium_id', currentStadium.id)\n      .order('team_number', { ascending: true });`
);

// Update fetchSettings
content = content.replace(
  /const fetchSettings = async \(\) => \{\s*try \{\s*const \{ data, error \} = await supabase\s*\.from\('settings'\)\s*\.select\('\*'\)\s*\.eq\('id', 1\)\s*\.single\(\);/m,
  `const fetchSettings = async () => {\n    if (!currentStadium) return;\n    try {\n      const { data, error } = await supabase\n        .from('settings')\n        .select('*')\n        .eq('stadium_id', currentStadium.id)\n        .maybeSingle();`
);

// Remove location parsing from fetchSettings
content = content.replace(/let loadedLat = 37\.5665;.*?setLocationRadius\(loadedRadius\);/s, '');

// Update register/reserve to add stadium_id
content = content.replace(
  /\.insert\(\[\{ nickname, club_name: selectedClub \}\]\)/,
  `.insert([{ nickname, club_name: selectedClub }])` // Nothing changed here, club handles stadium in admin
);

content = content.replace(
  /\.insert\(\{ id: entryId, user_id: data\.id, expires_at: expiresAt \}\)/,
  `.insert({ id: entryId, user_id: data.id, expires_at: expiresAt, stadium_id: currentStadium?.id })`
);
content = content.replace(
  /\.insert\(\{ id: entryId, user_id: member\.id, expires_at: expiresAt \}\)/,
  `.insert({ id: entryId, user_id: member.id, expires_at: expiresAt, stadium_id: currentStadium?.id })`
);
content = content.replace(
  /\.insert\(\{ court_id: courtId, user_id: member\.id, team_number: teamNumber \}\);/,
  `.insert({ court_id: courtId, user_id: member.id, team_number: teamNumber, stadium_id: currentStadium?.id });`
);

// Replace PWA and initial fetch useEffect
const pwaUseEffectReplacement = `
  useEffect(() => {
    const fetchStadiums = async () => {
      const { data } = await supabase.from('stadiums').select('*');
      if (data) setStadiums(data);
    };
    fetchStadiums();

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
    checkUser();
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings', filter: 'stadium_id=eq.' + currentStadium.id }, () => {
        fetchSettings();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentStadium]);
`;

content = content.replace(
  /useEffect\(\(\) => \{\s*fetchClubs\(\).*?supabase\.removeChannel\(channel\);\s*};\s*\}, \[\]\);/s,
  pwaUseEffectReplacement
);

// Replace geofencing useEffect
const geofencingUseEffectReplacement = `
  useEffect(() => {
    if (stadiums.length === 0) return;

    let watchId: number;

    if ('geolocation' in navigator) {
      const checkPosition = (pos: GeolocationPosition) => {
        let foundStadium: Stadium | null = null;
        let minDistance = Infinity;

        for (const stadium of stadiums) {
          const dist = getDistance(pos.coords.latitude, pos.coords.longitude, stadium.latitude, stadium.longitude);
          if (dist <= stadium.radius_meter && dist < minDistance) {
            minDistance = dist;
            foundStadium = stadium;
          }
        }

        if (foundStadium) {
          if (!currentStadium || currentStadium.id !== foundStadium.id) {
            setCurrentStadium(foundStadium);
            setVenueName(foundStadium.name);
          }
          setIsInsideGeofence(true);
        } else {
          setIsInsideGeofence(false);
          if (session) {
            handleLogoutWithReason('구장 밖으로 이동하여 자동 로그아웃되었습니다.');
          }
        }
        setFindingStadium(false);
      };

      navigator.geolocation.getCurrentPosition(
        checkPosition,
        (err) => {
          console.error('Geolocation initial check error:', err);
          setIsInsideGeofence(false);
          setFindingStadium(false);
        }
      );

      watchId = navigator.geolocation.watchPosition(
        checkPosition,
        (err) => {
          console.error('Geolocation watch error:', err);
          setIsInsideGeofence(false);
          if (session) {
            handleLogoutWithReason('위치 서비스 이용이 불가능해져 로그아웃되었습니다.');
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    } else {
      setIsInsideGeofence(false);
      setFindingStadium(false);
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [stadiums, session]);
`;

content = content.replace(
  /useEffect\(\(\) => \{\s*if \(!useGeofence\) \{.*?if \(watchId\) navigator\.geolocation\.clearWatch\(watchId\);\s*};\s*\}, \[useGeofence, locationLat, locationLng, locationRadius, session\]\);/s,
  geofencingUseEffectReplacement
);

// Replace loading condition
content = content.replace(
  /if \(loading\) return \(/,
  "if (loading || findingStadium) return ("
);

// Update member null check (before returning form)
content = content.replace(
  /if \(!member\) \{/,
  "if (!member) {\n    if (findingStadium) return null;"
);

fs.writeFileSync('c:/SHT-DATA/badmintoncot/app/page.tsx', content);
console.log('Successfully updated app/page.tsx');
