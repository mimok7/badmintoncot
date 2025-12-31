-- 5. 환경설정 테이블 (배드민턴장 정보 및 운영 설정)
CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    venue_name VARCHAR(100) DEFAULT '스마트 배드민턴 코트',
    operating_hours TEXT DEFAULT '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
    contact_info TEXT DEFAULT '전화: 02-1234-5678 | 이메일: info@badminton.com',
    rules TEXT DEFAULT '• 코트 이용 시간은 2시간으로 제한됩니다.
• 4명이 모여야 코트 사용이 가능합니다.
• 안전을 위해 운동화를 착용해주세요.
• 코트 내 음식물 반입을 금지합니다.',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초기 설정 데이터 삽입 (중복 방지)
INSERT INTO settings (id, venue_name, operating_hours, contact_info, rules)
VALUES (1, '스마트 배드민턴 코트', 
        '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
        '전화: 02-1234-5678 | 이메일: info@badminton.com',
        '• 코트 이용 시간은 2시간으로 제한됩니다.
• 4명이 모여야 코트 사용이 가능합니다.
• 안전을 위해 운동화를 착용해주세요.
• 코트 내 음식물 반입을 금지합니다.')
ON CONFLICT (id) DO NOTHING;

-- 6. QR 세션 로그 테이블 (생성된 QR 코드 추적)
CREATE TABLE IF NOT EXISTS qr_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    qr_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '24 hours'),
    is_active BOOLEAN DEFAULT TRUE,
    used_count INTEGER DEFAULT 0, -- 몇 명이 이 QR을 스캔했는지
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- QR 세션 인덱스 추가 (빠른 조회)
CREATE INDEX IF NOT EXISTS idx_qr_sessions_session_id ON qr_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_active ON qr_sessions(is_active, expires_at);

-- 7. 시스템 통계 테이블 (일별 통계)
CREATE TABLE IF NOT EXISTS daily_statistics (
    id SERIAL PRIMARY KEY,
    stat_date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
    total_entries INTEGER DEFAULT 0, -- 총 입장 수
    total_reservations INTEGER DEFAULT 0, -- 총 예약 수
    total_matches INTEGER DEFAULT 0, -- 총 매칭 성공 수 (4명 모인 횟수)
    peak_hour INTEGER, -- 가장 바쁜 시간대
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 일별 통계 업데이트 함수
CREATE OR REPLACE FUNCTION update_daily_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- entry_sessions에 새 입장이 있을 때
    IF TG_TABLE_NAME = 'entry_sessions' AND TG_OP = 'INSERT' THEN
        INSERT INTO daily_statistics (stat_date, total_entries)
        VALUES (CURRENT_DATE, 1)
        ON CONFLICT (stat_date) 
        DO UPDATE SET 
            total_entries = daily_statistics.total_entries + 1,
            updated_at = NOW();
    END IF;
    
    -- reservations에 새 예약이 있을 때
    IF TG_TABLE_NAME = 'reservations' AND TG_OP = 'INSERT' THEN
        INSERT INTO daily_statistics (stat_date, total_reservations)
        VALUES (CURRENT_DATE, 1)
        ON CONFLICT (stat_date) 
        DO UPDATE SET 
            total_reservations = daily_statistics.total_reservations + 1,
            updated_at = NOW();
    END IF;
    
    -- court_usage에 새 매칭이 있을 때
    IF TG_TABLE_NAME = 'court_usage' AND TG_OP = 'INSERT' THEN
        INSERT INTO daily_statistics (stat_date, total_matches)
        VALUES (CURRENT_DATE, 1)
        ON CONFLICT (stat_date) 
        DO UPDATE SET 
            total_matches = daily_statistics.total_matches + 1,
            updated_at = NOW();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 통계 업데이트 트리거 설정
DROP TRIGGER IF EXISTS trigger_update_entry_statistics ON entry_sessions;
CREATE TRIGGER trigger_update_entry_statistics
AFTER INSERT ON entry_sessions
FOR EACH ROW
EXECUTE FUNCTION update_daily_statistics();

DROP TRIGGER IF EXISTS trigger_update_reservation_statistics ON reservations;
CREATE TRIGGER trigger_update_reservation_statistics
AFTER INSERT ON reservations
FOR EACH ROW
EXECUTE FUNCTION update_daily_statistics();

DROP TRIGGER IF EXISTS trigger_update_match_statistics ON court_usage;
CREATE TRIGGER trigger_update_match_statistics
AFTER INSERT ON court_usage
FOR EACH ROW
EXECUTE FUNCTION update_daily_statistics();

-- 8. QR 사용 로그 업데이트 함수
CREATE OR REPLACE FUNCTION log_qr_usage()
RETURNS TRIGGER AS $$
DECLARE
    qr_session_id VARCHAR(100);
BEGIN
    -- entry_sessions에 qr_session_id 컬럼이 있다고 가정
    -- 실제로는 entry_sessions 테이블에 qr_session_id 컬럼을 추가해야 함
    IF NEW.qr_session_id IS NOT NULL THEN
        UPDATE qr_sessions
        SET 
            used_count = used_count + 1,
            last_used_at = NOW()
        WHERE session_id = NEW.qr_session_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- entry_sessions 테이블에 qr_session_id 컬럼 추가 (없는 경우)
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'entry_sessions' 
        AND column_name = 'qr_session_id'
    ) THEN
        ALTER TABLE entry_sessions 
        ADD COLUMN qr_session_id VARCHAR(100);
        
        CREATE INDEX idx_entry_sessions_qr_session 
        ON entry_sessions(qr_session_id);
    END IF;
END $$;

-- QR 사용 로그 트리거
DROP TRIGGER IF EXISTS trigger_log_qr_usage ON entry_sessions;
CREATE TRIGGER trigger_log_qr_usage
AFTER INSERT ON entry_sessions
FOR EACH ROW
EXECUTE FUNCTION log_qr_usage();

-- 실시간 기능을 위한 테이블 추가
DO $$ 
BEGIN 
    -- settings 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'settings') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE settings;
    END IF;

    -- qr_sessions 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'qr_sessions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE qr_sessions;
    END IF;

    -- daily_statistics 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'daily_statistics') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE daily_statistics;
    END IF;
END $$;

-- 뷰: 오늘의 통계 요약
CREATE OR REPLACE VIEW today_stats AS
SELECT 
    COALESCE(total_entries, 0) as total_entries,
    COALESCE(total_reservations, 0) as total_reservations,
    COALESCE(total_matches, 0) as total_matches,
    peak_hour
FROM daily_statistics
WHERE stat_date = CURRENT_DATE;

-- 뷰: 활성 QR 세션
CREATE OR REPLACE VIEW active_qr_sessions AS
SELECT 
    session_id,
    qr_url,
    created_at,
    expires_at,
    used_count,
    last_used_at
FROM qr_sessions
WHERE is_active = TRUE 
AND expires_at > NOW()
ORDER BY created_at DESC;

-- 코멘트 추가
COMMENT ON TABLE settings IS '배드민턴장 환경설정 정보';
COMMENT ON TABLE qr_sessions IS 'QR 코드 세션 로그 및 추적';
COMMENT ON TABLE daily_statistics IS '일별 시스템 사용 통계';
COMMENT ON COLUMN qr_sessions.used_count IS '해당 QR 코드를 스캔한 사용자 수';
COMMENT ON COLUMN daily_statistics.peak_hour IS '가장 바쁜 시간대 (0-23)';
