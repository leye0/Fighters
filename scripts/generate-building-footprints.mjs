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
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';

const [housePath,orcDir]=process.argv.slice(2);
if(!housePath||!orcDir)throw Error(
 'Usage: node scripts/generate-building-footprints.mjs <witch_house.glb> <orc-buildings-dir>');
const io=new NodeIO();
const destination=path.join(path.dirname(housePath),'footprints');
await fs.mkdir(destination,{recursive:true});
const round=x=>Math.round(x*1e7)/1e7;
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
     triangles.push(coords);
    }
   }
  }
  for(const child of node.listChildren())visit(child);
 }
 for(const scene of scenes)for(const node of scene.listChildren())visit(node);
 if(!triangles.length)throw Error(file+': no solid projected triangles');
 // GEOS performs robust full 2D unions in compiled code. A fixed 1e-6
 // precision grid avoids floating-point topology failures from tiny sliver
 // triangles, without substituting any hand-estimated building footprint.
 const temporary=await fs.mkdtemp(path.join(tmpdir(),'fighters-xz-'));
 let polygons;
 try{
  const inputFile=path.join(temporary,'triangles.json');
  const outputFile=path.join(temporary,'outline.json');
  await fs.writeFile(inputFile,JSON.stringify(triangles));
  execFileSync('python3',['scripts/union-xz-triangles.py',inputFile,outputFile],
   {stdio:['ignore','inherit','inherit'],timeout:180000});
  polygons=JSON.parse(await fs.readFile(outputFile,'utf8'));
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
 if(!polygons.length)throw Error(file+': projected triangle union empty');
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
