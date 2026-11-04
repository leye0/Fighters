import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const forest=require('../docs/rts-forest.js');
const berry=require('../docs/rts-berries.js');
const farming=require('../docs/rts-farming.js');
const trees=forest.createLayout();
const layout=berry.createLayout(trees);
assert.deepEqual(layout,berry.createLayout(trees),'Wild berry distribution must be reproducible');
assert.equal(layout.length,berry.BUSH_COUNT,'All shrubs must fit in the playable arena');
assert.ok(layout.filter(b=>Math.hypot(b.x+18,b.z+13)<5).length>=2,
  'Two wild shrubs must be discoverable close to the starting witches');
for(const [i,bush] of layout.entries()){
  assert.equal(bush.stage,1);
  assert.ok(Math.abs(bush.x)<26&&Math.abs(bush.z)<26);
  assert.ok(trees.every(t=>Math.hypot(t.x-bush.x,t.z-bush.z)>=1.55),
    'A berry must not grow inside a forest trunk');
  assert.ok(layout.slice(0,i).every(other=>Math.hypot(other.x-bush.x,other.z-bush.z)>=2.35));
}
const patch=new berry.WildBerries(trees),economy=new farming.Economy();
assert.equal(patch.eat(0),0,'Unripe berries cannot be eaten');
patch.step(berry.GROWTH_SECONDS);
assert.ok(patch.bushes.every(b=>b.stage===2));
patch.step(berry.GROWTH_SECONDS);
assert.ok(patch.bushes.every(b=>b.stage===3));
patch.step(500);
assert.ok(patch.bushes.every(b=>b.stage===3),'Ripe shrubs must not disappear');
const amount=patch.eat(0);
assert.equal(amount,berry.FOOD_PER_BUSH);
economy.forage(amount);
assert.equal(economy.food,farming.STARTING_FOOD+berry.FOOD_PER_BUSH);
assert.equal(patch.eat(0),0,'Cannot eat the same berries twice');
assert.equal(patch.bushes[0].stage,1,'Picked shrub must regrow from its first shape');
patch.step(2*berry.GROWTH_SECONDS);
assert.equal(patch.bushes[0].stage,3,'Picked shrub regrows');
patch.reset();
assert.equal(patch.snapshot().eaten,0);
assert.ok(patch.bushes.every(b=>b.stage===1));
console.log('PASS wild berries: original 3-stage model layout, ripening, eating, regrowth and reset');
