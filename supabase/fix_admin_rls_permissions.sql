-- 이미 정규화 마이그레이션을 실행한 프로젝트에서 관리자 403을 즉시 복구합니다.
-- Supabase SQL Editor에서 실행하세요.

grant usage on schema private to authenticated;
grant execute on function private.is_stadium_admin(integer, boolean) to authenticated;

notify pgrst, 'reload schema';
