-- reserve_court_at_stadium RPC가 404로 조회되지 않을 때 실행하세요.
-- Supabase SQL Editor에서 전체 실행 후 앱을 새로고침합니다.

-- 현재 앱의 예약 RPC가 사용하는 테이블이 누락된 경우 먼저 생성합니다.
-- courts, members, stadiums는 기본/멀티 구장 스키마가 먼저 적용되어 있어야 합니다.
create extension if not exists pgcrypto;

-- 임시 운영 설정: false이면 위치 인증을 건너뛰고 선택한 구장에서 작업합니다.
-- 위치 인증을 다시 켤 때는 아래 값을 true로 변경하세요.
create schema if not exists private;
create table if not exists private.runtime_settings (
  id boolean primary key default true check (id),
  location_check_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into private.runtime_settings (id, location_check_enabled)
values (true, false)
on conflict (id) do nothing;
revoke all on private.runtime_settings from public, anon, authenticated;

create or replace function private.location_check_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rs.location_check_enabled from private.runtime_settings rs where rs.id = true),
    true
  )
$$;

create or replace function public.get_location_check_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.location_check_enabled()
$$;

grant execute on function public.get_location_check_enabled() to anon, authenticated;

create or replace function public.set_location_check_enabled(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_stadium_admin(null, true) then
    raise exception '최고 관리자만 위치기반 제한을 변경할 수 있습니다.' using errcode = '42501';
  end if;

  insert into private.runtime_settings as rs (id, location_check_enabled, updated_at)
  values (true, p_enabled, now())
  on conflict (id) do update
  set location_check_enabled = excluded.location_check_enabled,
      updated_at = excluded.updated_at;
  return p_enabled;
end;
$$;

revoke execute on function public.set_location_check_enabled(boolean) from public;
grant execute on function public.set_location_check_enabled(boolean) to authenticated;

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
  select * into v_stadium
  from public.stadiums s
  where s.id = p_stadium_id and s.is_active = true;

  if not found then
    raise exception '사용 가능한 구장을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if not private.location_check_enabled() then
    return 0;
  end if;

  if p_latitude is null or p_latitude not between -90 and 90
     or p_longitude is null or p_longitude not between -180 and 180
     or p_accuracy is null or p_accuracy < 0 then
    raise exception '현재 위치 값이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_accuracy >= 100 then
    raise exception '위치 정확도가 낮아 신청할 수 없습니다. (오차 %m)', round(p_accuracy::numeric)
      using errcode = '22023';
  end if;

  v_distance := 6371000 * acos(greatest(-1.0, least(1.0,
    sin(radians(p_latitude)) * sin(radians(v_stadium.latitude))
    + cos(radians(p_latitude)) * cos(radians(v_stadium.latitude))
    * cos(radians(v_stadium.longitude) - radians(p_longitude))
  )));
  v_allowed := v_stadium.radius_meter + least(p_accuracy, 50);
  if v_distance > v_allowed then
    raise exception '구장 밖에서는 이용할 수 없습니다. (거리 %m / 허용 %m)',
      round(v_distance::numeric), round(v_allowed::numeric)
      using errcode = '22023';
  end if;

  return v_distance;
end;
$$;

do $$
begin
  if to_regclass('public.reservations') is null then
    if to_regclass('public.courts') is null
       or to_regclass('public.members') is null
       or to_regclass('public.stadiums') is null then
      raise exception '기본 스키마가 누락되었습니다. schema.sql과 multi_stadium_schema.sql을 먼저 실행하세요.';
    end if;

    create table public.reservations (
      id uuid primary key default gen_random_uuid(),
      court_id integer not null references public.courts(id) on delete cascade,
      user_id uuid not null references public.members(id) on delete cascade,
      team_number integer not null default 1,
      stadium_id integer not null references public.stadiums(id) on delete cascade,
      status text not null default 'waiting',
      confirmed_at timestamptz,
      created_at timestamptz not null default now()
    );
  end if;
end $$;

create index if not exists reservations_stadium_court_team_idx
  on public.reservations(stadium_id, court_id, team_number, status);
create unique index if not exists reservations_stadium_user_uidx
  on public.reservations(stadium_id, user_id);

-- 구버전 트리거 함수들은 reservations를 스키마 없이 참조한다.
-- 아래 RPC는 search_path를 비워 실행하므로, 트리거가 남아 있으면
-- INSERT 시 "relation reservations does not exist" 오류가 발생한다.
drop trigger if exists trigger_check_reservation_count on public.reservations;
drop function if exists public.check_reservation_count();
drop trigger if exists check_team_count_trigger on public.reservations;
drop function if exists public.check_team_count();
drop trigger if exists auto_confirm_team_trigger on public.reservations;
drop function if exists public.auto_confirm_team();

-- 팀 정원은 reserve_court_at_stadium에서 코트 행을 잠근 상태로 검사한다.
-- 4명 도달 후 경기 상태 전환만 안전한 스키마 한정 트리거로 유지한다.
create or replace function public.auto_confirm_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_count integer;
  v_court_has_playing boolean;
begin
  select count(*) into v_team_count
  from public.reservations r
  where r.court_id = new.court_id
    and r.team_number = new.team_number
    and r.status in ('waiting', 'confirmed', 'playing');

  if v_team_count = 4 then
    select exists (
      select 1 from public.reservations r
      where r.court_id = new.court_id and r.status = 'playing'
    ) into v_court_has_playing;

    if not v_court_has_playing then
      update public.reservations
      set status = 'playing', confirmed_at = now()
      where court_id = new.court_id
        and team_number = new.team_number
        and status = 'waiting';

      update public.courts
      set current_playing_team = new.team_number
      where id = new.court_id;
    else
      update public.reservations
      set status = 'confirmed', confirmed_at = now()
      where court_id = new.court_id
        and team_number = new.team_number
        and status = 'waiting';
    end if;
  end if;

  return new;
end;
$$;

create trigger auto_confirm_team_trigger
after insert on public.reservations
for each row execute function public.auto_confirm_team();

-- 기존 통계 트리거가 호출하는 함수도 빈 search_path에서 안전하게 동작하도록
-- 모든 테이블을 public 스키마로 한정한다.
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
    where es.user_id = p_member_id
      and es.stadium_id = p_stadium_id
      and es.is_active = true
      and es.expires_at > now()
  ) then
    raise exception '유효한 구장 입장 기록이 없습니다.' using errcode = '28000';
  end if;

  select * into v_court
  from public.courts c
  where c.id = p_court_id
  for update;

  if not found
     or v_court.stadium_id <> p_stadium_id
     or coalesce(v_court.status, 'available') = 'maintenance' then
    raise exception '신청 가능한 코트가 아닙니다.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.reservations r
    where r.stadium_id = p_stadium_id and r.user_id = p_member_id
  ) then
    raise exception '이미 이 구장에 신청 중입니다.' using errcode = '23505';
  end if;

  select m.club_name into v_member_club
  from public.members m
  where m.id = p_member_id;

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
  where r.court_id = p_court_id
    and r.team_number = p_team_number
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

-- PostgREST가 여러 개의 개별 인자 시그니처를 찾지 못해 PGRST202/404를
-- 반환하는 환경을 피하기 위한 단일 JSON 요청 진입점입니다.
create or replace function public.reserve_court_request(p_request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_request is null or jsonb_typeof(p_request) <> 'object' then
    raise exception '신청 요청 값이 올바르지 않습니다.' using errcode = '22023';
  end if;

  return public.reserve_court_at_stadium(
    (p_request ->> 'member_id')::uuid,
    (p_request ->> 'access_token')::uuid,
    (p_request ->> 'court_id')::integer,
    (p_request ->> 'team_number')::integer,
    (p_request ->> 'stadium_id')::integer,
    (p_request ->> 'latitude')::double precision,
    (p_request ->> 'longitude')::double precision,
    (p_request ->> 'accuracy')::double precision
  );
end;
$$;

revoke execute on function public.reserve_court_at_stadium(
  uuid, uuid, integer, integer, integer, double precision, double precision, double precision
) from public;
grant execute on function public.reserve_court_at_stadium(
  uuid, uuid, integer, integer, integer, double precision, double precision, double precision
) to anon, authenticated;

revoke execute on function public.reserve_court_request(jsonb) from public;
grant execute on function public.reserve_court_request(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
