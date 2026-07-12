-- 멀티 구장 지원을 위한 스키마 업데이트

-- 1. stadiums 테이블 생성
CREATE TABLE IF NOT EXISTS stadiums (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    address VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    radius_meter INTEGER DEFAULT 500,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 기본 구장 데이터 추가 (id = 1)
INSERT INTO stadiums (id, name, address, latitude, longitude, radius_meter)
VALUES (1, '기본 구장', '주소 미지정', 37.5665, 126.9780, 500)
ON CONFLICT (id) DO NOTHING;

-- 2. clubs 테이블 (만약 없다면 생성) 및 stadium_id 추가
CREATE TABLE IF NOT EXISTS clubs (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE clubs ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE clubs DROP CONSTRAINT IF EXISTS clubs_name_key;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'clubs_stadium_name_unique') THEN
        ALTER TABLE clubs ADD CONSTRAINT clubs_stadium_name_unique UNIQUE(stadium_id, name);
    END IF;
END $$;

-- 3. courts 테이블 stadium_id 추가 및 제약조건 변경
ALTER TABLE courts ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE courts DROP CONSTRAINT IF EXISTS courts_name_key;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courts_stadium_name_unique') THEN
        ALTER TABLE courts ADD CONSTRAINT courts_stadium_name_unique UNIQUE(stadium_id, name);
    END IF;
END $$;

-- 4. settings 테이블 stadium_id 추가
ALTER TABLE settings ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'settings_stadium_unique') THEN
        ALTER TABLE settings ADD CONSTRAINT settings_stadium_unique UNIQUE(stadium_id);
    END IF;
END $$;

-- 5. 기타 테이블들에 stadium_id 추가
ALTER TABLE entry_sessions ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE qr_sessions ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE court_usage ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;
ALTER TABLE daily_statistics ADD COLUMN IF NOT EXISTS stadium_id INTEGER REFERENCES stadiums(id) DEFAULT 1;

-- 6. daily_statistics 유니크 제약조건 변경
ALTER TABLE daily_statistics DROP CONSTRAINT IF EXISTS daily_statistics_stat_date_key;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_statistics_stadium_date_unique') THEN
        ALTER TABLE daily_statistics ADD CONSTRAINT daily_statistics_stadium_date_unique UNIQUE(stadium_id, stat_date);
    END IF;
END $$;

-- 7. 실시간 기능을 위한 stadiums 테이블 publication 추가
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'stadiums') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE stadiums;
    END IF;
END $$;

-- RLS 활성화 및 권한 설정 (stadiums)
ALTER TABLE stadiums ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON stadiums FOR SELECT USING (true);
CREATE POLICY "Enable write access for authenticated users" ON stadiums FOR ALL USING (auth.role() = 'authenticated');
