# Vietnam routing boundary

`vietnam-boundary.json`: OpenStreetMap contributors, Vietnam administrative
relation [49915](https://www.openstreetmap.org/relation/49915), downloaded
2026-09-27 from
https://polygons.openstreetmap.fr/get_geojson.py?id=49915&params=0 .

License: [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
Redistribute this geometry with the same attribution/license. This is an OSM
community boundary snapshot for route filtering, not an official legal boundary
determination. The source includes disconnected areas and maritime boundaries.

Processing: JSON minification; coordinates rounded to 7 decimals; no geometry
simplification, buffering or manually expanded boundary. 77,516 vertices.
Original SHA-256: `3461e6b42586aaccd10ec6340fa931d3c6610404a4c7347aa199b7a49db86a0c`.
Stored SHA-256: `99de0f2584c272d07afa1f6a62e53458d09b6d8b88fb60db4846165e5ad12e72`.

To update, fetch that URL, verify MultiPolygon/ring integrity and known domestic
and foreign locations, apply the same precision/minification, update hashes/date,
run the boundary tests and increment the domestic route cache version. The app
loads this bundled data lazily, without a runtime boundary service dependency.
