import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('persistent SQL quota enforces per-user/global limits, reset, permissions and rerunnable migration',async()=>{
  const db=new PGlite(),alice='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;`);
    const sql=await readFile(new URL('../supabase/migrations/202609300001_ai_quota.sql',import.meta.url),'utf8');await db.exec(sql);
    const login=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${id?'authenticated':'anon'}`);};
    const consume=async()=> (await db.query('select public.consume_ai_quota() as allowed')).rows[0].allowed;
    await login(null);await assert.rejects(consume(),/permission denied/);
    await login(alice);await assert.rejects(db.query('select * from public.ai_usage_counters'),/permission denied/);
    const burst=await Promise.all(Array.from({length:12},()=>consume()));assert.equal(burst.filter(Boolean).length,10);
    await login(bob);assert.equal(await consume(),true);
    await db.exec('reset role');await db.query("update public.ai_usage_counters set started_at=started_at-interval '2 minutes' where subject=$1 and bucket='minute'",[alice]);
    await login(alice);assert.equal(await consume(),true);
    await db.exec('reset role');await db.query("update public.ai_usage_counters set used=49 where subject=$1 and bucket='day'",[alice]);
    await login(alice);assert.equal(await consume(),true);assert.equal(await consume(),false);
    await db.exec('reset role');const before=(await db.query('select * from public.ai_usage_counters order by subject,bucket')).rows;
    await db.exec(sql);assert.deepEqual((await db.query('select * from public.ai_usage_counters order by subject,bucket')).rows,before);
    await db.exec("update public.ai_usage_counters set used=500 where subject='global'");await login(bob);assert.equal(await consume(),false);
    await db.exec('reset role');await db.exec("update public.ai_usage_counters set started_at=started_at-interval '1 day'");
    await login(alice);assert.equal(await consume(),true);
    await assert.rejects(db.query('update public.ai_usage_counters set used=0'),/permission denied/);
  }finally{await db.close();}
});
