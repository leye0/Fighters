#!/usr/bin/env node
/** Concave, hollow and multi-island building projection collision tests. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const G=require('../app/rts-footprint.js');
const {Navigator}=require('../app/rts-navigation.js');
const L=G.shapeFromPolygons([[[[0,0],[4,0],[4,1],[1,1],[1,4],[0,4]]]]);
assert.equal(L.shape,'polygon');
assert(G.inside({x:.6,z:3},L),'solid building wing');
assert(!G.inside({x:2.5,z:2.5},L),'real concave empty corner');
assert(Math.abs(G.distanceTo({x:2.5,z:2.5},L)-1.5)<1e-8,
 'Distance is measured to actual silhouette, not its enclosing rectangle');
assert(!G.pointBlocked({x:2.5,z:2.5},L,.35));
assert(G.pointBlocked({x:1.2,z:2.5},L,.25));
assert(G.segmentBlocked({x:3,z:2},{x:.5,z:2},L,.22),
 'Swept unit circle hits the polygon wing');
assert(!G.segmentBlocked({x:3,z:2},{x:2,z:3},L,.25),
 'Units can cut through the concave notch despite overlapping AABB');
const nav=new Navigator({halfSize:8,cellSize:.5,radius:.25});
nav.setObstacles([L]);
assert(nav.pointClear({x:2.5,z:2.5}),'Navigator must accept concavity');
assert(!nav.pointClear({x:.5,z:2.5}),'Navigator must reject true wall');
assert(nav.segmentClear({x:3,z:2},{x:2,z:3}),
 'Line of sight through open concave area');
assert(!nav.segmentClear({x:3,z:2},{x:.5,z:2}),
 'Line of sight blocked by building wing');
assert(nav.cellBlocked(nav.cell({x:.5,z:2.5})),
 'Wall cell must be blocked by the true silhouette');
assert(!nav.cellBlocked(nav.cell({x:2.5,z:2.5})),
 'Open concavity cell must remain navigable');

const hollow=G.shapeFromPolygons([[
 [[-4,-4],[4,-4],[4,4],[-4,4]],
 [[-1,-1],[-1,1],[1,1],[1,-1]]
]]);
assert(!G.inside({x:0,z:0},hollow),'Hole is physically open');
assert(G.inside({x:2,z:0},hollow),'Outer material is solid');
assert(G.distanceTo({x:0,z:0},hollow)>.9,'Hole floor has clearance');
assert(G.segmentBlocked({x:0,z:0},{x:3,z:0},hollow,.15),'Crosses hole wall');
assert(!G.segmentBlocked({x:-.5,z:0},{x:.5,z:0},hollow,.15),
 'Can move inside a large enough hole');

const other=G.shapeFromPolygons([[[[2,2],[3,2],[3,3],[2,3]]]]);
assert(!G.polygonsOverlap(L,other),'The empty L-corner does not collide');
assert(!G.withinClearance(L,other,.99),'Open L-corner stays available outside margin');
assert(G.withinClearance(L,other,1),'The required one-unit building clearance is exact');
const neighbour=G.shapeFromPolygons([[[[4.99,0],[5.99,0],[5.99,1],[4.99,1]]]]);
assert(G.withinClearance(L,neighbour,1),'Building cannot fit with less than one-unit margin');
assert(!G.withinClearance(L,G.translated(neighbour,.02,0),1),
 'Buildings separated by more than one unit are constructible');
const trunk={shape:'aabb',minX:5,maxX:5.4,minZ:0,maxZ:.4};
assert(G.withinClearance(L,trunk,1),'Trunk obstacle also reserves a one-unit space');
assert(G.polygonsOverlap(L,G.translated(other,-2,0)),
 'Overlap uses true polygon geometry');
const separate=G.shapeFromPolygons([
 [[[0,0],[1,0],[1,1],[0,1]]],
 [[[4,0],[5,0],[5,1],[4,1]]]
]);
assert(!G.inside({x:2.5,z:.5},separate),'Disconnected fragments stay separate');
assert(G.inside({x:4.5,z:.5},separate),'Disconnected mesh island is included');
const shifted=G.translated(L,10,-2);
assert(G.inside({x:10.5,z:0},shifted),'Translated GLB silhouette follows building transform');
console.log('PASS exact XZ polygons: true concavity, multi-islands, hole, unit-radius sweeps, A* cells and overlapping contours.');

