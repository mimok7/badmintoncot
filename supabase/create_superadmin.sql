-- Create or promote an email user as a superadmin.
-- Set the password only for the current SQL session; never commit it here:
-- select set_config('app.initial_password', '<temporary-password>', false);

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

  update public.profiles
  set role = 'superadmin', updated_at = now()
  where user_id = target_user_id;
end;
$$;

select u.email, p.role
from auth.users u
left join public.profiles p on p.user_id = u.id
where lower(u.email) = lower('kys@hyojacho.es.kr');
