import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const script=join(root,'scripts/publish-generated-result.sh');
const temp=mkdtempSync(join(tmpdir(),'fighters-result-publish-'));
const run=(command,args,cwd,env={})=>{
  const child=spawnSync(command,args,{cwd,encoding:'utf8',
    env:{...process.env,...env}});
  if(child.error)throw child.error;
  return {status:child.status,output:child.stdout+child.stderr};
};
const git=(cwd,...args)=>{
  const result=run('git',args,cwd);
  assert.equal(result.status,0,`git ${args.join(' ')}: ${result.output}`);
  return result.output.trim();
};
function fixture(name){
  const dir=join(temp,name);
  const remote=join(dir,'remote.git');
  git(temp,'init','--bare',remote);
  const seed=join(dir,'seed');
  git(temp,'clone',remote,seed);
  git(seed,'config','user.email','bot@example.test');
  git(seed,'config','user.name','test bot');
  writeFileSync(join(seed,'shared.txt'),'base\n');
  git(seed,'add','shared.txt');
  git(seed,'commit','-m','Initialize');
  git(seed,'push','origin','HEAD:main');
  git(remote,'symbolic-ref','HEAD','refs/heads/main');
  const worker=join(dir,'worker');
  const other=join(dir,'other');
  git(temp,'clone',remote,worker);
  git(temp,'clone',remote,other);
  for(const cwd of [worker,other]){
    git(cwd,'config','user.email','bot@example.test');
    git(cwd,'config','user.name','test bot');
  }
  return {dir,remote,worker,other};
}
function publisher(fixture,runId){
  return run('bash',[script,'test-workflow'],fixture.worker,
    {GITHUB_RUN_ID:String(runId),GITHUB_RUN_ATTEMPT:'1'});
}
try{
  // Ordinary result publishing saves the output and integrates it without PR.
  const straight=fixture('straight');
  writeFileSync(join(straight.worker,'generated.txt'),'generated result\n');
  git(straight.worker,'add','generated.txt');
  git(straight.worker,'commit','-m','Generate output');
  const original=git(straight.worker,'rev-parse','HEAD');
  let result=publisher(straight,701);
  assert.equal(result.status,0,result.output);
  assert.equal(git(straight.remote,'rev-parse',
    'refs/heads/automation-results/test-workflow/701-1'),original);
  git(straight.other,'pull','--ff-only','origin','main');
  assert.equal(readFileSync(join(straight.other,'generated.txt'),'utf8'),
    'generated result\n');

  // Another agent may have published an unrelated file since checkout.
  const moved=fixture('moved');
  writeFileSync(join(moved.worker,'generated.txt'),'from workflow\n');
  git(moved.worker,'add','generated.txt');
  git(moved.worker,'commit','-m','Generate output');
  writeFileSync(join(moved.other,'unrelated.txt'),'concurrent code\n');
  git(moved.other,'add','unrelated.txt');
  git(moved.other,'commit','-m','Concurrent contribution');
  git(moved.other,'push','origin','HEAD:main');
  result=publisher(moved,702);
  assert.equal(result.status,0,result.output);
  git(moved.other,'pull','--ff-only','origin','main');
  assert.equal(readFileSync(join(moved.other,'unrelated.txt'),'utf8'),
    'concurrent code\n');
  assert.equal(readFileSync(join(moved.other,'generated.txt'),'utf8'),
    'from workflow\n');

  // A competing edit to the same path must fail safely: no overwrite, output
  // branch retained so the developer can replay the generator commit.
  const conflict=fixture('conflict');
  writeFileSync(join(conflict.worker,'shared.txt'),'workflow changed this\n');
  git(conflict.worker,'add','shared.txt');
  git(conflict.worker,'commit','-m','Generated rewrite');
  const generated=git(conflict.worker,'rev-parse','HEAD');
  writeFileSync(join(conflict.other,'shared.txt'),'human changed this\n');
  git(conflict.other,'add','shared.txt');
  git(conflict.other,'commit','-m','Human rewrite');
  git(conflict.other,'push','origin','HEAD:main');
  const headBefore=git(conflict.remote,'rev-parse','refs/heads/main');
  result=publisher(conflict,703);
  assert.notEqual(result.status,0,'conflicting integration must not succeed');
  assert.match(result.output,/recover output from/);
  assert.equal(git(conflict.remote,'rev-parse','refs/heads/main'),headBefore);
  assert.equal(git(conflict.remote,'rev-parse',
    'refs/heads/automation-results/test-workflow/703-1'),generated);

  const migrated=[
    'import-orc-voices','import-witch-voices','install-voice-catalog',
    'install-consistent-voices','fix-voice-consistency',
    'adjust-orc-pitch-selection','install-magic-recharge'
  ];
  for(const name of migrated){
    const source=readFileSync(join(root,'.github/workflows',name+'.yml'),'utf8');
    assert(source.includes(`bash scripts/publish-generated-result.sh ${name}`),
      `${name} must integrate through recoverable result branch`);
    assert(!/git push origin HEAD:main/.test(source),
      `${name} must not directly push its stale generated checkout to main`);
    assert(source.includes('workflow_dispatch:'),
      `${name} must remain available for manual publication`);
  }
  const assetPublisher=readFileSync(join(root,'scripts/publish-runtime-assets.sh'),'utf8');
  assert(assetPublisher.includes('bash scripts/publish-generated-result.sh browser-qa-runtime-assets'),
    'Normal Chrome QA asset publication must retain its recoverable result branch');
  for(const name of ['install-voice-catalog','install-consistent-voices',
    'fix-voice-consistency','adjust-orc-pitch-selection',
    'install-magic-recharge']){
    const source=readFileSync(join(root,'.github/workflows',name+'.yml'),'utf8');
    assert(!/^  push:$/m.test(source),
      `${name} must not regenerate media from its own workflow edit`);
  }
  for(const name of ['generate-fighters-battle-v2','generate-fighters-three-themes']){
    const source=readFileSync(join(root,'.github/workflows',name+'.yml'),'utf8');
    assert(source.includes('if [ "${GITHUB_REF_NAME}" = main ]; then'));
    assert(source.includes('refs/heads/automation-results/music-'));
  }
  console.log('PASS generated results: durable branches, concurrent fast-forward, conflict safety and 9 workflow guards plus Chrome asset publisher.');
}finally{
  rmSync(temp,{recursive:true,force:true});
}
