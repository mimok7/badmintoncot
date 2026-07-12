-- reservations 테이블 제약조건/외래키 정리 스크립트
-- 목적: member_id 레거시 참조 제거, user_id로 통일

BEGIN;

-- 1) 잘못된 외래 키/유니크 제약 삭제 (member_id 기반)
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_member_id_fkey;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_court_id_member_id_key;
ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_court_id_member_id_idx;

-- 2) 올바른 외래 키 추가 (user_id → members.id)
ALTER TABLE reservations
ADD CONSTRAINT reservations_user_id_fkey
FOREIGN KEY (user_id) REFERENCES members(id) ON DELETE CASCADE;

-- 3) 유니크 제약 재생성 (코트별 중복 예약 방지)
ALTER TABLE reservations
ADD CONSTRAINT reservations_court_id_user_id_key
UNIQUE (court_id, user_id);

COMMIT;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';
