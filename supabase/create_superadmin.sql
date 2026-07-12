-- Legacy schema repair for the current /admin page.
-- This file does not create or modify any Auth account or password.

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

grant select, insert, update, delete on public.admin_users to authenticated;
grant usage, select on sequence public.admin_users_id_seq to authenticated;

do $$
begin
  drop policy if exists "Enable read access for authenticated users" on public.admin_users;
  drop policy if exists "Enable write access for authenticated users" on public.admin_users;
  drop policy if exists "authenticated users can read admin roles" on public.admin_users;
  drop policy if exists "authenticated users can manage admin roles" on public.admin_users;
  drop policy if exists "authenticated admin users can read roles" on public.admin_users;
  drop policy if exists "authenticated admin users can manage roles" on public.admin_users;

  create policy "authenticated admin users can read roles"
    on public.admin_users for select to authenticated using (true);

  create policy "authenticated admin users can manage roles"
    on public.admin_users for all to authenticated
    using (true) with check (true);
end;
$$;

-- Repair the legacy statistics trigger. The old ON CONFLICT(stat_date)
-- clause fails after stadium-scoped unique constraints are introduced.
create or replace function public.update_daily_statistics()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'entry_sessions' and tg_op = 'INSERT' then
    update public.daily_statistics
    set total_entries = coalesce(total_entries, 0) + 1, updated_at = now()
    where stat_date = current_date;
    if not found then
      begin
        insert into public.daily_statistics (stat_date, total_entries)
        values (current_date, 1);
      exception when unique_violation then
        update public.daily_statistics
        set total_entries = coalesce(total_entries, 0) + 1, updated_at = now()
        where stat_date = current_date;
      end;
    end if;
  elsif tg_table_name = 'reservations' and tg_op = 'INSERT' then
    update public.daily_statistics
    set total_reservations = coalesce(total_reservations, 0) + 1, updated_at = now()
    where stat_date = current_date;
    if not found then
      begin
        insert into public.daily_statistics (stat_date, total_reservations)
        values (current_date, 1);
      exception when unique_violation then
        update public.daily_statistics
        set total_reservations = coalesce(total_reservations, 0) + 1, updated_at = now()
        where stat_date = current_date;
      end;
    end if;
  elsif tg_table_name = 'court_usage' and tg_op = 'INSERT' then
    update public.daily_statistics
    set total_matches = coalesce(total_matches, 0) + 1, updated_at = now()
    where stat_date = current_date;
    if not found then
      begin
        insert into public.daily_statistics (stat_date, total_matches)
        values (current_date, 1);
      exception when unique_violation then
        update public.daily_statistics
        set total_matches = coalesce(total_matches, 0) + 1, updated_at = now()
        where stat_date = current_date;
      end;
    end if;
  end if;
  return new;
end;
$$;
