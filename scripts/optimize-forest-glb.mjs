// Shrink embedded PNG textures to WebP while preserving the original meshes,
// materials and UVs. Usage: node scripts/optimize-forest-glb.mjs in.glb out.glb
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require('sharp');
const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) throw Error('Expected input.glb and output.glb');

const input = await fs.readFile(inputPath);
if (input.toString('ascii', 0, 4) !== 'glTF' || input.readUInt32LE(8) !== input.length)
  throw Error('Invalid GLB header');
const jsonLength = input.readUInt32LE(12);
if (input.toString('ascii', 16, 20) !== 'JSON') throw Error('Missing JSON chunk');
const document = JSON.parse(input.toString('utf8', 20, 20 + jsonLength));
const binHeader = 20 + jsonLength;
if (input.toString('ascii', binHeader + 4, binHeader + 8) !== 'BIN\0')
  throw Error('Missing BIN chunk');
const binStart = binHeader + 8;
const replacements = new Map();
for (const image of document.images || []) {
  if (image.mimeType !== 'image/png' || image.bufferView === undefined) continue;
  const view = document.bufferViews[image.bufferView];
  const source = input.subarray(binStart + (view.byteOffset || 0),
    binStart + (view.byteOffset || 0) + view.byteLength);
  const optimized = await sharp(source).resize({ width: 256, height: 256,
    fit: 'inside', withoutEnlargement: true }).webp({ quality: 76, effort: 6 }).toBuffer();
  replacements.set(image.bufferView, optimized);
  image.mimeType = 'image/webp';
}
if (replacements.size) {
  // EXT_texture_webp has native support in the pinned Three.js GLTFLoader.
  document.extensionsUsed = [...new Set([...(document.extensionsUsed || []), 'EXT_texture_webp'])];
  document.extensionsRequired = [...new Set([...(document.extensionsRequired || []), 'EXT_texture_webp'])];
  for (const texture of document.textures || []) {
    if (texture.source === undefined) continue;
    const image = document.images[texture.source];
    if (image.mimeType !== 'image/webp') continue;
    texture.extensions ||= {};
    texture.extensions.EXT_texture_webp = { source: texture.source };
    delete texture.source;
  }
}

const parts = [];
let binLength = 0;
for (let i = 0; i < document.bufferViews.length; i++) {
  const view = document.bufferViews[i];
  const source = replacements.get(i) || input.subarray(binStart + (view.byteOffset || 0),
    binStart + (view.byteOffset || 0) + view.byteLength);
  view.byteOffset = binLength;
  view.byteLength = source.length;
  parts.push(source);
  binLength += source.length;
  const padding = (4 - (binLength % 4)) % 4;
  if (padding) { parts.push(Buffer.alloc(padding)); binLength += padding; }
}
document.buffers[0].byteLength = binLength;
const jsonBytes = Buffer.from(JSON.stringify(document));
const jsonPadding = (4 - jsonBytes.length % 4) % 4;
const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);
const result = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binLength);
result.write('glTF', 0, 'ascii');
result.writeUInt32LE(2, 4);
result.writeUInt32LE(result.length, 8);
result.writeUInt32LE(jsonChunk.length, 12);
result.write('JSON', 16, 'ascii');
jsonChunk.copy(result, 20);
const nextBinHeader = 20 + jsonChunk.length;
result.writeUInt32LE(binLength, nextBinHeader);
result.write('BIN\0', nextBinHeader + 4, 'ascii');
let cursor = nextBinHeader + 8;
for (const part of parts) { part.copy(result, cursor); cursor += part.length; }
await fs.writeFile(outputPath, result);
console.log(`${inputPath}: ${input.length} -> ${result.length} bytes, ${replacements.size} images resized`);
