-- 최고 관리자 초기 비밀번호를 한 번만 설정하는 관리자용 SQL입니다.
-- Supabase SQL Editor에서 실행하세요. 실행 후 /admin/login에서
-- admin_users의 최고 관리자 이메일과 bad123!로 로그인한 뒤 즉시 변경하세요.
-- 이 파일을 웹앱이나 클라이언트 코드에서 실행하지 마세요.

create extension if not exists pgcrypto;

do $$
declare
  v_updated integer;
begin
  update auth.users u
  set encrypted_password = crypt('bad123!', gen_salt('bf', 10)),
      email_confirmed_at = coalesce(u.email_confirmed_at, now()),
      updated_at = now()
  from public.admin_users au
  where au.auth_user_id = u.id
    and au.role = 'superadmin';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception '연결된 최고 관리자 Auth 계정을 찾지 못했습니다. admin_users.auth_user_id와 Auth 사용자를 먼저 연결하세요.';
  end if;
end $$;

select au.email, au.role, au.auth_user_id
from public.admin_users au
where au.role = 'superadmin'
order by au.id;
