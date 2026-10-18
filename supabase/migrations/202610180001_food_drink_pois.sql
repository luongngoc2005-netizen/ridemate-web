-- Extend public OSM POIs without replacing the active snapshot.
begin;
alter table public.osm_pois drop constraint if exists osm_pois_category_check;
alter table public.osm_pois add constraint osm_pois_category_check
  check (category in ('fuel', 'rest', 'repair', 'food', 'drink'));
-- Historical snapshots only cover these three categories.
alter table public.poi_imports add column if not exists categories text[] not null
  default array['fuel', 'rest', 'repair']::text[];

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
    from (values ('fuel'), ('rest'), ('repair'), ('food'), ('drink')) as wanted(category)
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
    'categories', (select to_jsonb(categories) from public.poi_imports where id = active_id),
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


create or replace function public.route_pois(route_geojson jsonb, category_name text, radius_m integer default 1700)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  active_id text;
  active_date text;
  active_categories text[];
  route_line extensions.geometry;
  result jsonb;
begin
  if category_name is null or category_name not in ('fuel', 'rest', 'repair', 'food', 'drink')
    or radius_m is null or radius_m not between 1 and 2000
    or route_geojson is null or octet_length(route_geojson::text) > 300000
    or route_geojson->>'type' is distinct from 'LineString'
    or jsonb_typeof(route_geojson->'coordinates') is distinct from 'array' then
    raise exception 'Invalid route POI search' using errcode = '22023';
  end if;
  if jsonb_array_length(route_geojson->'coordinates') not between 2 and 5000 then
    raise exception 'Invalid route POI search' using errcode = '22023';
  end if;
  route_line := extensions.st_setsrid(extensions.st_force2d(extensions.st_geomfromgeojson(route_geojson)), 4326);
  if extensions.st_isempty(route_line) or not extensions.st_isvalid(route_line)
    or extensions.st_xmin(extensions.box3d(route_line)) < -180 or extensions.st_xmax(extensions.box3d(route_line)) > 180
    or extensions.st_ymin(extensions.box3d(route_line)) < -90 or extensions.st_ymax(extensions.box3d(route_line)) > 90
    or extensions.st_length(route_line::extensions.geography) not between 1 and 10000000 then
    raise exception 'Invalid route POI search' using errcode = '22023';
  end if;
  select i.id, i.source_date, i.categories into active_id, active_date, active_categories
    from public.poi_catalog c join public.poi_imports i on i.id = c.dataset_id
    where c.singleton and i.ready;
  if active_id is null or not (category_name = any(active_categories)) then
    return jsonb_build_object('ready', false);
  end if;

  -- Short segment envelopes use the existing spatial index even for a route
  -- crossing Vietnam. A country-sized bounding box would scan too many POIs.
  with segments as materialized (
    select s.geom::extensions.geography as line
    from extensions.st_dumpsegments(extensions.st_segmentize(route_line::extensions.geography, 20000)::extensions.geometry) s
  ), matches as materialized (
    select p.osm_type, p.osm_id, min(extensions.st_distance(p.location, s.line)) as distance
    from segments s join public.osm_pois p on p.dataset_id = active_id and p.category = category_name
      and extensions.st_dwithin(p.location, s.line, radius_m)
    group by p.osm_type, p.osm_id
  ), positioned as (
    select p.*, m.distance,
      least(29, floor(extensions.st_linelocatepoint(route_line, p.location::extensions.geometry) * 30)::integer) as bucket
    from matches m join public.osm_pois p
      on p.dataset_id = active_id and p.osm_type = m.osm_type and p.osm_id = m.osm_id
  ), ranked as (
    select *, row_number() over (partition by bucket order by distance, osm_type, osm_id) as bucket_rank
    from positioned
  ), spread as (
    select * from ranked order by bucket_rank, bucket, osm_type, osm_id limit 180
  )
  select jsonb_build_object('ready', true, 'dataset', active_id, 'sourceDate', active_date,
    'complete', (select count(*) <= 180 from matches),
    'places', coalesce(jsonb_agg(jsonb_build_object(
      'type', osm_type, 'id', osm_id, 'category', category, 'name', name,
      'lon', longitude, 'lat', latitude, 'address', address, 'hours', hours
    ) order by bucket, bucket_rank), '[]'::jsonb)) into result from spread;
  return result;
end $$;
revoke all on function public.route_pois(jsonb, text, integer) from public;
grant execute on function public.route_pois(jsonb, text, integer) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
