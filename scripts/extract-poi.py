"""Download/verify a Vietnam OSM extract and stream five POI categories.

Local preparation only: never connects to a database or collects rider GPS.
Run from the repo root after installing scripts/requirements-poi.txt.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor, wait
import hashlib
import json
import os
import shutil
from pathlib import Path
import sys
import time
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.poi-tools'))
import osmium

SOURCE = 'https://download.geofabrik.de/asia/vietnam-latest.osm.pbf'
HEADERS = {'User-Agent': 'RideMate POI import (+https://ridemate-pka.onrender.com/)'}


def download(url, target):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS, method='HEAD'), timeout=60) as response:
        total = int(response.headers['Content-Length'])
        modified = response.headers.get('Last-Modified', '')
    offset = target.stat().st_size if target.exists() else 0
    if offset > total:
        raise ValueError('Partial download is larger than the source')
    if offset == total:
        return modified
    workers = min(4, max(1, (total - offset) // (16 * 1024 * 1024)))
    size = (total - offset + workers - 1) // workers
    parts, progress = [], [0] * workers

    def fetch_part(index, first, last, part):
        saved = part.stat().st_size if part.exists() else 0
        expected = last - first + 1
        if saved > expected:
            raise ValueError('Invalid partial range')
        progress[index] = saved
        if saved == expected:
            return
        headers = {**HEADERS, 'Range': f'bytes={first + saved}-{last}'}
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
            if response.status != 206 or response.headers.get('Content-Range') != f'bytes {first + saved}-{last}/{total}':
                raise ValueError('Source does not support the requested byte range')
            with part.open('ab') as output:
                while chunk := response.read(256 * 1024):
                    output.write(chunk)
                    progress[index] += len(chunk)
        if progress[index] != expected:
            raise ValueError('Incomplete OSM range download')

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = []
        for index in range(workers):
            first, last = offset + index * size, min(total - 1, offset + (index + 1) * size - 1)
            part = target.with_name(f'{target.name}.{first}-{last}')
            parts.append(part)
            futures.append(pool.submit(fetch_part, index, first, last, part))
        pending = set(futures)
        while pending:
            done, pending = wait(pending, timeout=10)
            for future in done:
                future.result()
            print(f'Downloaded {(offset + sum(progress)) // 1048576}/{total // 1048576} MiB', flush=True)
    with target.open('ab') as output:
        for part in parts:
            with part.open('rb') as stream:
                shutil.copyfileobj(stream, output)
    for part in parts:
        part.unlink()
    return modified


def category(tags):
    if tags.get('amenity') == 'fuel':
        return 'fuel'
    if tags.get('shop') in ('motorcycle_repair', 'car_repair', 'tyres') or (
            tags.get('shop') == 'motorcycle' and tags.get('service:motorcycle:repair') == 'yes'):
        return 'repair'
    if tags.get('tourism') in ('hotel', 'guest_house', 'motel') or tags.get('highway') in ('rest_area', 'services'):
        return 'rest'
    if tags.get('amenity') in ('restaurant', 'fast_food', 'food_court'):
        return 'food'
    if tags.get('amenity') in ('cafe', 'ice_cream'):
        return 'drink'
    return None


class PoiHandler(osmium.SimpleHandler):
    def __init__(self, output):
        super().__init__()
        self.output = output
        self.counts = {'node': 0, 'way': 0, 'relation': 0}
        self.invalid = 0

    def emit(self, kind, osm_id, tags, locations):
        if not category(tags):
            return
        points = [(p.lon, p.lat) for p in locations if p.valid()]
        if not points or len(points) != len(locations):
            self.invalid += 1
            return
        # Like Overpass's center output, use bounding-box centers for ways/areas.
        lon = (min(p[0] for p in points) + max(p[0] for p in points)) / 2
        lat = (min(p[1] for p in points) + max(p[1] for p in points)) / 2
        keep = ('amenity', 'shop', 'service:motorcycle:repair', 'tourism', 'highway',
                'name:vi', 'name', 'brand', 'operator', 'addr:housenumber', 'addr:street',
                'addr:city', 'addr:province', 'opening_hours')
        row = {'type': kind, 'id': osm_id, 'lon': lon, 'lat': lat,
               'tags': {key: tags[key] for key in keep if key in tags}}
        self.output.write(json.dumps(row, ensure_ascii=False) + '\n')
        self.counts[kind] += 1

    def node(self, node):
        if category(node.tags):
            self.emit('node', node.id, node.tags, [node.location])

    def way(self, way):
        if category(way.tags):
            self.emit('way', way.id, way.tags, [node.location for node in way.nodes])

    def area(self, area):
        # Tagged ways were emitted above; here retain multipolygon relations.
        if not area.from_way() and category(area.tags):
            self.emit('relation', area.orig_id(), area.tags,
                      [node.location for ring in area.outer_rings() for node in ring])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Existing .osm.pbf (otherwise download Vietnam)')
    parser.add_argument('--output', type=Path, default=Path('output/poi'))
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    cache = Path('.poi-cache')
    cache.mkdir(exist_ok=True)
    modified = ''
    expected = None
    if args.input:
        source = args.input
    else:
        with urllib.request.urlopen(urllib.request.Request(SOURCE + '.md5', headers=HEADERS), timeout=30) as response:
            expected = response.read(1000).decode().split()[0]
        if len(expected) != 32 or any(char not in '0123456789abcdefABCDEF' for char in expected):
            raise ValueError('Invalid source checksum')
        source = cache / f'vietnam-{expected}.osm.pbf'
        if not source.exists():
            temporary = source.with_suffix('.part')
            modified = download(SOURCE, temporary)
            os.replace(temporary, source)
    digest = hashlib.md5()
    with source.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    if expected and digest.hexdigest() != expected:
        raise ValueError('OSM checksum mismatch; latest extract may have rotated. Download again.')
    with osmium.io.Reader(str(source)) as reader:
        source_date = reader.header().get('osmosis_replication_timestamp')
    print('Extract verified; scanning nodes, ways and multipolygon relations...', flush=True)
    raw = args.output / 'poi-elements.jsonl'
    temporary = raw.with_suffix('.tmp')
    started = time.monotonic()
    with temporary.open('w', encoding='utf-8', newline='\n') as output:
        handler = PoiHandler(output)
        # Filter in libosmium before invoking Python for millions of untagged
        # road/building nodes. SimpleHandler still fills the location index and
        # assembles relation geometry before this filter is applied to output.
        tags = [('amenity', 'restaurant'), ('amenity', 'fast_food'), ('amenity', 'food_court'),
                ('amenity', 'cafe'), ('amenity', 'ice_cream'), ('amenity', 'fuel'), ('shop', 'motorcycle_repair'), ('shop', 'car_repair'),
                ('shop', 'tyres'), ('shop', 'motorcycle'), ('tourism', 'hotel'),
                ('tourism', 'guest_house'), ('tourism', 'motel'),
                ('highway', 'rest_area'), ('highway', 'services')]
        handler.apply_file(str(source), locations=True, idx='flex_mem', filters=[osmium.filter.TagFilter(*tags)])
    if not sum(handler.counts.values()):
        raise ValueError('No POIs extracted; refusing an empty publication')
    os.replace(temporary, raw)
    metadata = {'sourceUrl': SOURCE if not args.input else source.name,
                'sourceDate': source_date or modified or time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(source.stat().st_mtime)),
                'sourceMd5': digest.hexdigest(), 'sourceBytes': source.stat().st_size,
                'extracted': handler.counts, 'invalidLocations': handler.invalid,
                'elapsedSeconds': round(time.monotonic() - started, 2)}
    (args.output / 'source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(metadata, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
