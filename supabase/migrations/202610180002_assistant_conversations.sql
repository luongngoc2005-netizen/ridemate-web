-- Private per-account chat snapshots. No service-role key required by the web app.
begin;
create table if not exists public.assistant_conversations (
 user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 payload jsonb not null,
 revision integer not null default 1 check (revision>0),
 updated_at timestamptz not null default now(),
 primary key(user_id,id),
 constraint assistant_conversation_shape check (
  jsonb_typeof(payload)='object' and octet_length(payload::text)<=700000
  and jsonb_typeof(payload->'title')='string' and length(payload->>'title') between 1 and 100
  and jsonb_typeof(payload->'snapshot')='object'
  and jsonb_typeof(payload#>'{snapshot,messages}')='array'
  and jsonb_array_length(payload#>'{snapshot,messages}')<=400
 )
);
create index if not exists assistant_conversations_recent on public.assistant_conversations(user_id,updated_at desc);
alter table public.assistant_conversations enable row level security;
revoke all on public.assistant_conversations from anon,authenticated;
grant select on public.assistant_conversations to authenticated;
drop policy if exists "Read own assistant chats" on public.assistant_conversations;
create policy "Read own assistant chats" on public.assistant_conversations for select to authenticated using ((select auth.uid())=user_id);

create or replace function public.save_assistant_conversation(expected_user_id uuid,conversation_id uuid,expected_revision integer,new_payload jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare owner_id uuid:=auth.uid(); prior public.assistant_conversations%rowtype; result integer;
begin
 if owner_id is null or owner_id is distinct from expected_user_id then raise exception 'Account changed' using errcode='28000';end if;
 if conversation_id is null or expected_revision is null or expected_revision<0 or new_payload is null
  or jsonb_typeof(new_payload) is distinct from 'object' or new_payload->>'id' is distinct from conversation_id::text
  or jsonb_typeof(new_payload->'title') is distinct from 'string' or length(trim(new_payload->>'title')) not between 1 and 100
  or jsonb_typeof(new_payload->'snapshot') is distinct from 'object'
  or jsonb_typeof(new_payload#>'{snapshot,messages}') is distinct from 'array'
  or octet_length(new_payload::text)>700000 then raise exception 'Invalid chat snapshot' using errcode='22023';end if;
 if jsonb_array_length(new_payload#>'{snapshot,messages}')>400 then raise exception 'Chat too long' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('assistant:'||owner_id::text,0));
 select * into prior from public.assistant_conversations where user_id=owner_id and id=conversation_id;
 if found then
  -- An acknowledgement may be lost; retrying an identical save is safe.
  if prior.payload=new_payload then return prior.revision;end if;
  if prior.revision<>expected_revision then raise exception 'Chat changed on another device' using errcode='40001';end if;
  update public.assistant_conversations set payload=new_payload,revision=revision+1,updated_at=now()
   where user_id=owner_id and id=conversation_id returning revision into result;
 else
  if expected_revision<>0 then raise exception 'Chat changed on another device' using errcode='40001';end if;
  if (select count(*) from public.assistant_conversations where user_id=owner_id)>=100 then raise exception 'Chat history limit reached' using errcode='54000';end if;
  insert into public.assistant_conversations(user_id,id,payload) values(owner_id,conversation_id,new_payload) returning revision into result;
 end if;
 return result;
end $$;
revoke all on function public.save_assistant_conversation(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_assistant_conversation(uuid,uuid,integer,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
