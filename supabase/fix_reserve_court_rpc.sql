-- reserve_court_at_stadium RPC가 404로 조회되지 않을 때 실행하세요.
-- Supabase SQL Editor에서 전체 실행 후 앱을 새로고침합니다.

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

revoke execute on function public.reserve_court_at_stadium(
  uuid, uuid, integer, integer, integer, double precision, double precision, double precision
) from public;
grant execute on function public.reserve_court_at_stadium(
  uuid, uuid, integer, integer, integer, double precision, double precision, double precision
) to anon, authenticated;

notify pgrst, 'reload schema';
