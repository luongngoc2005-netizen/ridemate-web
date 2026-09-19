-- Run once in the Supabase SQL editor. No service_role key is used by the app.
begin;

create table public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  payload jsonb not null,
  updated_at timestamptz not null default now(),
  constraint workspace_shape check (
    jsonb_typeof(payload) = 'object'
    and payload @> '{"version":1}'::jsonb
    and payload ?& array['version', 'trip', 'entries']
    and jsonb_typeof(payload->'trip') in ('object', 'null')
    and jsonb_typeof(payload->'entries') = 'array'
    and octet_length(payload::text) <= 5242880
  )
);
alter table public.user_workspaces enable row level security;
revoke all on public.user_workspaces from anon, authenticated;
grant select on public.user_workspaces to authenticated;
create policy "Read own workspace" on public.user_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);

-- All writes use compare-and-swap. Direct table mutations are not granted.
create function public.save_workspace(expected_user_id uuid, expected_revision bigint, new_payload jsonb)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  saved_revision bigint;
  entry jsonb;
  photo jsonb;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if expected_user_id is distinct from owner_id then
    raise exception 'Account changed' using errcode = '28000';
  end if;
  if expected_revision is null or expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if new_payload is null or not (new_payload ? 'entries') then
    raise exception 'Invalid workspace' using errcode = '22023';
  end if;
  for entry in select value from jsonb_array_elements(new_payload->'entries') loop
    if jsonb_typeof(entry->'photos') is distinct from 'array' then
      raise exception 'Invalid photos' using errcode = '22023';
    end if;
    if jsonb_array_length(entry->'photos') > 8 then
      raise exception 'Too many photos' using errcode = '22023';
    end if;
    for photo in select value from jsonb_array_elements(entry->'photos') loop
      if photo ? 'src' or jsonb_typeof(photo->'path') is distinct from 'string'
         or split_part(photo->>'path', '/', 1) is distinct from owner_id::text
         or not exists (select 1 from storage.objects where bucket_id = 'journal-photos' and name = photo->>'path') then
        raise exception 'Invalid photo reference' using errcode = '22023';
      end if;
    end loop;
  end loop;
  if expected_revision = 0 then
    insert into public.user_workspaces(user_id, payload)
    values (owner_id, new_payload)
    on conflict (user_id) do nothing
    returning revision into saved_revision;
  else
    update public.user_workspaces
    set payload = new_payload, revision = revision + 1, updated_at = now()
    where user_id = owner_id and revision = expected_revision
    returning revision into saved_revision;
  end if;
  if saved_revision is null then
    raise exception 'Workspace changed on another device' using errcode = '40001';
  end if;
  return saved_revision;
end;
$$;
revoke all on function public.save_workspace(uuid, bigint, jsonb) from public, anon;
grant execute on function public.save_workspace(uuid, bigint, jsonb) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('journal-photos', 'journal-photos', false, 10485760, array['image/jpeg','image/png','image/webp']);
create policy "Read own journal photos" on storage.objects
  for select to authenticated using (
    bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
create policy "Upload own journal photos" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'journal-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  );
-- Objects are immutable. Old uploads are retained so a failed/ambiguous save
-- or a concurrent download can never leave a saved workspace without photos.
commit;
