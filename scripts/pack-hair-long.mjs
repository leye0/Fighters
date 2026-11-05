#!/usr/bin/env node
// Pack the SHA-pinned Quaternius GLTF and external BIN as one deployable GLB.
import assert from 'node:assert/strict';
import {NodeIO} from '@gltf-transform/core';

const [source,destination]=process.argv.slice(2);
assert(source&&destination,'Usage: pack-hair-long.mjs source.gltf output.glb');
const io=new NodeIO();
const document=await io.read(source);
const root=document.getRoot();
assert.equal(root.listMeshes().length,1,'Expected one Quaternius hair mesh');
assert.equal(root.listSkins().length,1,'Expected a rigged Quaternius hairstyle');
assert.equal(root.listSkins()[0].listJoints().length,65,'Expected 65 joint rig');
await io.write(destination,document);
console.log('Packed Quaternius Hair_Long: '+destination);
