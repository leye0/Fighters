#!/usr/bin/env node
// Le tableau de bord est un inventaire fini : aucune case historique n'entre
// dans le calcul, et un ajout/suppression de lot inattendu est signalé.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const document = readFileSync(resolve(root, 'refactor.md'), 'utf8');
const begin = document.indexOf('## Tableau de bord du travail restant');
const end = document.indexOf('\n## Règles de progression', begin);
if (begin < 0 || end < 0) throw new Error('Tableau de bord introuvable dans refactor.md');

const expected = {
  A: ['A1'],
  E: ['E1', 'E2', 'E3'],
  S: ['S1', 'S2', 'S3', 'S4', 'S5'],
  W: ['W1', 'W2', 'W3'],
};
const wanted = new Set(Object.values(expected).flat());
const seen = new Map();
for (const [, state, id] of document.slice(begin, end).matchAll(/^\s*- \[([ x])\] \*\*([A-Z]\d+)\b/gm)) {
  if (!wanted.has(id)) throw new Error(`Lot inconnu : ${id}`);
  if (seen.has(id)) throw new Error(`Lot dupliqué : ${id}`);
  seen.set(id, state === 'x');
}
for (const id of wanted) {
  if (!seen.has(id)) throw new Error(`Lot manquant : ${id}`);
}

let complete = 0;
for (const [axis, ids] of Object.entries(expected)) {
  const done = ids.filter(id => seen.get(id)).length;
  complete += done;
  process.stdout.write(`${axis} : ${done}/${ids.length} terminés (${ids.length - done} restants)\n`);
}
process.stdout.write(`TOTAL : ${complete}/${wanted.size} terminés, ${wanted.size - complete} restants\n`);
