begin;

-- 위치/권한 헬퍼는 Data API에 노출되지 않는 스키마에 둔다.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- 기존 settings 값을 stadiums의 누락된 기본 정보에 한 번만 보완한다.
update public.stadiums s
set
  name = coalesce(nullif(btrim(s.name), ''), nullif(btrim(st.venue_name), ''), '이름 미지정 구장'),
  latitude = coalesce(s.latitude, st.location_lat),
  longitude = coalesce(s.longitude, st.location_lng),
  radius_meter = coalesce(s.radius_meter, st.location_radius, 100)
from public.settings st
where st.stadium_id = s.id;

alter table public.stadiums
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.stadiums
set address = coalesce(nullif(btrim(address), ''), '주소 미지정'),
    radius_meter = coalesce(radius_meter, 100),
    is_active = coalesce(is_active, true),
    updated_at = coalesce(updated_at, now());

alter table public.stadiums
  alter column name set not null,
  alter column address set not null,
  alter column latitude set not null,
  alter column longitude set not null,
  alter column radius_meter set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stadiums_latitude_check'
      and conrelid = 'public.stadiums'::regclass
  ) then
    alter table public.stadiums
      add constraint stadiums_latitude_check check (latitude between -90 and 90);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'stadiums_longitude_check'
      and conrelid = 'public.stadiums'::regclass
  ) then
    alter table public.stadiums
      add constraint stadiums_longitude_check check (longitude between -180 and 180);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'stadiums_radius_meter_check'
      and conrelid = 'public.stadiums'::regclass
  ) then
    alter table public.stadiums
      add constraint stadiums_radius_meter_check check (radius_meter between 10 and 5000);
  end if;
end $$;

-- settings를 구장 운영 설정 전용 1:1 테이블로 정규화한다.
drop table if exists public.stadium_settings cascade;
create table public.stadium_settings (
  stadium_id integer primary key references public.stadiums(id) on delete restrict,
  operating_hours text not null default '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00',
  contact_info text not null default '전화번호 미등록',
  rules text not null default '',
  court_count smallint not null default 8 check (court_count between 1 and 100),
  duration_minutes smallint not null default 120 check (duration_minutes between 10 and 1440),
  updated_at timestamptz not null default now()
);

insert into public.stadium_settings (
  stadium_id, operating_hours, contact_info, rules, court_count, duration_minutes, updated_at
)
select
  s.id,
  coalesce(st.operating_hours, '평일: 06:00 - 23:00 | 주말: 07:00 - 22:00'),
  coalesce(st.contact_info, '전화번호 미등록'),
  btrim(regexp_replace(coalesce(st.rules, ''), E'\\s*\\[court_count:.*$', '', 's')),
  greatest(1, least(100, coalesce(st.court_count, 8)))::smallint,
  greatest(10, least(1440, coalesce(st.duration_minutes, 120)))::smallint,
  coalesce(st.updated_at, now())
from public.stadiums s
left join public.settings st on st.stadium_id = s.id;

drop table public.settings cascade;

-- QR은 최초 사이트 접속/설치 링크에서만 사용한다. 입장용 QR 데이터는 제거한다.
drop view if exists public.active_qr_sessions;
drop trigger if exists trigger_log_qr_usage on public.entry_sessions;
drop function if exists public.log_qr_usage();
alter table public.entry_sessions drop column if exists qr_session_id;
drop table if exists public.qr_sessions cascade;

-- 서비스 전 단계이므로 사용자/입장/예약/사용 통계는 새 보안 모델에 맞춰 초기화한다.
do $$
declare
  target_tables text;
begin
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
  into target_tables
  from pg_tables
  where schemaname = 'public'
    and tablename in ('reservations', 'entry_sessions', 'court_usage', 'daily_statistics', 'members');

  if target_tables is not null then
    execute 'truncate table ' || target_tables || ' restart identity cascade';
  end if;
end $$;

-- 브라우저 로컬 UUID만으로 다른 회원을 사칭할 수 없도록 기기 비밀 토큰을 추가한다.
alter table public.members
  add column if not exists access_token uuid;
update public.members set access_token = pg_catalog.gen_random_uuid() where access_token is null;
alter table public.members
  alter column access_token set default pg_catalog.gen_random_uuid(),
  alter column access_token set not null;
create unique index if not exists members_access_token_uidx on public.members(access_token);

-- 다중 구장 데이터가 실수로 1번 구장에 들어가지 않도록 DEFAULT 1을 제거한다.
alter table public.clubs alter column stadium_id drop default;
alter table public.courts alter column stadium_id drop default;
alter table public.entry_sessions alter column stadium_id drop default;
alter table public.reservations alter column stadium_id drop default;
alter table public.court_usage alter column stadium_id drop default;
alter table public.daily_statistics alter column stadium_id drop default;

do $$
declare
  v_default_stadium integer;
begin
  select min(id) into v_default_stadium from public.stadiums;
  if v_default_stadium is null then
    raise exception '최소 한 개의 구장이 필요합니다.';
  end if;
  update public.clubs set stadium_id = v_default_stadium where stadium_id is null;
  update public.courts set stadium_id = v_default_stadium where stadium_id is null;
end $$;

alter table public.clubs alter column stadium_id set not null;
alter table public.courts alter column stadium_id set not null;
alter table public.entry_sessions alter column stadium_id set not null;
alter table public.reservations alter column stadium_id set not null;
alter table public.court_usage alter column stadium_id set not null;
alter table public.daily_statistics alter column stadium_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'courts_stadium_name_unique'
      and conrelid = 'public.courts'::regclass
  ) then
    alter table public.courts
      add constraint courts_stadium_name_unique unique(stadium_id, name);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_statistics_stadium_date_unique'
      and conrelid = 'public.daily_statistics'::regclass
  ) then
    alter table public.daily_statistics
      add constraint daily_statistics_stadium_date_unique unique(stadium_id, stat_date);
  end if;
end $$;

-- 관리자는 이메일 문자열 대신 Auth 사용자 UUID로 식별한다.
alter table public.admin_users add column if not exists auth_user_id uuid references auth.users(id) on delete cascade;
update public.admin_users au
set auth_user_id = u.id
from auth.users u
where au.auth_user_id is null and lower(au.email) = lower(u.email);
create unique index if not exists admin_users_auth_user_id_uidx
  on public.admin_users(auth_user_id) where auth_user_id is not null;
create index if not exists admin_users_stadium_id_idx on public.admin_users(stadium_id);

-- 실제 조회 및 RLS 필터에 맞춘 인덱스.
drop index if exists public.reservations_court_user_unique;
alter table public.reservations drop constraint if exists reservations_court_id_team_number_user_id_key;
create unique index if not exists reservations_stadium_user_uidx
  on public.reservations(stadium_id, user_id);
create index if not exists reservations_stadium_court_team_idx
  on public.reservations(stadium_id, court_id, team_number, status);
create index if not exists entry_sessions_active_member_stadium_idx
  on public.entry_sessions(user_id, stadium_id, expires_at desc)
  where is_active = true;
create index if not exists court_usage_stadium_started_idx
  on public.court_usage(stadium_id, started_at desc);
create index if not exists clubs_stadium_id_idx on public.clubs(stadium_id);
create index if not exists courts_stadium_id_idx on public.courts(stadium_id);

alter table public.entry_sessions alter column id set default pg_catalog.gen_random_uuid();

-- 단일 구장 시절의 4인 즉시 삭제 트리거와 공개 관리자 헬퍼를 제거한다.
drop trigger if exists trigger_check_reservation_count on public.reservations;
drop function if exists public.check_reservation_count();

-- 통계도 반드시 구장별로 집계한다.
create or replace function public.update_daily_statistics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'entry_sessions' and tg_op = 'INSERT' then
    insert into public.daily_statistics as ds(stadium_id, stat_date, total_entries)
    values (new.stadium_id, current_date, 1)
    on conflict (stadium_id, stat_date) do update
    set total_entries = coalesce(ds.total_entries, 0) + 1,
        updated_at = now();
  elsif tg_table_name = 'reservations' and tg_op = 'INSERT' then
    insert into public.daily_statistics as ds(stadium_id, stat_date, total_reservations)
    values (new.stadium_id, current_date, 1)
    on conflict (stadium_id, stat_date) do update
    set total_reservations = coalesce(ds.total_reservations, 0) + 1,
        updated_at = now();
  elsif tg_table_name = 'court_usage' and tg_op = 'INSERT' then
    insert into public.daily_statistics as ds(stadium_id, stat_date, total_matches)
    values (new.stadium_id, current_date, 1)
    on conflict (stadium_id, stat_date) do update
    set total_matches = coalesce(ds.total_matches, 0) + 1,
        updated_at = now();
  end if;
  return new;
end;
$$;

-- updated_at 공통 트리거.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists stadiums_set_updated_at on public.stadiums;
create trigger stadiums_set_updated_at
before update on public.stadiums
for each row execute function private.set_updated_at();

drop trigger if exists stadium_settings_set_updated_at on public.stadium_settings;
create trigger stadium_settings_set_updated_at
before update on public.stadium_settings
for each row execute function private.set_updated_at();

-- 현재 관리자 확인용 내부 함수. SECURITY DEFINER 권한은 내부 조회에만 사용한다.
create or replace function private.current_admin()
returns table(admin_id integer, admin_role text, admin_stadium_id integer)
language sql
stable
security definer
set search_path = ''
as $$
  select au.id, au.role::text, au.stadium_id
  from public.admin_users au
  where au.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function private.is_stadium_admin(p_stadium_id integer, p_superadmin_only boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users au
    where au.auth_user_id = (select auth.uid())
      and (
        au.role = 'superadmin'
        or (not p_superadmin_only and au.role = 'manager' and au.stadium_id = p_stadium_id)
      )
  )
$$;

create or replace function private.assert_member(p_member_id uuid, p_access_token uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.members m
    where m.id = p_member_id and m.access_token = p_access_token
  ) then
    raise exception '회원 인증 정보가 올바르지 않습니다.' using errcode = '28000';
  end if;
end;
$$;

create or replace function private.assert_stadium_location(
  p_stadium_id integer,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision
)
returns double precision
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stadium public.stadiums%rowtype;
  v_distance double precision;
  v_allowed double precision;
begin
  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180
     or p_accuracy is null or p_accuracy < 0 then
    raise exception '현재 위치 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  if p_accuracy >= 100 then
    raise exception 'GPS 정확도가 낮아 신청할 수 없습니다. (오차 %m)', round(p_accuracy::numeric)
      using errcode = '22023';
  end if;

  select * into v_stadium
  from public.stadiums s
  where s.id = p_stadium_id and s.is_active = true;

  if not found then
    raise exception '사용 가능한 구장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  v_distance := 6371000 * acos(
    greatest(-1.0, least(1.0,
      sin(radians(p_latitude)) * sin(radians(v_stadium.latitude))
      + cos(radians(p_latitude)) * cos(radians(v_stadium.latitude))
      * cos(radians(v_stadium.longitude) - radians(p_longitude))
    ))
  );
  v_allowed := v_stadium.radius_meter + least(p_accuracy, 50);

  if v_distance > v_allowed then
    raise exception '구장 밖에서는 이용할 수 없습니다. (거리 %m / 허용 %m)',
      round(v_distance::numeric), round(v_allowed::numeric)
      using errcode = '22023';
  end if;

  return v_distance;
end;
$$;

-- 일반 회원용 읽기/변경 RPC.
create or replace function public.get_member_profile(p_member_id uuid, p_access_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
begin
  perform private.assert_member(p_member_id, p_access_token);
  select * into v_member from public.members where id = p_member_id;
  return jsonb_build_object(
    'id', v_member.id,
    'member_number', v_member.member_number,
    'nickname', v_member.nickname,
    'club_name', v_member.club_name
  );
end;
$$;

create or replace function public.register_member_at_stadium(
  p_nickname text,
  p_club_name text,
  p_stadium_id integer,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.members%rowtype;
  v_session public.entry_sessions%rowtype;
  v_duration integer;
begin
  perform private.assert_stadium_location(p_stadium_id, p_latitude, p_longitude, p_accuracy);
  if nullif(btrim(p_nickname), '') is null or length(btrim(p_nickname)) > 50 then
    raise exception '닉네임은 1~50자로 입력해 주세요.' using errcode = '22023';
  end if;
  if nullif(btrim(p_club_name), '') is not null and not exists (
    select 1 from public.clubs c where c.stadium_id = p_stadium_id and c.name = btrim(p_club_name)
  ) then
    raise exception '선택한 클럽을 찾을 수 없습니다.' using errcode = '22023';
  end if;

  select duration_minutes into v_duration
  from public.stadium_settings where stadium_id = p_stadium_id;

  insert into public.members(nickname, club_name)
  values (btrim(p_nickname), nullif(btrim(p_club_name), ''))
  returning * into v_member;

  insert into public.entry_sessions(id, user_id, stadium_id, entry_at, expires_at, is_active)
  values (
    pg_catalog.gen_random_uuid(), v_member.id, p_stadium_id, now(),
    now() + make_interval(mins => coalesce(v_duration, 120)), true
  )
  returning * into v_session;

  return jsonb_build_object(
    'member', jsonb_build_object(
      'id', v_member.id,
      'member_number', v_member.member_number,
      'nickname', v_member.nickname,
      'club_name', v_member.club_name
    ),
    'access_token', v_member.access_token,
    'session', jsonb_build_object(
      'id', v_session.id,
      'expires_at', v_session.expires_at,
      'is_active', v_session.is_active,
      'stadium_id', v_session.stadium_id
    )
  );
end;
$$;

create or replace function public.enter_stadium_by_location(
  p_member_id uuid,
  p_access_token uuid,
  p_stadium_id integer,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.entry_sessions%rowtype;
  v_duration integer;
begin
  perform private.assert_member(p_member_id, p_access_token);
  perform private.assert_stadium_location(p_stadium_id, p_latitude, p_longitude, p_accuracy);
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text || ':' || p_stadium_id::text, 0));

  select * into v_session
  from public.entry_sessions es
  where es.user_id = p_member_id
    and es.stadium_id = p_stadium_id
    and es.is_active = true
    and es.expires_at > now()
  order by es.entry_at desc
  limit 1;

  if not found then
    update public.entry_sessions
    set is_active = false
    where user_id = p_member_id and is_active = true;

    select duration_minutes into v_duration
    from public.stadium_settings where stadium_id = p_stadium_id;

    insert into public.entry_sessions(id, user_id, stadium_id, entry_at, expires_at, is_active)
    values (
      pg_catalog.gen_random_uuid(), p_member_id, p_stadium_id, now(),
      now() + make_interval(mins => coalesce(v_duration, 120)), true
    )
    returning * into v_session;
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'expires_at', v_session.expires_at,
    'is_active', v_session.is_active,
    'stadium_id', v_session.stadium_id
  );
end;
$$;

create or replace function public.update_member_club(
  p_member_id uuid,
  p_access_token uuid,
  p_club_name text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_member_id, p_access_token);
  if nullif(btrim(p_club_name), '') is null or not exists (
    select 1 from public.clubs c where c.name = btrim(p_club_name)
  ) then
    raise exception '선택한 클럽을 찾을 수 없습니다.' using errcode = '22023';
  end if;
  update public.members set club_name = btrim(p_club_name) where id = p_member_id;
  return true;
end;
$$;

create or replace function public.reserve_court_at_stadium(
  p_member_id uuid,
  p_access_token uuid,
  p_court_id integer,
  p_team_number integer,
  p_stadium_id integer,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_court public.courts%rowtype;
  v_count integer;
  v_member_club text;
  v_team_club text;
  v_reservation public.reservations%rowtype;
begin
  perform private.assert_member(p_member_id, p_access_token);
  perform private.assert_stadium_location(p_stadium_id, p_latitude, p_longitude, p_accuracy);

  if p_team_number is null or p_team_number < 1 or p_team_number > 100 then
    raise exception '신청 팀 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.entry_sessions es
    where es.user_id = p_member_id and es.stadium_id = p_stadium_id
      and es.is_active = true and es.expires_at > now()
  ) then
    raise exception '유효한 구장 입장 기록이 없습니다.' using errcode = '28000';
  end if;

  select * into v_court from public.courts c where c.id = p_court_id for update;
  if not found or v_court.stadium_id <> p_stadium_id or coalesce(v_court.status, 'available') = 'maintenance' then
    raise exception '신청 가능한 코트가 아닙니다.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.reservations r
    where r.stadium_id = p_stadium_id and r.user_id = p_member_id
  ) then
    raise exception '이미 이 구장에 신청 중입니다.' using errcode = '23505';
  end if;

  select m.club_name into v_member_club from public.members m where m.id = p_member_id;
  select m.club_name into v_team_club
  from public.reservations r
  join public.members m on m.id = r.user_id
  where r.court_id = p_court_id and r.team_number = p_team_number
  order by r.created_at
  limit 1;
  if found and v_team_club is distinct from v_member_club then
    raise exception '같은 신청팀에는 동일한 클럽 회원만 신청할 수 있습니다.' using errcode = '22023';
  end if;

  select count(*) into v_count
  from public.reservations r
  where r.court_id = p_court_id and r.team_number = p_team_number
    and r.status in ('waiting', 'confirmed', 'playing');
  if v_count >= 4 then
    raise exception '해당 신청팀은 이미 4명으로 마감되었습니다.' using errcode = '23514';
  end if;

  insert into public.reservations(court_id, user_id, team_number, stadium_id)
  values (p_court_id, p_member_id, p_team_number, p_stadium_id)
  returning * into v_reservation;

  return jsonb_build_object('id', v_reservation.id, 'status', v_reservation.status);
end;
$$;

create or replace function public.cancel_court_reservation(
  p_member_id uuid,
  p_access_token uuid,
  p_court_id integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_member(p_member_id, p_access_token);
  delete from public.reservations
  where user_id = p_member_id and court_id = p_court_id;
  return found;
end;
$$;

drop function if exists public.end_game(integer, uuid);
create or replace function public.end_game_secure(
  p_court_id integer,
  p_member_id uuid,
  p_access_token uuid,
  p_stadium_id integer,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_number integer;
  v_next_team integer;
begin
  perform private.assert_member(p_member_id, p_access_token);
  perform private.assert_stadium_location(p_stadium_id, p_latitude, p_longitude, p_accuracy);
  perform 1 from public.courts c
  where c.id = p_court_id and c.stadium_id = p_stadium_id
  for update;
  if not found then
    raise exception '코트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select team_number into v_team_number
  from public.reservations
  where court_id = p_court_id and user_id = p_member_id and status = 'playing';
  if v_team_number is null then
    return jsonb_build_object('success', false, 'message', '경기 중인 팀이 아닙니다.');
  end if;

  delete from public.reservations
  where court_id = p_court_id and team_number = v_team_number and status = 'playing';

  select team_number into v_next_team
  from public.reservations
  where court_id = p_court_id and status = 'confirmed'
  order by confirmed_at asc nulls last, created_at asc
  limit 1;

  if v_next_team is not null then
    update public.reservations set status = 'playing'
    where court_id = p_court_id and team_number = v_next_team;
  end if;
  update public.courts set current_playing_team = v_next_team where id = p_court_id;

  return jsonb_build_object(
    'success', true,
    'message', case when v_next_team is null
      then '경기가 종료되었습니다.'
      else '경기가 종료되었습니다. 다음 팀이 경기를 시작합니다.' end,
    'next_team', v_next_team
  );
end;
$$;

-- 관리자 RPC.
create or replace function public.get_current_admin()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin record;
begin
  if (select auth.uid()) is null then return null; end if;
  select * into v_admin from private.current_admin();
  if not found then return null; end if;
  return jsonb_build_object('id', v_admin.admin_id, 'role', v_admin.admin_role, 'stadium_id', v_admin.admin_stadium_id);
end;
$$;

create or replace function public.bootstrap_first_superadmin()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text := (select auth.jwt() ->> 'email');
  v_id integer;
begin
  if v_uid is null or nullif(v_email, '') is null then return null; end if;
  lock table public.admin_users in share row exclusive mode;
  if exists (select 1 from public.admin_users) then return null; end if;
  insert into public.admin_users(email, role, stadium_id, auth_user_id)
  values (lower(v_email), 'superadmin', null, v_uid)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'role', 'superadmin', 'stadium_id', null);
end;
$$;

create or replace function public.upsert_admin_user(p_email text, p_role text, p_stadium_id integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth_user_id uuid;
begin
  if not private.is_stadium_admin(null, true) then
    raise exception '최고 관리자만 관리자 계정을 변경할 수 있습니다.' using errcode = '42501';
  end if;
  if p_role not in ('superadmin', 'manager')
     or (p_role = 'manager' and p_stadium_id is null) then
    raise exception '관리자 역할 또는 담당 구장이 올바르지 않습니다.' using errcode = '22023';
  end if;
  select id into v_auth_user_id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
  if v_auth_user_id is null then
    raise exception 'Supabase Auth 사용자를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  insert into public.admin_users(email, role, stadium_id, auth_user_id)
  values (lower(btrim(p_email)), p_role, case when p_role = 'manager' then p_stadium_id else null end, v_auth_user_id)
  on conflict (email) do update
  set role = excluded.role, stadium_id = excluded.stadium_id, auth_user_id = excluded.auth_user_id;
  return true;
end;
$$;

create or replace function public.create_stadium_with_defaults(
  p_name text,
  p_address text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meter integer,
  p_court_count integer default 8
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stadium_id integer;
begin
  if not private.is_stadium_admin(null, true) then
    raise exception '최고 관리자만 구장을 생성할 수 있습니다.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or p_radius_meter not between 10 and 5000
     or p_court_count not between 1 and 100 then
    raise exception '구장 설정 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  insert into public.stadiums(name, address, latitude, longitude, radius_meter)
  values (btrim(p_name), coalesce(nullif(btrim(p_address), ''), '주소 미지정'), p_latitude, p_longitude, p_radius_meter)
  returning id into v_stadium_id;
  insert into public.stadium_settings(stadium_id, court_count) values (v_stadium_id, p_court_count);
  insert into public.courts(stadium_id, name, status)
  select v_stadium_id, '코트 ' || n, 'available' from generate_series(1, p_court_count) n;
  return v_stadium_id;
end;
$$;

create or replace function public.save_stadium_configuration(
  p_stadium_id integer,
  p_name text,
  p_latitude double precision,
  p_longitude double precision,
  p_radius_meter integer,
  p_operating_hours text,
  p_contact_info text,
  p_rules text,
  p_court_count integer,
  p_duration_minutes integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_stadium_admin(p_stadium_id, false) then
    raise exception '이 구장을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180
     or p_radius_meter not between 10 and 5000
     or p_court_count not between 1 and 100
     or p_duration_minutes not between 10 and 1440 then
    raise exception '구장 설정 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  update public.stadiums
  set name = btrim(p_name), latitude = p_latitude, longitude = p_longitude, radius_meter = p_radius_meter
  where id = p_stadium_id;
  if not found then raise exception '구장을 찾을 수 없습니다.' using errcode = 'P0002'; end if;

  insert into public.stadium_settings(
    stadium_id, operating_hours, contact_info, rules, court_count, duration_minutes
  ) values (
    p_stadium_id, coalesce(p_operating_hours, ''), coalesce(p_contact_info, ''),
    coalesce(p_rules, ''), p_court_count, p_duration_minutes
  )
  on conflict (stadium_id) do update set
    operating_hours = excluded.operating_hours,
    contact_info = excluded.contact_info,
    rules = excluded.rules,
    court_count = excluded.court_count,
    duration_minutes = excluded.duration_minutes;

  insert into public.courts(stadium_id, name, status)
  select p_stadium_id, '코트 ' || n, 'available'
  from generate_series(1, p_court_count) n
  on conflict (stadium_id, name) do nothing;
  return true;
end;
$$;

-- 기존 정책을 정리하고 구장 단위 최소 권한 정책을 재구성한다.
do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'stadiums', 'stadium_settings', 'admin_users', 'courts', 'clubs',
        'members', 'entry_sessions', 'reservations', 'court_usage', 'daily_statistics'
      )
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- 기존 RLS 정책이 참조하던 관리자 헬퍼는 정책을 모두 제거한 뒤 삭제한다.
drop function if exists public.get_admin_info();

alter table public.stadiums enable row level security;
alter table public.stadium_settings enable row level security;
alter table public.admin_users enable row level security;
alter table public.courts enable row level security;
alter table public.clubs enable row level security;
alter table public.members enable row level security;
alter table public.entry_sessions enable row level security;
alter table public.reservations enable row level security;
alter table public.court_usage enable row level security;
alter table public.daily_statistics enable row level security;

create policy stadiums_public_read on public.stadiums
for select to anon, authenticated using (is_active = true);
create policy stadium_settings_public_read on public.stadium_settings
for select to anon, authenticated using (true);
create policy courts_public_read on public.courts
for select to anon, authenticated using (true);
create policy courts_admin_update on public.courts
for update to authenticated
using ((select private.is_stadium_admin(stadium_id, false)))
with check ((select private.is_stadium_admin(stadium_id, false)));
create policy clubs_public_read on public.clubs
for select to anon, authenticated using (true);
create policy clubs_admin_insert on public.clubs
for insert to authenticated with check ((select private.is_stadium_admin(stadium_id, false)));
create policy clubs_admin_delete on public.clubs
for delete to authenticated using ((select private.is_stadium_admin(stadium_id, false)));
create policy members_safe_read on public.members
for select to anon, authenticated using (true);
create policy reservations_public_read on public.reservations
for select to anon, authenticated using (true);
create policy reservations_admin_delete on public.reservations
for delete to authenticated using ((select private.is_stadium_admin(stadium_id, false)));
create policy entry_sessions_admin_read on public.entry_sessions
for select to authenticated using ((select private.is_stadium_admin(stadium_id, false)));
create policy court_usage_admin_read on public.court_usage
for select to authenticated using ((select private.is_stadium_admin(stadium_id, false)));
create policy daily_statistics_admin_read on public.daily_statistics
for select to authenticated using ((select private.is_stadium_admin(stadium_id, false)));
create policy admin_users_self_or_superadmin_read on public.admin_users
for select to authenticated
using (auth_user_id = (select auth.uid()) or (select private.is_stadium_admin(null, true)));
create policy admin_users_superadmin_delete on public.admin_users
for delete to authenticated
using ((select private.is_stadium_admin(null, true)) and auth_user_id <> (select auth.uid()));

-- 테이블 권한과 RLS는 별개이므로 Data API 권한도 최소화한다.
revoke all on public.stadium_settings from anon, authenticated;
grant select on public.stadium_settings to anon, authenticated;

revoke insert, update, delete on public.stadiums from anon, authenticated;
grant select on public.stadiums to anon, authenticated;

revoke all on public.members from anon, authenticated;
grant select (id, member_number, nickname, club_name, created_at, last_login_at)
  on public.members to anon, authenticated;

revoke insert, update, delete on public.reservations from anon, authenticated;
grant select on public.reservations to anon, authenticated;
grant delete on public.reservations to authenticated;

revoke all on public.entry_sessions from anon;
revoke insert, update, delete on public.entry_sessions from authenticated;
grant select on public.entry_sessions to authenticated;

grant select on public.courts, public.clubs to anon, authenticated;
revoke insert, delete on public.courts from anon, authenticated;
revoke update on public.courts from anon;
grant update on public.courts to authenticated;
revoke insert, update, delete on public.clubs from anon;
grant insert, delete on public.clubs to authenticated;
grant usage, select on sequence public.clubs_id_seq to authenticated;

revoke all on public.court_usage, public.daily_statistics from anon;
revoke insert, update, delete on public.court_usage, public.daily_statistics from authenticated;
grant select on public.court_usage, public.daily_statistics to authenticated;

grant select, delete on public.admin_users to authenticated;
revoke insert, update on public.admin_users from anon, authenticated;

-- SECURITY DEFINER 함수는 명시적으로 필요한 역할에만 공개한다.
revoke execute on all functions in schema private from public, anon, authenticated;
-- RLS 정책이 호출하는 관리자 판별 함수는 authenticated가 실행할 수 있어야 한다.
-- 함수 자체는 SECURITY DEFINER이며 auth.uid()만 기준으로 판별한다.
grant usage on schema private to authenticated;
grant execute on function private.is_stadium_admin(integer, boolean) to authenticated;
revoke execute on function public.get_member_profile(uuid, uuid) from public;
revoke execute on function public.register_member_at_stadium(text, text, integer, double precision, double precision, double precision) from public;
revoke execute on function public.enter_stadium_by_location(uuid, uuid, integer, double precision, double precision, double precision) from public;
revoke execute on function public.update_member_club(uuid, uuid, text) from public;
revoke execute on function public.reserve_court_at_stadium(uuid, uuid, integer, integer, integer, double precision, double precision, double precision) from public;
revoke execute on function public.cancel_court_reservation(uuid, uuid, integer) from public;
revoke execute on function public.end_game_secure(integer, uuid, uuid, integer, double precision, double precision, double precision) from public;
revoke execute on function public.get_current_admin() from public;
revoke execute on function public.bootstrap_first_superadmin() from public;
revoke execute on function public.upsert_admin_user(text, text, integer) from public;
revoke execute on function public.create_stadium_with_defaults(text, text, double precision, double precision, integer, integer) from public;
revoke execute on function public.save_stadium_configuration(integer, text, double precision, double precision, integer, text, text, text, integer, integer) from public;

grant execute on function public.get_member_profile(uuid, uuid) to anon, authenticated;
grant execute on function public.register_member_at_stadium(text, text, integer, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.enter_stadium_by_location(uuid, uuid, integer, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.update_member_club(uuid, uuid, text) to anon, authenticated;
grant execute on function public.reserve_court_at_stadium(uuid, uuid, integer, integer, integer, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.cancel_court_reservation(uuid, uuid, integer) to anon, authenticated;
grant execute on function public.end_game_secure(integer, uuid, uuid, integer, double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.get_current_admin() to authenticated;
grant execute on function public.bootstrap_first_superadmin() to authenticated;
grant execute on function public.upsert_admin_user(text, text, integer) to authenticated;
grant execute on function public.create_stadium_with_defaults(text, text, double precision, double precision, integer, integer) to authenticated;
grant execute on function public.save_stadium_configuration(integer, text, double precision, double precision, integer, text, text, text, integer, integer) to authenticated;

-- 새 설정 테이블을 Realtime에 등록한다.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'stadium_settings'
     ) then
    alter publication supabase_realtime add table public.stadium_settings;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
