-- 최고 관리자는 스키마 마이그레이션 적용 후 /admin/login에서 생성합니다.
--
-- 1. Supabase Auth에 이메일 사용자를 생성하거나 회원가입합니다.
-- 2. 아직 admin_users가 비어 있으면 최초 로그인 사용자가
--    bootstrap_first_superadmin()을 통해 최고 관리자로 등록됩니다.
-- 3. 이후 관리자는 최고 관리자 화면의 "매니저 관리"에서 추가합니다.
--
-- 과거 버전처럼 authenticated 전체에 admin_users 쓰기 권한을 부여하면
-- 누구나 최고 관리자 권한을 만들 수 있으므로 이 파일은 권한을 변경하지 않습니다.

select
  au.id,
  au.email,
  au.role,
  au.stadium_id,
  au.auth_user_id,
  au.created_at
from public.admin_users au
order by au.id;
