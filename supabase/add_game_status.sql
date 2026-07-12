-- reservations 테이블에 상태 컬럼 추가
ALTER TABLE reservations 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'waiting';
-- status: 'waiting' (대기중), 'confirmed' (확정-다음경기대기), 'playing' (경기중)

ALTER TABLE reservations
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP WITH TIME ZONE;

-- 코트별 현재 경기중인 팀을 추적하는 컬럼 추가
ALTER TABLE courts
ADD COLUMN IF NOT EXISTS current_playing_team INTEGER;

-- 팀이 4명이 되면 자동으로 confirmed 상태로 변경하는 함수
CREATE OR REPLACE FUNCTION auto_confirm_team()
RETURNS TRIGGER AS $$
DECLARE
    team_count INTEGER;
    court_has_playing BOOLEAN;
    earliest_waiting_team INTEGER;
BEGIN
    -- 해당 코트의 해당 팀 인원 수 확인
    SELECT COUNT(*) INTO team_count
    FROM reservations
    WHERE court_id = NEW.court_id 
    AND team_number = NEW.team_number
    AND status IN ('waiting', 'confirmed', 'playing');
    
    -- 4명이 되면 자동으로 confirmed 상태로 변경
    IF team_count = 4 THEN
        -- 해당 코트에 이미 playing 상태 팀이 있는지 확인
        SELECT EXISTS(
            SELECT 1 FROM reservations 
            WHERE court_id = NEW.court_id AND status = 'playing'
        ) INTO court_has_playing;
        
        IF NOT court_has_playing THEN
            -- playing 팀이 없으면 바로 playing으로 변경
            UPDATE reservations
            SET status = 'playing', confirmed_at = NOW()
            WHERE court_id = NEW.court_id 
            AND team_number = NEW.team_number
            AND status = 'waiting';
            
            UPDATE courts
            SET current_playing_team = NEW.team_number
            WHERE id = NEW.court_id;
        ELSE
            -- playing 팀이 있으면 confirmed로 변경
            UPDATE reservations
            SET status = 'confirmed', confirmed_at = NOW()
            WHERE court_id = NEW.court_id 
            AND team_number = NEW.team_number
            AND status = 'waiting';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS auto_confirm_team_trigger ON reservations;
CREATE TRIGGER auto_confirm_team_trigger
AFTER INSERT ON reservations
FOR EACH ROW
EXECUTE FUNCTION auto_confirm_team();

-- 경기 종료 함수
CREATE OR REPLACE FUNCTION end_game(p_court_id INTEGER, p_user_id UUID)
RETURNS JSON AS $$
DECLARE
    v_team_number INTEGER;
    v_next_team INTEGER;
    v_result JSON;
BEGIN
    -- 현재 사용자의 팀 번호 확인 (playing 상태인지 체크)
    SELECT team_number INTO v_team_number
    FROM reservations
    WHERE court_id = p_court_id 
    AND user_id = p_user_id 
    AND status = 'playing';
    
    IF v_team_number IS NULL THEN
        RETURN json_build_object('success', false, 'message', '경기 중인 팀이 아닙니다.');
    END IF;
    
    -- 해당 팀의 모든 예약 삭제
    DELETE FROM reservations
    WHERE court_id = p_court_id 
    AND team_number = v_team_number
    AND status = 'playing';
    
    -- 다음 confirmed 팀 찾기 (가장 먼저 확정된 팀)
    SELECT team_number INTO v_next_team
    FROM reservations
    WHERE court_id = p_court_id 
    AND status = 'confirmed'
    ORDER BY confirmed_at ASC
    LIMIT 1;
    
    IF v_next_team IS NOT NULL THEN
        -- 다음 팀을 playing으로 변경
        UPDATE reservations
        SET status = 'playing'
        WHERE court_id = p_court_id 
        AND team_number = v_next_team;
        
        UPDATE courts
        SET current_playing_team = v_next_team
        WHERE id = p_court_id;
        
        v_result := json_build_object(
            'success', true, 
            'message', '경기가 종료되었습니다. 다음 팀이 경기를 시작합니다.',
            'next_team', v_next_team
        );
    ELSE
        -- 다음 팀이 없으면 코트를 비움
        UPDATE courts
        SET current_playing_team = NULL
        WHERE id = p_court_id;
        
        v_result := json_build_object(
            'success', true, 
            'message', '경기가 종료되었습니다.',
            'next_team', NULL
        );
    END IF;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
