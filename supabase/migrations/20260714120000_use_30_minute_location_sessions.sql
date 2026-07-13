-- 위치 인증 세션은 최초 입장 시점부터 관리자가 설정한 사용시간까지만 유효하다.
-- 앱이 열려 있는 동안에는 약 30분마다 위치를 재인증하지만 만료시각은 연장하지 않는다.

alter table public.stadium_settings
  alter column duration_minutes set default 30;

update public.entry_sessions
set expires_at = least(
  expires_at,
  entry_at + make_interval(mins => coalesce(
    (select ss.duration_minutes from public.stadium_settings ss
     where ss.stadium_id = entry_sessions.stadium_id), 30
  ))
)
where expires_at > entry_at + make_interval(mins => coalesce(
  (select ss.duration_minutes from public.stadium_settings ss
   where ss.stadium_id = entry_sessions.stadium_id), 30
));

create or replace function private.enforce_location_session_duration()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duration integer;
begin
  select coalesce(ss.duration_minutes, 30) into v_duration
  from public.stadium_settings ss
  where ss.stadium_id = new.stadium_id;
  v_duration := greatest(10, least(1440, coalesce(v_duration, 30)));

  if tg_op = 'INSERT' then
    new.expires_at := least(
      coalesce(new.expires_at, new.entry_at + make_interval(mins => v_duration)),
      new.entry_at + make_interval(mins => v_duration)
    );
  else
    new.expires_at := least(
      coalesce(new.expires_at, now() + make_interval(mins => v_duration)),
      now() + make_interval(mins => v_duration)
    );
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_location_session_duration on public.entry_sessions;
create trigger enforce_location_session_duration
before insert or update of entry_at, expires_at on public.entry_sessions
for each row execute function private.enforce_location_session_duration();

-- 이후 작업은 이미 발급된 유효 세션으로 인증한다.
create or replace function private.assert_active_entry_session(
  p_member_id uuid,
  p_stadium_id integer
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.entry_sessions es
    where es.user_id = p_member_id
      and es.stadium_id = p_stadium_id
      and es.is_active = true
      and es.expires_at > now()
  ) then
    raise exception '유효한 위치 인증 세션이 없습니다. 다시 입장해 주세요.'
      using errcode = '28000';
  end if;
end;
$$;

-- 앱이 계속 열려 있는 동안 현재 위치를 다시 확인하는 전용 RPC.
-- 이 함수는 만료시각을 연장하지 않으므로 최초 입장 시점의 사용시간을 초과할 수 없다.
create or replace function public.renew_stadium_location_session(
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
begin
  perform private.assert_member(p_member_id, p_access_token);
  perform private.assert_stadium_location(p_stadium_id, p_latitude, p_longitude, p_accuracy);
  perform pg_advisory_xact_lock(hashtextextended(p_member_id::text || ':' || p_stadium_id::text, 0));

  select * into v_session
  from public.entry_sessions
  where user_id = p_member_id
    and stadium_id = p_stadium_id
    and is_active = true
    and expires_at > now()
  order by entry_at desc
  limit 1;

  if not found then
    raise exception '관리자 설정 사용시간이 만료되었습니다. 다시 입장 인증해 주세요.'
      using errcode = '28000';
  end if;

  return jsonb_build_object(
    'id', v_session.id,
    'expires_at', v_session.expires_at,
    'is_active', v_session.is_active,
    'stadium_id', v_session.stadium_id
  );
end;
$$;

revoke execute on function public.renew_stadium_location_session(
  uuid, uuid, integer, double precision, double precision, double precision
) from public;
grant execute on function public.renew_stadium_location_session(
  uuid, uuid, integer, double precision, double precision, double precision
) to anon, authenticated;

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
  perform private.assert_active_entry_session(p_member_id, p_stadium_id);

  if p_team_number is null or p_team_number < 1 or p_team_number > 100 then
    raise exception '신청 팀 번호가 올바르지 않습니다.' using errcode = '22023';
  end if;

  select * into v_court from public.courts c where c.id = p_court_id for update;
  if not found or v_court.stadium_id <> p_stadium_id
     or coalesce(v_court.status, 'available') = 'maintenance' then
    raise exception '신청 가능한 코트가 아닙니다.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reservations r
             where r.stadium_id = p_stadium_id and r.user_id = p_member_id) then
    raise exception '이미 이 구장에 신청 중입니다.' using errcode = '23505';
  end if;

  select m.club_name into v_member_club from public.members m where m.id = p_member_id;
  select m.club_name into v_team_club
  from public.reservations r join public.members m on m.id = r.user_id
  where r.court_id = p_court_id and r.team_number = p_team_number
  order by r.created_at limit 1;
  if found and v_team_club is distinct from v_member_club then
    raise exception '같은 신청팀에는 동일한 클럽 회원만 신청할 수 있습니다.' using errcode = '22023';
  end if;

  select count(*) into v_count from public.reservations r
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
  perform private.assert_active_entry_session(p_member_id, p_stadium_id);
  perform 1 from public.courts c
  where c.id = p_court_id and c.stadium_id = p_stadium_id for update;
  if not found then
    raise exception '코트를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  select team_number into v_team_number from public.reservations
  where court_id = p_court_id and user_id = p_member_id and status = 'playing';
  if v_team_number is null then
    return jsonb_build_object('success', false, 'message', '경기 중인 팀이 아닙니다.');
  end if;

  delete from public.reservations
  where court_id = p_court_id and team_number = v_team_number and status = 'playing';
  select team_number into v_next_team from public.reservations
  where court_id = p_court_id and status = 'confirmed'
  order by confirmed_at asc nulls last, created_at asc limit 1;
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

notify pgrst, 'reload schema';
