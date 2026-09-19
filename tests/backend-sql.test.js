import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres migration enforces owner isolation, private storage and revision conflicts', async () => {
  const db = new PGlite();
  const alice = '11111111-1111-4111-8111-111111111111';
  const bob = '22222222-2222-4222-8222-222222222222';
  const payload = { version: 1, trip: null, entries: [] };
  try {
    // Minimal Supabase-provided schemas; execute the real application migration.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id bigint generated always as identity, bucket_id text, name text);
      create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select, insert, update, delete on storage.objects to authenticated;
      grant usage on all sequences in schema storage to authenticated;
      insert into auth.users values ('${alice}'), ('${bob}');
    `);
    await db.exec(await readFile(new URL('../supabase/migrations/202609190001_cloud_workspace.sql', import.meta.url), 'utf8'));
    const login = async user => {
      await db.exec('reset role');
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user || '']);
      await db.exec(`set role ${user ? 'authenticated' : 'anon'}`);
    };
    const save = (user, revision, value = payload) => db.query('select public.save_workspace($1::uuid, $2::bigint, $3::jsonb) as revision', [user, revision, JSON.stringify(value)]);
    await login(null);
    await assert.rejects(save(alice, 0), /permission denied/);
    await assert.rejects(db.query('select * from public.user_workspaces'), /permission denied/);
    await login(alice);
    assert.equal((await save(alice, 0)).rows[0].revision, 1);
    await assert.rejects(save(alice, 0), /Workspace changed/);
    await assert.rejects(save(bob, 1), /Account changed/);
    await assert.rejects(db.query("update public.user_workspaces set revision = 100"), /permission denied/);
    await assert.rejects(save(alice, 1, { trip: null, entries: [] }), /workspace_shape/);
    assert.equal((await save(alice, 1)).rows[0].revision, 2);
    await assert.rejects(save(alice, 1), /Workspace changed/);
    await db.query('insert into storage.objects(bucket_id, name) values ($1,$2)', ['journal-photos', `${alice}/photo.jpeg`]);
    const withPhoto = { ...payload, entries: [{ photos: [{ path: `${alice}/photo.jpeg` }] }] };
    assert.equal((await save(alice, 2, withPhoto)).rows[0].revision, 3);
    await assert.rejects(save(alice, 3, { ...payload, entries: [{ photos: [{ path: `${alice}/missing.jpeg` }] }] }), /Invalid photo reference/);
    await assert.rejects(db.query('insert into storage.objects(bucket_id, name) values ($1,$2)', ['journal-photos', `${bob}/photo.jpeg`]), /row-level security/);
    await login(bob);
    assert.equal((await db.query('select * from public.user_workspaces')).rows.length, 0);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 0);
    await assert.rejects(save(bob, 0, { ...payload, entries: [{ photos: [{ path: `${alice}/photo.jpeg` }] }] }), /Invalid photo reference/);
    assert.equal((await save(bob, 0)).rows[0].revision, 1);
    await login(alice);
    assert.equal((await db.query('select * from public.user_workspaces')).rows.length, 1);
    assert.equal((await db.query('select * from storage.objects')).rows.length, 1);
    assert.equal((await db.query('delete from storage.objects returning *')).rows.length, 0);
  } finally { await db.close(); }
});
