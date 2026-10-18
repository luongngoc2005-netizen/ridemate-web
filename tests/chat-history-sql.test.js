import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {emptyChat} from '../src/chat-history-data.js';

test('chat RPC enforces owner isolation, read-only table access, revision conflicts and idempotent saves',async()=>{
 const db=new PGlite();
 const alice='00000000-0000-4000-8000-000000000001',bob='00000000-0000-4000-8000-000000000002',id='00000000-0000-4000-8000-000000000003';
 try{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values ('${alice}'),('${bob}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;`);
  const sql=await readFile(new URL('../supabase/migrations/202610180002_assistant_conversations.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
  const chat=emptyChat(null,'2026-10-18T12:00:00.000Z',id);
  const auth=async owner=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);await db.exec('set role authenticated');};
  const save=async(owner,payload=chat,revision=0)=>(await db.query('select public.save_assistant_conversation($1,$2,$3,$4) as revision',[owner,id,revision,payload])).rows[0].revision;
  await auth(alice);assert.equal(await save(alice),1);assert.equal(await save(alice),1);
  await assert.rejects(db.query('update public.assistant_conversations set revision=3'),/permission denied/);
  await assert.rejects(db.query('delete from public.assistant_conversations'),/permission denied/);
  await assert.rejects(save(bob),/Account changed/);
  const second={...chat,title:'Hà Nội → Lạng Sơn'};assert.equal(await save(alice,second,1),2);
  await assert.rejects(save(alice,{...second,title:'Bản cũ'},1),/another device/);
  assert.equal(await save(alice,second,1),2);
  await assert.rejects(save(alice,{...chat,id:bob},2),/Invalid chat snapshot/);
  await assert.rejects(save(alice,{...chat,snapshot:{messages:{}}},2),/Invalid chat snapshot/);
  await auth(bob);assert.equal((await db.query('select * from public.assistant_conversations')).rows.length,0);assert.equal(await save(bob),1);
  await auth(alice);assert.equal((await db.query('select * from public.assistant_conversations')).rows.length,1);
  assert.equal(await save(alice,{...second,deleted:true},2),3);
  await db.exec('reset role;set role anon');await assert.rejects(save(alice),/permission denied/);await assert.rejects(db.query('select * from public.assistant_conversations'),/permission denied/);
 }finally{await db.close();}
});
