begin;

create schema if not exists extensions;
do $$ begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'postgis' and n.nspname <> 'extensions') then
    raise exception 'PostGIS already exists outside schema extensions. Review its schema before applying this migration; do not drop existing spatial data.';
  end if;
end $$;
create extension if not exists postgis with schema extensions;

-- Independent of user workspaces, journals, bookings and GPS history.
create table if not exists public.poi_imports (
  id text primary key,
  source_url text not null,
  source_date text not null,
  expected_count integer not null check (expected_count > 0),
  ready boolean not null default false,
  imported_at timestamptz not null default now()
);
create table if not exists public.osm_pois (
  dataset_id text not null references public.poi_imports(id),
  osm_type text not null check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint not null check (osm_id > 0),
  category text not null check (category in ('fuel', 'rest', 'repair')),
  name text not null check (length(name) between 1 and 300),
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  address text not null default '' check (length(address) <= 600),
  hours text not null default '' check (length(hours) <= 500),
  location extensions.geography(point, 4326) generated always as
    (extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography) stored,
  primary key (dataset_id, osm_type, osm_id)
);
create index if not exists osm_pois_location_idx on public.osm_pois using gist (location);
create index if not exists osm_pois_dataset_category_idx on public.osm_pois (dataset_id, category);
create table if not exists public.poi_catalog (
  singleton boolean primary key default true check (singleton),
  dataset_id text not null references public.poi_imports(id)
);

alter table public.poi_imports enable row level security;
alter table public.osm_pois enable row level security;
alter table public.poi_catalog enable row level security;
revoke all on public.poi_imports, public.osm_pois, public.poi_catalog from public, anon, authenticated;

-- Guests may search public POIs without exposing tables or allowing imports.
-- A new snapshot becomes visible only after its complete import is published.
create or replace function public.nearby_pois(lon double precision, lat double precision, radius_m integer default 2000)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  active_id text;
  active_date text;
  center_point extensions.geography;
  result jsonb;
begin
  if lon is null or lat is null or lon not between -180 and 180 or lat not between -90 and 90
    or radius_m is null or radius_m not between 1 and 2000 then
    raise exception 'Invalid nearby search' using errcode = '22023';
  end if;
  select i.id, i.source_date into active_id, active_date
    from public.poi_catalog c join public.poi_imports i on i.id = c.dataset_id
    where c.singleton and i.ready;
  if active_id is null then return jsonb_build_object('ready', false); end if;
  center_point := extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography;
  with candidates as materialized (
    select found.*, row_number() over (partition by found.category order by found.distance, found.osm_type, found.osm_id) as ordinal
    from (values ('fuel'), ('rest'), ('repair')) as wanted(category)
    cross join lateral (
      select p.osm_type, p.osm_id, p.category, p.name, p.longitude, p.latitude, p.address, p.hours,
        p.location operator(extensions.<->) center_point as distance
      from public.osm_pois p
      where p.dataset_id = active_id and p.category = wanted.category
        and extensions.st_dwithin(p.location, center_point, radius_m)
      order by p.location operator(extensions.<->) center_point, p.osm_type, p.osm_id
      limit 301
    ) found
  )
  select jsonb_build_object(
    'ready', true, 'dataset', active_id, 'sourceDate', active_date,
    'complete', coalesce(bool_and(ordinal <= 300), true),
    'places', coalesce(jsonb_agg(jsonb_build_object(
      'type', osm_type, 'id', osm_id, 'category', category, 'name', name,
      'lon', longitude, 'lat', latitude, 'address', address, 'hours', hours
    ) order by distance, osm_type, osm_id) filter (where ordinal <= 300), '[]'::jsonb)
  ) into result from candidates;
  return result;
end $$;
revoke all on function public.nearby_pois(double precision, double precision, integer) from public;
grant execute on function public.nearby_pois(double precision, double precision, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
