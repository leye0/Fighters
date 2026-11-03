#!/usr/bin/env node
/**
 * Build exact X/Z silhouettes from ALL actual glTF mesh triangles.
 *
 * Project every indexed triangle into X/Z, union those 2D triangles with a
 * robust polygon Boolean library, and retain concave boundaries, disjoint
 * islands and holes. Neither hand-picked radii, box approximations, nor any
 * arbitrary height cutoff enter the collision geometry.
 *
 * Run only during asset builds, not at startup on a phone.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import polygonClipping from 'polygon-clipping';

const [housePath,orcDir]=process.argv.slice(2);
if(!housePath||!orcDir)throw Error(
 'Usage: node scripts/generate-building-footprints.mjs <witch_house.glb> <orc-buildings-dir>');
const io=new NodeIO();
const destination=path.join(path.dirname(housePath),'footprints');
await fs.mkdir(destination,{recursive:true});
const round=x=>Math.round(x*1e6)/1e6;
const signedArea=ring=>ring.reduce((sum,p,i)=>{
 const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];
},0)*.5;

async function extract(file,out){
 const doc=await io.read(file);
 const scenes=doc.getRoot().listScenes();
 if(!scenes.length)throw Error(file+': missing scene');
 const triangles=[];
 let meshCount=0,sourceTriangles=0;
 function visit(node){
  const mesh=node.getMesh();
  if(mesh){
   meshCount++;
   const m=node.getWorldMatrix();
   const transform=(x,y,z)=>[
    round(m[0]*x+m[4]*y+m[8]*z+m[12]),
    round(m[2]*x+m[6]*y+m[10]*z+m[14])
   ];
   for(const primitive of mesh.listPrimitives()){
    const position=primitive.getAttribute('POSITION');
    if(!position)continue;
    if(primitive.getMode()!==4)throw Error(file+': unexpected non-triangle mesh');
    const vertices=position.getArray(),indices=primitive.getIndices()?.getArray();
    const n=indices?.length??position.getCount();
    for(let i=0;i+2<n;i+=3){
     sourceTriangles++;
     const coords=[];
     for(let j=0;j<3;j++){
      const ix=indices?indices[i+j]:i+j;
      coords.push(transform(vertices[ix*3],vertices[ix*3+1],vertices[ix*3+2]));
     }
     if(Math.abs(signedArea(coords))<1e-10)continue;
     triangles.push([[coords]]);
    }
   }
  }
  for(const child of node.listChildren())visit(child);
 }
 for(const scene of scenes)for(const node of scene.listChildren())visit(node);
 if(!triangles.length)throw Error(file+': no solid projected triangles');
 // Piecewise unions control peak JS memory: source models can include many
 // thousands of triangles, while the published output contains only loops.
 let groups=[];
 for(let i=0;i<triangles.length;i+=160){
  const union=polygonClipping.union(...triangles.slice(i,i+160));
  if(union?.length)groups.push(union);
 }
 while(groups.length>1){
  const next=[];
  for(let i=0;i<groups.length;i+=16)
   next.push(polygonClipping.union(...groups.slice(i,i+16)));
  groups=next.filter(group=>group?.length);
 }
 const full=groups[0]||[];
 if(!full.length)throw Error(file+': triangle union produced no footprint');
 const polygons=full.map(poly=>poly.map(ring=>{
  const vertices=ring.slice(0,-1); // output rings are closed
  return vertices.map(([x,z])=>[x,z]);
 })).filter(poly=>poly[0].length>=3);
 let nVertices=0,area=0,minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
 for(const poly of polygons){
  for(let r=0;r<poly.length;r++){
   area+=Math.abs(signedArea(poly[r]))*(r?-1:1);
   for(const [x,z]of poly[r]){
    nVertices++;minX=Math.min(x,minX);maxX=Math.max(x,maxX);
    minZ=Math.min(z,minZ);maxZ=Math.max(z,maxZ);
   }
  }
 }
 if(area<=1e-7||!Number.isFinite(area)||nVertices>100000)
  throw Error(file+': invalid projected mesh union '+JSON.stringify({area,nVertices}));
 const output={type:'glb-projected-triangle-union-xz',source:path.basename(file),
  polygons,stats:{sourceTriangles,projectedTriangles:triangles.length,
   meshCount,islands:polygons.length,vertices:nVertices,area,
   width:maxX-minX,depth:maxZ-minZ}};
 await fs.writeFile(out,JSON.stringify(output));
 console.log('EXACT_FOOTPRINT '+JSON.stringify({
  model:path.basename(file),filename:out,bytes:Buffer.byteLength(JSON.stringify(output)),
  ...output.stats
 }));
}
await extract(housePath,path.join(destination,'witch_house.json'));
const manifest=JSON.parse(await fs.readFile(path.join(orcDir,'manifest.json'),'utf8'));
for(const entry of manifest.buildings){
 const name=path.basename(entry.file);
 await extract(path.join(orcDir,name),path.join(destination,name.replace(/\.glb$/i,'.json')));
}
