-- RLS(Row Level Security) 정책 설정
-- Supabase에서 익명 사용자가 테이블에 접근할 수 있도록 허용

-- 1. members 테이블 RLS 설정
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable insert for all users" ON members;
DROP POLICY IF EXISTS "Enable read for all users" ON members;

-- 모든 사용자가 회원 정보를 삽입할 수 있도록 허용
CREATE POLICY "Enable insert for all users" ON members
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자가 회원 정보를 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON members
FOR SELECT
TO anon, authenticated
USING (true);

-- 2. entry_sessions 테이블 RLS 설정
ALTER TABLE entry_sessions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable insert for all users" ON entry_sessions;
DROP POLICY IF EXISTS "Enable read for all users" ON entry_sessions;
DROP POLICY IF EXISTS "Enable update for all users" ON entry_sessions;

-- 모든 사용자가 입장 세션을 생성할 수 있도록 허용
CREATE POLICY "Enable insert for all users" ON entry_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자가 입장 세션을 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON entry_sessions
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 입장 세션을 업데이트할 수 있도록 허용
CREATE POLICY "Enable update for all users" ON entry_sessions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 3. courts 테이블 RLS 설정
ALTER TABLE courts ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable read for all users" ON courts;
DROP POLICY IF EXISTS "Enable update for all users" ON courts;

-- 모든 사용자가 코트 정보를 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON courts
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 코트 정보를 업데이트할 수 있도록 허용 (상태 변경용)
CREATE POLICY "Enable update for all users" ON courts
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 4. reservations 테이블 RLS 설정
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable insert for all users" ON reservations;
DROP POLICY IF EXISTS "Enable read for all users" ON reservations;
DROP POLICY IF EXISTS "Enable delete for all users" ON reservations;

-- 모든 사용자가 예약을 생성할 수 있도록 허용
CREATE POLICY "Enable insert for all users" ON reservations
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자가 예약을 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON reservations
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 예약을 삭제할 수 있도록 허용
CREATE POLICY "Enable delete for all users" ON reservations
FOR DELETE
TO anon, authenticated
USING (true);

-- 5. court_usage 테이블 RLS 설정
ALTER TABLE court_usage ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable read for all users" ON court_usage;
DROP POLICY IF EXISTS "Enable insert for all users" ON court_usage;
DROP POLICY IF EXISTS "Enable update for all users" ON court_usage;

-- 모든 사용자가 사용 내역을 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON court_usage
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 사용 내역을 생성할 수 있도록 허용
CREATE POLICY "Enable insert for all users" ON court_usage
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자가 사용 내역을 업데이트할 수 있도록 허용
CREATE POLICY "Enable update for all users" ON court_usage
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 6. settings 테이블 RLS 설정 (schema_additions.sql에서 생성됨)
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable read for all users" ON settings;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON settings;

-- 모든 사용자가 설정을 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON settings
FOR SELECT
TO anon, authenticated
USING (true);

-- 인증된 사용자만 설정을 업데이트할 수 있도록 허용
CREATE POLICY "Enable update for authenticated users" ON settings
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 7. qr_sessions 테이블 RLS 설정 (schema_additions.sql에서 생성됨)
ALTER TABLE qr_sessions ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable read for all users" ON qr_sessions;
DROP POLICY IF EXISTS "Enable insert for all users" ON qr_sessions;
DROP POLICY IF EXISTS "Enable update for all users" ON qr_sessions;

-- 모든 사용자가 QR 세션을 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON qr_sessions
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 QR 세션을 생성할 수 있도록 허용
CREATE POLICY "Enable insert for all users" ON qr_sessions
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 모든 사용자가 QR 세션을 업데이트할 수 있도록 허용
CREATE POLICY "Enable update for all users" ON qr_sessions
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 8. daily_statistics 테이블 RLS 설정 (schema_additions.sql에서 생성됨)
ALTER TABLE daily_statistics ENABLE ROW LEVEL SECURITY;

-- 기존 정책 삭제 (있다면)
DROP POLICY IF EXISTS "Enable read for all users" ON daily_statistics;
DROP POLICY IF EXISTS "Enable insert for all users" ON daily_statistics;
DROP POLICY IF EXISTS "Enable update for all users" ON daily_statistics;

-- 모든 사용자가 통계를 조회할 수 있도록 허용
CREATE POLICY "Enable read for all users" ON daily_statistics
FOR SELECT
TO anon, authenticated
USING (true);

-- 모든 사용자가 통계를 생성/업데이트할 수 있도록 허용 (트리거용)
CREATE POLICY "Enable insert for all users" ON daily_statistics
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON daily_statistics
FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

-- 참고: 프로덕션 환경에서는 보안을 위해 더 세밀한 RLS 정책을 설정해야 합니다.
-- 현재 설정은 개발/테스트 환경을 위한 것입니다.
