-- 0. 회원 정보 테이블 (임의 회원번호 및 닉네임 관리)
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_number SERIAL UNIQUE, -- 자동 발급되는 고유 회원번호
    nickname VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 1. 코트 정보 테이블
CREATE TABLE IF NOT EXISTS courts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL, -- 코트 1 ~ 코트 8
    status VARCHAR(20) DEFAULT 'available', -- available, occupied, maintenance
    current_users_count INTEGER DEFAULT 0
);

-- 기존 테이블에 UNIQUE 제약 조건이 없을 경우를 대비해 추가
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'courts_name_key') THEN
        ALTER TABLE courts ADD CONSTRAINT courts_name_key UNIQUE (name);
    END IF;
END $$;

-- 초기 코트 데이터 삽입 (8개) - 중복 삽입 방지
INSERT INTO courts (name) VALUES 
('코트 1'), ('코트 2'), ('코트 3'), ('코트 4'), 
('코트 5'), ('코트 6'), ('코트 7'), ('코트 8')
ON CONFLICT (name) DO NOTHING;

-- 2. 입장 세션 테이블 (2시간 제한 관리)
CREATE TABLE IF NOT EXISTS entry_sessions (
    id SERIAL PRIMARY KEY,
    member_id UUID REFERENCES members(id),
    entry_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '2 hours'),
    is_active BOOLEAN DEFAULT TRUE
);

-- 3. 예약 대기 테이블 (4인 매칭)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    court_id INTEGER REFERENCES courts(id),
    member_id UUID REFERENCES members(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(court_id, member_id) -- 한 사용자가 동일 코트에 중복 대기 방지
);

-- 4. 코트 사용 내역 (현재 누가 사용 중인지)
CREATE TABLE IF NOT EXISTS court_usage (
    id SERIAL PRIMARY KEY,
    court_id INTEGER REFERENCES courts(id),
    member_ids UUID[] NOT NULL, -- 4명의 회원 ID 배열
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE
);

-- 실시간 기능을 위한 테이블 복제 설정 (중복 추가 방지)
DO $$ 
BEGIN 
    -- courts 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'courts') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE courts;
    END IF;

    -- reservations 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reservations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE reservations;
    END IF;

    -- entry_sessions 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'entry_sessions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE entry_sessions;
    END IF;

    -- members 테이블 추가
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'members') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE members;
    END IF;
END $$;

-- 5. 4인 매칭 자동 처리 트리거 함수
CREATE OR REPLACE FUNCTION check_reservation_count()
RETURNS TRIGGER AS $$
DECLARE
    res_count INTEGER;
    member_list UUID[];
BEGIN
    -- 현재 코트의 예약 인원 확인
    SELECT COUNT(*), array_agg(member_id) INTO res_count, member_list
    FROM reservations
    WHERE court_id = NEW.court_id;

    -- 4명이 모였을 경우
    IF res_count = 4 THEN
        -- 1. 코트 상태 변경
        UPDATE courts SET status = 'occupied' WHERE id = NEW.court_id;

        -- 2. 사용 내역 추가
        INSERT INTO court_usage (court_id, member_ids)
        VALUES (NEW.court_id, member_list);

        -- 3. 예약 대기 목록에서 삭제
        DELETE FROM reservations WHERE court_id = NEW.court_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 설정
DROP TRIGGER IF EXISTS trigger_check_reservation_count ON reservations;
CREATE TRIGGER trigger_check_reservation_count
AFTER INSERT ON reservations
FOR EACH ROW
EXECUTE FUNCTION check_reservation_count();
