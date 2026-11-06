// Guard module boundaries used by parallel agents. An accidental missing
// browser script, stale QA trigger or inline-game regression must fail CI.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const html=read('docs/index.html');
const game=read('docs/game.js');
const qaWorkflow=read('.github/workflows/browser-qa.yml');
const pagesWorkflow=read('.github/workflows/pages.yml');
const retryWorkflow=read('.github/workflows/chrome-retry.yml');
const architecture=read('docs/architecture.md');
const agentGuide=read('AGENTS.md');

const scripts=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
  .map(match=>match[1].split('?')[0]);
assert(scripts.includes('./game.js'));
assert.equal(scripts.at(-1),'./game.js','the main integration module must load last');
assert(html.includes('<script type="module" src="./game.js"></script>'));
assert(html.includes('<link rel="stylesheet" href="./styles/game.css">'));
assert(!/<style\b/i.test(html),'no CSS should leak back into index.html');
assert(!/\bfunction\s+(tickUnit|stepGame|queueOrder|touchAt)\b/.test(html),
  'gameplay and input domain functions must not reappear in the HTML');
assert(html.split('\n').length<180,'HTML bootstrap must remain small');

const boundaries=[
  ['rts-simulation','FightersSimulation'],
  ['rts-unit-tick','FightersUnitTick'],
  ['rts-match-state','FightersMatchState'],
  ['rts-world-state','FightersWorldState'],
  ['rts-orc-forager','FightersOrcForager'],
  ['rts-orc-hunt-planner','FightersOrcHuntPlanner'],
  ['rts-food-cycle','FightersFoodCycle'],
  ['rts-raven-distraction','FightersRavenDistraction'],
  ['rts-healing-cycle','FightersHealingCycle'],
  ['rts-orders','FightersOrders'],
  ['rts-picking','FightersPicking'],
  ['rts-camera','FightersCamera'],
  ['rts-gestures','FightersGestures'],
  ['rts-player-actions','FightersPlayerActions'],
  ['rts-minimap','FightersMinimap'],
  ['rts-hud','FightersHud'],
  ['rts-ai-commands','FightersAiCommands'],
  ['rts-ai-observations','FightersAiObservations'],
  ['rts-assets','FightersAssets'],
  ['rts-model-assets','FightersModelAssets']
];
const loadedAt=new Map(scripts.map((src,index)=>[src,index]));
for(const [name,global] of boundaries){
  const script=`./${name}.js`,source=`docs/${name}.js`;
  assert(existsSync(resolve(root,source)),`${source} missing`);
  assert(loadedAt.has(script),`${source} must load from index.html`);
  assert(loadedAt.get(script)<loadedAt.get('./game.js'),
    `${source} must initialize before game.js`);
  assert(game.includes(`window.${global}.`),`game.js is not wired to ${global}`);
  assert(qaWorkflow.includes(`'${source}'`),
    `${source} must trigger all real-browser QA scenarios`);
  const code=read(source);
  assert(!/\b(?:from\s*|import\s*\(\s*)["'](?:\.\/)?game\.js["']/.test(code),
    `${source} may not depend on game.js`);
  assert(!/document\.querySelector|document\.getElementById/.test(code),
    `${source} must get its DOM elements from an adapter or explicit dependency`);
  assert(architecture.includes(name),`${source} needs an owner in architecture.md`);
  assert(agentGuide.includes(name),`${source} needs an owner in AGENTS.md`);
}

assert(existsSync(resolve(root,'docs/styles/game.css')));
assert(pagesWorkflow.includes("'docs/**'"),
  'Pages must redeploy whenever any browser module changes');
assert(qaWorkflow.includes('scripts/use-pinned-runtime-assets.sh'),
  'Chrome tests must reuse the immutable prepared runtime assets');
assert(pagesWorkflow.includes('scripts/use-pinned-runtime-assets.sh'),
  'Pages must use the same prepared runtime assets as Chrome');
assert(!/run:\s*bash scripts\/prepare-runtime-assets\.sh/.test(qaWorkflow),
  'Do not rebuild large models for each code-only browser QA');

const self='scripts/test-rts-architecture.mjs';
assert(qaWorkflow.includes(`'${self}'`),'architecture test changes must trigger QA');
assert(qaWorkflow.includes(`node ${self}`),'architecture tests must run in CI');
assert(retryWorkflow.includes("'scripts/browser-qa/chrome-driver.mjs'")&&
  retryWorkflow.includes("'scripts/test-rts-chrome-retry.mjs'")&&
  retryWorkflow.includes("FIGHTERS_REAL_CHROME_RETRY: '1'"),
  'real Chrome recovery should have an isolated, path-triggered CI smoke test');
console.log(`PASS ${boundaries.length} module boundaries, browser entrypoints, `+
  'ownership and pinned-asset CI invariants');
