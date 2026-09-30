-- Run in Supabase SQL Editor before enabling the production AI endpoint.
-- Stores counters only: no messages, plan contents, tokens or API keys.
begin;
create table if not exists public.ai_usage_counters (
  subject text not null,
  bucket text not null check (bucket in ('minute','day')),
  started_at timestamptz not null,
  used integer not null default 0 check (used >= 0),
  primary key (subject,bucket)
);
alter table public.ai_usage_counters enable row level security;
revoke all on public.ai_usage_counters from public,anon,authenticated;

create or replace function public.consume_ai_quota()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  stamp timestamptz := clock_timestamp();
  minute_start timestamptz;
  day_start timestamptz;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode='28000'; end if;
  minute_start := date_trunc('minute',stamp);
  day_start := date_trunc('day',stamp at time zone 'UTC') at time zone 'UTC';
  -- One transaction reserves all three budgets across all server instances.
  perform pg_advisory_xact_lock(2026093001);
  delete from public.ai_usage_counters where started_at < day_start - interval '2 days';
  insert into public.ai_usage_counters(subject,bucket,started_at,used) values
    (owner_id::text,'minute',minute_start,0),
    (owner_id::text,'day',day_start,0),
    ('global','day',day_start,0)
  on conflict (subject,bucket) do update
    set started_at=excluded.started_at,used=0
    where public.ai_usage_counters.started_at <> excluded.started_at;
  if exists (
    select 1 from public.ai_usage_counters
    where (subject=owner_id::text and bucket='minute' and used>=10)
       or (subject=owner_id::text and bucket='day' and used>=50)
       or (subject='global' and bucket='day' and used>=500)
  ) then return false; end if;
  update public.ai_usage_counters set used=used+1
    where subject=owner_id::text or (subject='global' and bucket='day');
  return true;
end;
$$;
revoke all on function public.consume_ai_quota() from public,anon;
grant execute on function public.consume_ai_quota() to authenticated;
notify pgrst,'reload schema';
commit;
