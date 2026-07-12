-- Create or promote an email user as a superadmin.
-- 1) 아래 한 줄의 주석을 해제하고 비밀번호를 입력합니다.
-- 2) 이 파일 전체를 한 번에 실행합니다.
-- 3) 실행 후에는 비밀번호가 포함된 줄을 다시 주석 처리합니다.
-- 비밀번호를 입력한 뒤 앞의 -- 를 삭제하고, 이 파일 전체를 한 번에 실행하세요.
select set_config('app.initial_password', 'saintt7449!', false);

do $$
declare
  target_email text := 'kys@hyojacho.es.kr';
  initial_password text := current_setting('app.initial_password', true);
  target_user_id uuid;
begin
  if nullif(initial_password, '') is null then
    raise exception 'Set app.initial_password for this SQL session before running.';
  end if;

  if to_regclass('public.profiles') is null then
    raise exception 'public.profiles does not exist. Select the app Supabase project or apply the profiles schema first.';
  end if;

  select id into target_user_id
  from auth.users
  where lower(email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    target_user_id := gen_random_uuid();

    insert into auth.users (
      id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      target_user_id, 'authenticated', 'authenticated', target_email,
      crypt(initial_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"role":"superadmin"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, created_at, updated_at
    ) values (
      target_email, target_user_id,
      jsonb_build_object('sub', target_user_id::text, 'email', target_email),
      'email', now(), now()
    );
  else
    update auth.users
    set encrypted_password = crypt(initial_password, gen_salt('bf')),
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"role":"superadmin"}'::jsonb,
        updated_at = now()
    where id = target_user_id;
  end if;

  update public.profiles
  set role = 'superadmin', updated_at = now()
  where user_id = target_user_id;
end;
$$;

select u.email, p.role
from auth.users u
left join public.profiles p on p.user_id = u.id
where lower(u.email) = lower('kys@hyojacho.es.kr');
