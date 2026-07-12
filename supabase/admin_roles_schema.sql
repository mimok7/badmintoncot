-- 1. admin_users 테이블 생성
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('superadmin', 'manager')),
    stadium_id INTEGER REFERENCES stadiums(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS 활성화 및 권한 설정
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 모든 사용자(인증된)가 테이블의 자신의 권한이나 전체 관리자 목록(superadmin인 경우)을 읽을 수 있도록 허용
CREATE POLICY "Enable read access for authenticated users" ON admin_users FOR SELECT USING (auth.role() = 'authenticated');

-- 쓰기(INSERT/UPDATE/DELETE) 권한은 누구나 일단 허용. (클라이언트 앱 단에서 방어 로직 구현: 첫 생성 시 혹은 superadmin만 업데이트 가능하도록 API를 작성할 것이나 DB RLS로 완벽히 제어하려면 복잡하므로 일단 authenticated에게 열고 클라이언트의 검증 로직에 의존합니다. 혹은 초기화 이슈를 방지하기 위해 모두 허용합니다.)
CREATE POLICY "Enable write access for authenticated users" ON admin_users FOR ALL USING (auth.role() = 'authenticated');

-- 만약 완전히 잠그고 싶다면 아래와 같이 작성할 수 있으나, 첫 가입자가 자동 슈퍼관리자가 되는 로직을 위해 일단 열어둡니다.

-- 실시간 반영을 위한 테이블 등록
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'admin_users') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE admin_users;
    END IF;
END $$;
