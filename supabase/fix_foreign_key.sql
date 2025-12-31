-- entry_sessions 테이블 외래 키 수정
-- user_id가 users 테이블이 아닌 members 테이블을 참조하도록 변경

-- 1. 기존 외래 키 제약 조건 삭제
ALTER TABLE entry_sessions 
DROP CONSTRAINT IF EXISTS entry_sessions_user_id_fkey;

-- 2. members 테이블을 참조하는 새 외래 키 추가
ALTER TABLE entry_sessions 
ADD CONSTRAINT entry_sessions_user_id_fkey 
FOREIGN KEY (user_id) REFERENCES members(id) ON DELETE CASCADE;

-- 3. 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

-- 확인: 외래 키 제약 조건 조회
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
    AND tc.table_name = 'entry_sessions';
