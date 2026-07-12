-- reservations 테이블에 team_number 컬럼 추가
-- 대기팀 번호 (1, 2, 3...) - 각 코트별로 4명씩 그룹핑
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS team_number INTEGER DEFAULT 1;

-- 기존 UNIQUE 제약 조건 삭제
ALTER TABLE reservations 
DROP CONSTRAINT IF EXISTS reservations_court_id_user_id_key;

-- 새로운 UNIQUE 제약 조건 추가 (같은 코트의 같은 팀에 중복 불가)
ALTER TABLE reservations 
ADD CONSTRAINT reservations_court_id_team_number_user_id_key 
UNIQUE(court_id, team_number, user_id);

-- 코트당 한 사용자는 하나의 팀에만 속할 수 있도록 추가 제약
-- (다른 팀 번호로 중복 신청 방지)
CREATE UNIQUE INDEX IF NOT EXISTS reservations_court_user_unique 
ON reservations(court_id, user_id);

-- 각 팀은 최대 4명까지만 가능하도록 체크 (트리거 함수 수정)
CREATE OR REPLACE FUNCTION check_team_count()
RETURNS TRIGGER AS $$
DECLARE
    team_count INTEGER;
BEGIN
    -- 해당 코트의 해당 팀 인원 수 확인
    SELECT COUNT(*) INTO team_count
    FROM reservations
    WHERE court_id = NEW.court_id AND team_number = NEW.team_number;
    
    IF team_count >= 4 THEN
        RAISE EXCEPTION '해당 대기팀은 이미 4명으로 마감되었습니다.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성 (기존 트리거 삭제 후 재생성)
DROP TRIGGER IF EXISTS check_team_count_trigger ON reservations;
CREATE TRIGGER check_team_count_trigger
BEFORE INSERT ON reservations
FOR EACH ROW
EXECUTE FUNCTION check_team_count();

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
