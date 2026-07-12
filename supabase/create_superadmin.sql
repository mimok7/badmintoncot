-- Create or promote an email user as a superadmin.
-- 1) 아래 한 줄의 주석을 해제하고 비밀번호를 입력합니다.
-- 2) 이 파일 전체를 한 번에 실행합니다.
-- 3) 실행 후에는 비밀번호가 포함된 줄을 다시 주석 처리합니다.
-- 비밀번호를 입력한 뒤 앞의 -- 를 삭제하고, 이 파일 전체를 한 번에 실행하세요.
select set_config('app.initial_password', 'saintt8928!', false);

-- Legacy admin schema used by the current /admin page.
create table if not exists public.stadiums (
  id serial primary key,
  name varchar(100) not null,
  address varchar(255),
  latitude double precision,
  longitude double precision,
  radius_meter integer default 500,
  created_at timestamptz default now()
);

insert into public.stadiums (id, name)
values (1, '기본 구장')
on conflict (id) do nothing;

create table if not exists public.admin_users (
  id serial primary key,
  email varchar(255) unique not null,
  role varchar(20) not null check (role in ('superadmin', 'manager')),
  stadium_id integer references public.stadiums(id),
  created_at timestamptz default now()
);

alter table public.admin_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admin_users'
      and policyname = 'authenticated admin users can read roles'
  ) then
    create policy "authenticated admin users can read roles"
      on public.admin_users for select to authenticated using (true);
  end if;
end;
$$;

-- The legacy project may still have a signup trigger that writes to
-- public.profiles. Disable only those profile-dependent auth triggers when
-- that table is absent; otherwise Supabase sign-up returns HTTP 500.
do $$
declare
  trigger_name text;
begin
  if to_regclass('public.profiles') is null then
    for trigger_name in
      select t.tgname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'auth.users'::regclass
        and not t.tgisinternal
        and p.proname in ('handle_new_user_signup', 'handle_new_user')
    loop
      execute format('drop trigger if exists %I on auth.users', trigger_name);
    end loop;
  end if;
end;
$$;

do $$
declare
  target_email text := 'kys@hyojacho.es.kr';
  initial_password text := current_setting('app.initial_password', true);
  target_user_id uuid;
begin
  if nullif(initial_password, '') is null then
    raise exception 'Set app.initial_password for this SQL session before running.';
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

  -- Support both schemas used by this project:
  -- newer member schema: profiles.user_id / profiles.role
  -- legacy admin schema: admin_users.email / admin_users.role
  if to_regclass('public.profiles') is not null then
    update public.profiles
    set role = 'superadmin', updated_at = now()
    where user_id = target_user_id;
  elsif to_regclass('public.admin_users') is not null then
    insert into public.admin_users (email, role)
    values (target_email, 'superadmin')
    on conflict (email) do update
      set role = 'superadmin';
  else
    raise notice 'Auth user created, but no admin role table exists. Apply profiles or admin_users schema to enable admin authorization.';
  end if;
end;
$$;

select u.email, u.raw_user_meta_data ->> 'role' as auth_role
from auth.users u
where lower(u.email) = lower('kys@hyojacho.es.kr');
