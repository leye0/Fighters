#!/usr/bin/env python3
"""GEOS union of all real mesh triangles flattened to X/Z.

No height cutoff, convex hull, shape approximation, padding, or simplification:
each model triangle is flattened and combined into a MultiPolygon. An
exceedingly fine 1e-6 precision grid resolves numerical issues at shared
edges, but does not replace authored geometry with measured distances.
"""
import json
import sys
from shapely.geometry import Polygon, MultiPolygon
from shapely import union_all, set_precision

if len(sys.argv)!=3:
    raise SystemExit("Usage: union-xz-triangles.py <triangle-coordinates.json> <outline.json>")
with open(sys.argv[1],encoding="utf-8") as f:
    triangles=json.load(f)

polygons=[]
for points in triangles:
    p=Polygon(points)
    if p.is_valid and p.area>1e-12:
        polygons.append(p)
if not polygons:
    raise RuntimeError("No valid projected triangles")

# The fixed grid is a numerical epsilon, not a manually measured collider.
merged=union_all(polygons,grid_size=0.000001)
if merged.is_empty:
    raise RuntimeError("The projected mesh union is empty")
if not merged.is_valid:
    merged=merged.buffer(0)
parts=list(merged.geoms) if hasattr(merged,"geoms") else [merged]
output=[]
for geom in parts:
    if geom.geom_type!="Polygon":
        continue
    rings=[]
    rings.append([[float(x),float(y)] for x,y in list(geom.exterior.coords)[:-1]])
    for hole in geom.interiors:
        rings.append([[float(x),float(y)] for x,y in list(hole.coords)[:-1]])
    if len(rings[0])>=3:
        output.append(rings)

if not output:
    raise RuntimeError("No polygonal area after GEOS union")
output.sort(key=lambda p: -abs(Polygon(p[0]).area))
with open(sys.argv[2],"w",encoding="utf-8") as f:
    json.dump(output,f,separators=(",",":"))
print("GEOS_PROJECTED_TRIANGLE_UNION",len(triangles),"triangles ->",
      len(output),"polygons",flush=True)
