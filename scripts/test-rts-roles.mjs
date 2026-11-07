import assert from 'node:assert/strict';
import roles from '../app/rts-roles.js';
assert.deepEqual(roles.ROLE_IDS,['worker','melee','ranged']);
for(const clan of ['witch','orc']){
  for(const role of roles.ROLE_IDS){
    const spec=roles.profile(clan,role);
    assert(spec.cost>0&&spec.health>0&&spec.speed>0);
    assert(typeof spec.garment==='number'&&spec.garment>0);
    assert(roles.isWorker({role})===(role==='worker'));
    assert(roles.isFighter({role})===(role!=='worker'));
    assert(role==='worker'?(spec.damage===0&&spec.range===0):
      (spec.damage>0&&spec.range>0));
  }
  assert(roles.profile(clan,'ranged').range>roles.profile(clan,'melee').range);
}
assert.throws(()=>roles.profile('witch','unknown'));
console.log('PASS THREE ROLES PER CLAN: workers, melee, ranged; one shared rig per clan.');
