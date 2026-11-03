#!/usr/bin/env node
/* Exact mesh-projected footprint regression: concavity, holes and actual edges. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const clipping=require('polygon-clipping');
const {clipTriangleBelow,unionTriangles,makeFootprint,translateFootprint}=require('../docs/rts-footprint.js');
const {Navigator,distanceToFootprint,insideFootprint,segmentHitsFootprint,
  footprintsOverlap,closestFootprintPoint}=require('../docs/rts-navigation.js');
const triangle=(a,b,c)=>[a,b,c].map(p=>({x:p[0],y:0,z:p[1]}));
const square=(minX,minZ,maxX,maxZ)=>[
 triangle([minX,minZ],[maxX,minZ],[maxX,maxZ]),
 triangle([minX,minZ],[maxX,maxZ],[minX,maxZ])
];
const clipped=clipTriangleBelow([
 {x:0,y:-1,z:0},{x:3,y:1,z:0},{x:0,y:-1,z:3}
],0);
assert.equal(clipped.length,4,'3D triangle must be clipped to the structural elevation');
assert(clipped.every(p=>p.y<=0),'Projected triangle contains roof geometry above section');
const triangles=[...square(0,0,4,1),...square(0,1,1,4)];
const polygons=unionTriangles(triangles,clipping.union);
const l=makeFootprint(polygons);
assert.equal(l.shape,'polygon');
assert(polygons[0][0].length>=6,'True L-shaped outline must preserve its concave corner');
assert(insideFootprint(l,.5,3),'Vertical section is a solid foundation');
assert(insideFootprint(l,3,.5),'Horizontal section is a solid foundation');
assert(!insideFootprint(l,3,3),'Concave empty courtyard is not a building wall');
assert(Math.abs(distanceToFootprint({x:3,z:3},l)-2)<1e-7,
 'Closest distance must follow concave polygon edges, not AABB');
const nav=new Navigator({halfSize:12,radius:.15,cellSize:.5});
nav.setObstacles([l]);
assert(nav.pointClear({x:3,z:3}),'A* must allow walking inside empty concavity');
assert(!nav.pointClear({x:.5,z:2}),'A* must block true foundation');
assert(nav.segmentClear({x:2,z:2},{x:3,z:3}),
 'Direct path across open concavity must stay free');
assert(!nav.segmentClear({x:-1,z:.5},{x:5,z:.5}),
 'Swept character may not cross real projected wall');
assert(segmentHitsFootprint({x:-1,z:.5},{x:5,z:.5},l,.15),
 'Segment collision must test polygon boundary');
const near=closestFootprintPoint({x:3,z:3},l);
assert(Math.abs(Math.hypot(near.x-3,near.z-3)-2)<1e-7,
 'Melee candidate nearest boundary must use actual polygon edge');
const freeSquare=makeFootprint([[[[2,2],[3,2],[3,3],[2,3],[2,2]]]]);
const wallSquare=makeFootprint([[[[.2,2],[.8,2],[.8,3],[.2,3],[.2,2]]]]);
assert(!footprintsOverlap(l,freeSquare),'Unrelated concave empty part of AABB is buildable');
assert(footprintsOverlap(l,wallSquare),'New polygon cannot overlap real masonry');
const translated=translateFootprint(l,6,-2);
assert(insideFootprint(translated,6.5,1)&&!insideFootprint(translated,9,1),
 'Template polygons must translate exactly during construction');
const withHole=makeFootprint([[
 [[0,0],[5,0],[5,5],[0,5],[0,0]],
 [[1,1],[1,4],[4,4],[4,1],[1,1]]
]]);
assert(!insideFootprint(withHole,2,2),'Real internal courtyard is walkable');
assert(insideFootprint(withHole,.5,.5),'Masonry around courtyard blocks movement');
assert(distanceToFootprint({x:2,z:2},withHole)>0,
 'Inside a true polygon hole must have positive boundary distance');
console.log('PASS projected X/Z polygons: concave GLB bases, holes, true edge distance, swept collision, build intersections, translation.');
