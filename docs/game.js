import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
window.__fightersModuleStarted=true;
const $ = id => document.getElementById(id);
const viewport = $('viewport');
const gltfRoot = 'https://raw.githubusercontent.com/NafisRayan/Animate-Rigged-Humanoid-No-Blender/5821923af517ac5fdc82505faa92a0d575fc1b1a/test/';
let renderer;
try { renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'}); }
catch(err) { $('overlay-title').textContent = 'WebGL indisponible'; $('overlay-desc').textContent = err.message; $('start').textContent = 'Navigateur incompatible'; throw err; }
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.localClippingEnabled=true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
viewport.insertBefore(renderer.domElement,viewport.firstChild);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a1325);
scene.fog = new THREE.FogExp2(0x0a1325,.018);
// True isometric projection: 45 degrees azimuth, 35.264 degrees elevation.
const CAMERA_OFFSET=new THREE.Vector3(18,18,18);
const camera=new THREE.OrthographicCamera(-11,11,11,-11,.1,180);
camera.position.copy(CAMERA_OFFSET);
const arena=window.FightersMap;
const ARENA_HALF=arena.HALF,ARENA_SIZE=arena.SIZE;
const BUILD_CLEARANCE=1;
const SPAWNS={hero:{x:-22,z:-22},enemies:{x:22,z:22}};
const WITCH_HOUSE={x:-23.5,z:-17.5,maxFootprint:5.2,doorHeading:Math.PI/4};
let witchHouse=null;
// One of seven evenly spaced positions stays open as a wide passage.
const STONE_RING_RADIUS=2.45,STONE_RING_COUNT=6,STONE_RING_SLOTS=7,
  STONE_RING_START=-5*Math.PI/7,STONE_CIRCLE_HEALTH=850;
const WITCH_HOUSE_HEALTH=1500,GARDEN_HEALTH=600;
const stoneHealing=window.FightersHealing;
const repairRules=window.FightersRepair;
const soulRules=window.FightersSouls;
const domeRules=window.FightersWitchDome;
let domeEffect=null;
const fireRules=window.FightersFireRain;
const spellDefense=window.FightersSpellDefense;
let fireEffect=null,spellDecisionElapsed=0;
let standingStoneModel=null,stoneCircleSerial=0,healingAssignmentElapsed=0;
const witchBuilding={
  id:'witch-house-01',kind:'witch-house',type:'witch-house',clanId:'witch',level:1,
  health:WITCH_HOUSE_HEALTH,maxHealth:WITCH_HOUSE_HEALTH,root:null,destroyed:false,
  hitbox:{shape:'aabb',minX:WITCH_HOUSE.x-3.5,maxX:WITCH_HOUSE.x+3.5,
    minZ:WITCH_HOUSE.z-3.5,maxZ:WITCH_HOUSE.z+3.5,minY:0,maxY:6},
  queue:[],progress:0,rally:{x:-18,z:-12},rallyMarker:null
};
let buildingSelectionRing=null;
const UNIT_RADIUS=window.FightersUnitPhysics.RADIUS;
const navigatorRTS=new window.FightersNavigation.Navigator({
  halfSize:arena.worldHalf,cellSize:1,radius:UNIT_RADIUS,region:arena
});
const forestLayout=window.FightersForest.createLayout({map:arena});
let forestObstacles=window.FightersForest.obstacles(forestLayout);
const ravenFlock=new window.FightersRavens.Flock(forestLayout,{clampPosition:arena.clamp});
function buildingVisualBounds(root){
  root.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(root);
  if(b.isEmpty())throw Error('Bâtiment sans volume visuel');
  return {shape:'aabb',minX:b.min.x,maxX:b.max.x,
    minZ:b.min.z,maxZ:b.max.z,minY:b.min.y,maxY:b.max.y};
}
function orcModelBounds(model,type){
  model.updateMatrixWorld(true);
  if(type!=='cauldron')return new THREE.Box3().setFromObject(model);
  // The source cauldron's animated/skinned pot can report an offset bind-pose
  // bounding box in Three.js. Normalize against its solid architectural mesh,
  // or the entire structure is shrunk ~10× while the HP bar stays full-size.
  const bounds=new THREE.Box3();
  model.traverse(node=>{
    if(node.isMesh&&!node.isSkinnedMesh)bounds.expandByObject(node);
  });
  if(bounds.isEmpty())throw Error('Chaudron sans corps 3D solide');
  return bounds;
}
// Runtime collision is the transformed, actual triangle-projection silhouette.
// The numeric AABB is derived from its vertices strictly for broadphase/HUD.
const footprintCache=new Map();
async function loadFootprint(file){
  const basename=file.split('/').pop().replace(/\.glb$/i,'.json');
  const url='./models/footprints/'+basename;
  if(!footprintCache.has(url))footprintCache.set(url,
    fetch(url).then(response=>{
      if(!response.ok)throw Error('GLB silhouette HTTP '+response.status+' '+url);
      return response.json();
    }).then(data=>{
      if(data.type!=='glb-projected-triangle-union-xz')throw Error('Invalid projected footprint '+url);
      window.FightersFootprints.shapeFromPolygons(data.polygons);return data;
    }));
  return footprintCache.get(url);
}
function buildingBounds(model,projection){
  if(!projection?.polygons?.length)throw Error('GLB projected XZ collision shape missing');
  model.updateWorldMatrix(true,true);
  const position=new THREE.Vector3();
  const transformed=projection.polygons.map(poly=>poly.map(ring=>ring.map(([x,z])=>{
    position.set(x,0,z).applyMatrix4(model.matrixWorld);
    return [position.x,position.z];
  })));
  const footprint=window.FightersFootprints.shapeFromPolygons(transformed);
  const visual=new THREE.Box3().setFromObject(model);
  return {...footprint,minY:visual.min.y,maxY:visual.max.y};
}
function prototypeBuildingBounds(projection,center,scale){
  // New buildings are placed without yaw; derive their EXACT projected
  // silhouette from the very same GLB and actual renderer scale.
  return window.FightersFootprints.shapeFromPolygons(
    projection.polygons.map(poly=>poly.map(ring=>
      ring.map(([x,z])=>[(x-center.x)*scale,(z-center.z)*scale]))));
}

function liveBuildings(){return [witchBuilding,...buildingInstances.values()].filter(b=>!b.destroyed);}
function circleUnlocked(){return soulRules.canBuildCircle(liveBuildings());}
function arcanistUnlocked(){return soulRules.canTrainMage(liveBuildings());}
function updateNavObstacles(){
  navigatorRTS.setObstacles([...forestObstacles,
    // Garden beds are walkable so workers can tend crops from inside the plot.
    // Stone circles are walkable sanctuaries with only the six menhirs solid.
    // Their outer footprints still block overlapping construction and receive hits.
    ...liveBuildings().filter(b=>b.type!=='garden'&&b.type!=='stone-circle')
      .map(b=>({id:b.id,...b.hitbox})),
    ...liveBuildings().filter(b=>b.type==='stone-circle')
      .flatMap(b=>stoneRingObstacles(b.root.position.x,b.root.position.z,b.id))]);
  for(const actor of units){actor.route=null;actor.routeVersion=-1;}
}
function drawBuildingSelection(){
  if(buildingSelectionRing){
    scene.remove(buildingSelectionRing);
    buildingSelectionRing.traverse(node=>{
      node.geometry?.dispose();node.material?.dispose();
    });
    buildingSelectionRing=null;
  }
  if(!selectedBuilding?.hitbox)return;
  const group=new THREE.Group(),shape=selectedBuilding.hitbox;
  const color=selectedBuilding.clanId==='witch'?0xc2f5a3:0xf8c47f;
  for(const poly of shape.polygons)for(const ring of poly){
    const points=ring.map(([x,z])=>new THREE.Vector3(x,.08,z));
    if(points.length<3)continue;
    points.push(points[0].clone());
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({color,depthTest:false}));
    line.renderOrder=10;group.add(line);
  }
  buildingSelectionRing=group;scene.add(buildingSelectionRing);
}

const INV_SQRT2=Math.SQRT1_2;
// Input stays in screen coordinates even though the world axes are diagonal.
function screenToWorld(horizontal,vertical){
  return {x:(horizontal+vertical)*INV_SQRT2,z:(vertical-horizontal)*INV_SQRT2};
}
// Quaternius looks toward +Z at zero yaw. Gameplay, combat and the rendered
// model share this exact world-space X/Z heading.
function faceDirection(actor,x,z){
  const length=Math.hypot(x,z);
  if(length<1e-6)return;
  actor.heading.x=x/length;actor.heading.z=z/length;
  if(Math.abs(x)>1e-5)actor.facing=x>0?1:-1;
}
function applyFacing(actor){
  actor.visual.rotation.y=Math.atan2(actor.heading.x,actor.heading.z);
}
function faceTarget(actor,target){
  faceDirection(actor,target.root.position.x-actor.root.position.x,
    target.root.position.z-actor.root.position.z);
}
scene.add(new THREE.HemisphereLight(0xd6e7ff,0x203051,2.65));
const key = new THREE.DirectionalLight(0xffe7cf,3.1);key.position.set(-9,16,10);scene.add(key);
const blue = new THREE.DirectionalLight(0x558df8,1.6);blue.position.set(4,8,-6);scene.add(blue);
const pink = new THREE.PointLight(0xfa498a,35,25);pink.position.set(-6,6,-4);scene.add(pink);
const loader = new GLTFLoader();
// The authored CC0 sword uses EXT_meshopt_compression, unlike the two character GLBs.
// Register decoder before parsing ANY GLTF so equipping a sword cannot abort startup.
loader.setMeshoptDecoder(MeshoptDecoder);
// Two shared CC0 tree GLBs (red and dead) and one tiny CC0 bundle of logs.
// Keep references to individual instance matrices so felling a tree is just
// a zero-scale GPU instance update, never a forest-wide mesh rebuild.
const WOOD_PER_TREE=80;
let forestLoadedSpecies=0,forestPromise=null,woodBundleTemplate=null;
let woodBundleScale=1,woodBundleCenter=null,woodBundleFloor=0;
const forestVisuals=forestLayout.map(()=>[]),fallenLogBundles=new Map(),woodDeposits=new Map();
const hiddenTreeMatrix=new THREE.Matrix4().makeScale(0,0,0);
function setTreeVisible(index,visible){
  for(const entry of forestVisuals[index]||[]){
    entry.batch.setMatrixAt(entry.instance,visible?entry.matrix:hiddenTreeMatrix);
    entry.batch.instanceMatrix.needsUpdate=true;
  }
}
function placeLogBundle(index){
  const tree=forestLayout[index];
  if(!tree?.felled||!woodDeposits.has(index)||!woodBundleTemplate||fallenLogBundles.has(index))return;
  const root=new THREE.Group(),model=woodBundleTemplate.clone(true);
  model.scale.setScalar(woodBundleScale);
  model.position.set(-woodBundleCenter.x*woodBundleScale,
    -woodBundleFloor*woodBundleScale,-woodBundleCenter.z*woodBundleScale);
  root.position.set(tree.x,0,tree.z);root.add(model);
  scene.add(root);fallenLogBundles.set(index,root);
}
function removeLogBundle(index){
  const root=fallenLogBundles.get(index);
  if(root)scene.remove(root);
  fallenLogBundles.delete(index);
}
function fellTree(index){
  const tree=forestLayout[index];
  if(!tree||tree.felled)return false;
  tree.felled=true;woodDeposits.set(index,{amount:WOOD_PER_TREE,reservedBy:null});
  setTreeVisible(index,false);placeLogBundle(index);
  forestObstacles=window.FightersForest.obstacles(forestLayout);
  updateNavObstacles();return true;
}
function resetForest(){
  for(let i=0;i<forestLayout.length;i++){
    forestLayout[i].felled=false;setTreeVisible(i,true);
  }
  for(const root of fallenLogBundles.values())scene.remove(root);
  fallenLogBundles.clear();woodDeposits.clear();
  forestObstacles=window.FightersForest.obstacles(forestLayout);
}
function loadForest(){
  if(forestPromise)return forestPromise;
  const trees=window.FightersForest.TYPES.map(async kind=>{
    try{
      const gltf=await loader.loadAsync('./models/forest/'+kind+'.glb');
      const source=gltf.scene;
      source.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(source);
      const size=bounds.getSize(new THREE.Vector3());
      if(size.y<.01)throw Error('Tree model has no height: '+kind);
      const center=bounds.getCenter(new THREE.Vector3());
      const trees=forestLayout.map((tree,index)=>({tree,index}))
        .filter(entry=>entry.tree.type===kind);
      const placement=new THREE.Matrix4(),offset=new THREE.Matrix4()
        .makeTranslation(-center.x,-bounds.min.y,-center.z);
      const orientation=new THREE.Quaternion(),axis=new THREE.Vector3(0,1,0);
      source.traverse(mesh=>{
        if(!mesh.isMesh)return;
        const batch=new THREE.InstancedMesh(mesh.geometry,mesh.material,trees.length);
        batch.name='forest-'+kind;
        batch.castShadow=false;batch.receiveShadow=false;
        for(let i=0;i<trees.length;i++){
          const {tree,index}=trees[i],scale=tree.height/size.y;
          orientation.setFromAxisAngle(axis,tree.angle);
          placement.compose(new THREE.Vector3(tree.x,0,tree.z),orientation,
            new THREE.Vector3(scale,scale,scale));
          placement.multiply(offset).multiply(mesh.matrixWorld);
          forestVisuals[index].push({batch,instance:i,matrix:placement.clone()});
          batch.setMatrixAt(i,tree.felled?hiddenTreeMatrix:placement);
        }
        batch.instanceMatrix.needsUpdate=true;
        batch.computeBoundingSphere();
        scene.add(batch);
      });
      forestLoadedSpecies++;
    }catch(error){console.warn('Forest model unavailable:',kind,error);}
  });
  const wood=loader.loadAsync('./models/forest/logs.glb').then(gltf=>{
    woodBundleTemplate=gltf.scene;
    woodBundleTemplate.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(woodBundleTemplate);
    if(bounds.isEmpty())throw Error('Empty CC0 log bundle model');
    woodBundleCenter=bounds.getCenter(new THREE.Vector3());
    woodBundleFloor=bounds.min.y;
    woodBundleScale=1.15/Math.max(bounds.max.x-bounds.min.x,.01);
    for(let i=0;i<forestLayout.length;i++)placeLogBundle(i);
  }).catch(error=>console.warn('CC0 log bundle unavailable:',error));
  forestPromise=Promise.all([...trees,wood]);
  return forestPromise;
}

// Real Polyfork animated crow GLB, fetched directly from the author's CDN as
// required by its free license (no mirroring/redistribution). Four familiars
// share its skinned geometry and the native Fly / Idle animations.
const ravenVisuals=[];
let ravenLoadPromise=null,ravenModelLoaded=false;
function loadRavens(){
  if(ravenLoadPromise)return ravenLoadPromise;
  ravenLoadPromise=(async()=>{
    const {data}=await fetchAsset('https://polyfork.dev/cdn/crow-base.glb');
    const gltf=await loader.parseAsync(data,'');
    const flight=gltf.animations.find(clip=>clip.name==='Fly');
    const idle=gltf.animations.find(clip=>clip.name==='Idle');
    if(!flight||!idle)throw Error('Animations natives du corbeau manquantes');
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    const size=bounds.getSize(new THREE.Vector3());
    if(bounds.isEmpty()||Math.max(size.x,size.z)<.01)throw Error('Modèle de corbeau vide');
    const scale=.92/Math.max(size.x,size.z);
    const center=bounds.getCenter(new THREE.Vector3());
    for(const raven of ravenFlock.ravens){
      const root=new THREE.Group(),model=cloneSkeleton(gltf.scene);
      model.scale.setScalar(scale);
      model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      root.add(model);scene.add(root);
      const mixer=new THREE.AnimationMixer(model);
      const fly=mixer.clipAction(flight),rest=mixer.clipAction(idle);
      const ring=new THREE.Mesh(sharedSelectionGeometry,sharedSelectionMaterials.witch);
      ring.rotation.x=-Math.PI/2;ring.position.y=-.09;
      ring.renderOrder=20;ring.visible=false;root.add(ring);
      rest.play();
      ravenVisuals.push({root,model,mixer,fly,rest,ring,mode:'perched'});
    }
    ravenModelLoaded=true;
    syncRavenVisuals(0);
  })().catch(error=>{console.warn('Corbeaux 3D indisponibles:',error);});
  return ravenLoadPromise;
}
function syncRavenVisuals(dt){
  for(let i=0;i<ravenVisuals.length;i++){
    const raven=ravenFlock.ravens[i],visual=ravenVisuals[i];
    if(!raven)continue;
    visual.root.position.set(raven.x,raven.y,raven.z);
    visual.root.rotation.y=raven.heading;
    visual.root.visible=activeFaction==='witch'||
      fogOfWar.exploredAt(raven.x,raven.z,activeFaction);
    visual.ring.visible=activeFaction==='witch'&&selectedRaven?.id===raven.id;
    if(visual.mode!==raven.mode){
      const next=raven.mode==='flying'?visual.fly:visual.rest;
      const old=visual.mode==='flying'?visual.fly:visual.rest;
      next.reset().play().crossFadeFrom(old,.2,false);
      visual.mode=raven.mode;
    }
    if(!paused)visual.mixer.update(dt);
  }
}

// Sixteen independent wild hares share one light, real low-poly 3D model.
// They are scenery/food, not selectable units, fog scouts or minimap markers.
const hareVisuals=[];
let hareLoadPromise=null,hareModelLoaded=false;
function loadHares(){
  if(hareLoadPromise)return hareLoadPromise;
  hareLoadPromise=(async()=>{
    const {data}=await fetchAsset('https://polyfork.dev/cdn/forest-rabbit-ea2da0.glb');
    const gltf=await loader.parseAsync(data,'');
    const bounds=new THREE.Box3().setFromObject(gltf.scene);
    if(bounds.isEmpty())throw Error('Modèle de lièvre vide');
    const size=bounds.getSize(new THREE.Vector3());
    const scale=.53/Math.max(size.x,size.z);
    const center=bounds.getCenter(new THREE.Vector3());
    for(const hare of hareField.hares){
      const root=new THREE.Group(),model=cloneSkeleton(gltf.scene);
      model.scale.setScalar(scale);
      model.position.set(-center.x*scale,-bounds.min.y*scale,-center.z*scale);
      root.add(model);scene.add(root);hareVisuals.push(root);
    }
    hareModelLoaded=true;syncHareVisuals();
  })().catch(error=>{console.warn('Lièvres 3D indisponibles:',error);});
  return hareLoadPromise;
}
function syncHareVisuals(){
  for(let i=0;i<hareVisuals.length;i++){
    const hare=hareField.hares[i],root=hareVisuals[i];
    const pose=orcFoodRules.hareAnimationPose(hare,hareField.elapsed);
    root.visible=hare.active&&fogOfWar.exploredAt(hare.x,hare.z,activeFaction);
    root.position.set(hare.x,pose.height,hare.z);
    root.rotation.y=hare.heading;
    root.rotation.x=pose.pitch;
    root.scale.set(pose.squash,pose.stretch,pose.squash);
  }
}




const clamp=THREE.MathUtils.clamp;
const TRAIN_COST=120, TRAIN_DURATION=3.5;
const roles=window.FightersRoles;
const farming=new window.FightersFarming.Economy();
const orcFoodRules=window.FightersOrcFood;
const orcFood=new orcFoodRules.Economy();
const hareField=new orcFoodRules.Hares({halfSize:arena.worldHalf,
  walkable:(x,z)=>navigatorRTS.pointClear({x,z})});
let orcForageElapsed=0,orcFamineAlerted=false;
let farmAssignmentElapsed=0,farmSerial=0,famineAlerted=false;
const wildBerries=new window.FightersBerries.WildBerries(forestLayout,{map:arena});
let berryAssignmentElapsed=0;
const ROLE_IDS=roles.ROLE_IDS,ROLE_DEFINITIONS=roles.DEFINITIONS;
const ORC_COSTS={barrack:180,hut:120,cauldron:200,factory:250,wall:32};
// Deposits are fixed map resources, not structures that players or the AI can build.
const ORC_NAMES={barrack:'Caserne',hut:'Hutte',mine:'Mine',cauldron:'Chaudron',factory:'Atelier',wall:'Mur de pierre'};
const units=[],selected=new Set();
const soulEffects=[];
let magic=0,orcMagic=0,soulAssignmentElapsed=0;
let female=null,male=null,swordModel=null,clothingFemale=null,clothingMale=null,hairBuns=null,hairBuzzed=null,hairParted=null,hairLong=null;
const sharedClipCatalog=new Map(),sharedCostumeMaterials=new Map();
// One shared, translucent ground-level ring per selected unit. Disable depth
// testing so paved streets and shallow building surfaces cannot bury it.
const sharedSelectionGeometry=new THREE.RingGeometry(.71,.88,40);
const sharedSelectionMaterials={witch:new THREE.MeshBasicMaterial({
    color:0xbaff68,transparent:true,opacity:.38,side:THREE.DoubleSide,
    depthTest:false,depthWrite:false,toneMapped:false}),
  orc:new THREE.MeshBasicMaterial({
    color:0xffd279,transparent:true,opacity:.38,side:THREE.DoubleSide,
    depthTest:false,depthWrite:false,toneMapped:false})};
const INITIAL_WOOD=Object.freeze({witch:250,orc:350});
let ready=false,running=false,paused=false,activeFaction='witch',gold={witch:2000,orc:900},
  wood={...INITIAL_WOOD},buildMode=null;
let selectedBuilding=null,selectedRaven=null,nextUnitId=1,qaPassive=false,orcSpawned=false;
let rallyMode=false,constructionTab=false,lastHudSignature='';
const ORC_TRAIN_COST=100,ORC_TRAIN_DURATION=4.5,MAX_QUEUE=8;
const orcDirector=new window.FightersOrcStrategy.Director();
const witchDirector=new window.FightersWitchStrategy.Director();
const qaMode=new URLSearchParams(location.search).has('qa');
let chosenFaction='witch';
orcDirector.enabled=false;witchDirector.enabled=false;
let orcIncomeFraction=0,attackMode=false,strategyAccumulator=0;
let witchStrategyAccumulator=0;
let ravenMoveMode=false;
let completedMiningCycles=0,totalMinedGold=0;
let qaPassiveKind=null;
// Fog stays in physical X/Z coordinates so sight radii remain circular even
// though the battlefield's visible boundaries follow isometric screen axes.
const fogOfWar=new window.FightersFog.FogGrid({
  halfSize:arena.worldHalf,cellSize:.5,radius:7.5,fade:1.25
});
const orcSound=new window.FightersSound.Engine({
  categories:['interaction','creation','attack','loud','work'],
  assetVersion:'deep-orcs-20261105'
});
const witchSound=new window.FightersSound.Engine({
  categories:['interaction','creation','attack','destruction','work'],
  allowEmptyCategories:['destruction'],
  manifestUrl:'./sounds/witches/manifest.json',
  rootUrl:'./sounds/witches/',
  assetVersion:'role-witch-shouts-20261105',
  contextFactory:()=>orcSound.context
});
const effects=new window.FightersEffects.Engine({
  contextFactory:()=>orcSound.context,listener:()=>cameraFollow
});
// Each clan keeps its own permanent memory of enemy structures; never share it.
const knownEnemyBuildings={witch:new Set(),orc:new Set()};
const fogTexture=new THREE.DataTexture(fogOfWar.textureData('witch'),
  fogOfWar.size,fogOfWar.size,THREE.RGBAFormat);
fogTexture.minFilter=THREE.LinearFilter;fogTexture.magFilter=THREE.LinearFilter;
fogTexture.generateMipmaps=false;fogTexture.needsUpdate=true;
const fogShader=new THREE.ShaderMaterial({
  transparent:true,depthTest:false,depthWrite:false,
  uniforms:{
    mask:{value:fogTexture},origin:{value:new THREE.Vector2()},
    right:{value:new THREE.Vector2()},up:{value:new THREE.Vector2()},
    halfSize:{value:arena.worldHalf},worldSize:{value:arena.worldHalf*2},
    exploredBrightness:{value:1.0}
  },
  vertexShader:`varying vec2 vUv;
    void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`,
  fragmentShader:`varying vec2 vUv;
    uniform sampler2D mask;
    uniform vec2 origin,right,up;
    uniform float halfSize,worldSize,exploredBrightness;
    void main(){
      vec2 world=origin+right*vUv.x+up*vUv.y;
      vec2 uv=(world+vec2(halfSize))/worldSize;
      if(uv.x<0.0||uv.y<0.0||uv.x>=1.0||uv.y>=1.0){
        // The playable ground ends here, not the rendered world. Trees,
        // roofs and silhouettes may extend beyond the ground's edge.
        gl_FragColor=vec4(0.0,0.0,0.0,0.0);return;
      }
      vec2 coverage=texture2D(mask,uv).rg;
      // Never visited: black. Once explored, terrain remains fully revealed.
      // The live-sight channel is still tracked separately for enemy targeting.
      float light=max(coverage.g,coverage.r*exploredBrightness);
      gl_FragColor=vec4(0.0,0.0,0.0,1.0-light);
    }`
});
const fogScene=new THREE.Scene(),fogCamera=new THREE.Camera();
const fogQuad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),fogShader);
fogQuad.frustumCulled=false;fogScene.add(fogQuad);
const fogRay=new THREE.Raycaster(),fogNDC=new THREE.Vector2();
const fogFloor=new THREE.Plane(new THREE.Vector3(0,1,0),0);
const fogBL=new THREE.Vector3(),fogBR=new THREE.Vector3(),fogTL=new THREE.Vector3();
let fogStarted=false,fogElapsed=0;
function fogSampleCorner(nx,ny,out){
  fogNDC.set(nx,ny);fogRay.setFromCamera(fogNDC,camera);
  fogRay.ray.intersectPlane(fogFloor,out);
}
function positionFogOverlay(){
  camera.updateMatrixWorld();
  fogSampleCorner(-1,-1,fogBL);
  fogSampleCorner(1,-1,fogBR);
  fogSampleCorner(-1,1,fogTL);
  fogShader.uniforms.origin.value.set(fogBL.x,fogBL.z);
  fogShader.uniforms.right.value.set(fogBR.x-fogBL.x,fogBR.z-fogBL.z);
  fogShader.uniforms.up.value.set(fogTL.x-fogBL.x,fogTL.z-fogBL.z);
}
function buildingInDiscoveredZone(building,clan){
  const h=building.hitbox;
  if(!h)return false;
  const midX=(h.minX+h.maxX)/2,midZ=(h.minZ+h.maxZ)/2;
  // Large/irregular buildings are discovered by their perimeter as well as
  // their centre. Five axis samples alone could leave the model invisible
  // while a nearby soldier was already attacking the exposed corner.
  // Keep the exact nine samples and short-circuit order without allocating
  // nine coordinate arrays every time a health bar is updated.
  return fogOfWar.exploredAt(midX,midZ,clan)||
    fogOfWar.exploredAt(h.minX,midZ,clan)||
    fogOfWar.exploredAt(h.maxX,midZ,clan)||
    fogOfWar.exploredAt(midX,h.minZ,clan)||
    fogOfWar.exploredAt(midX,h.maxZ,clan)||
    fogOfWar.exploredAt(h.minX,h.minZ,clan)||
    fogOfWar.exploredAt(h.minX,h.maxZ,clan)||
    fogOfWar.exploredAt(h.maxX,h.minZ,clan)||
    fogOfWar.exploredAt(h.maxX,h.maxZ,clan);
}
function groundSightSources(clan,structures=liveBuildings()){
  const ownership=clan==='witch'?'witch':'orcs';
  const sources=units.filter(actor=>actor.kind===clan&&!actor.dead)
    .map(actor=>({x:actor.root.position.x,z:actor.root.position.z}));
  // Completed clan buildings have the same sight radius as a character.
  // Natural gold mines are deposits, not watchtowers.
  for(const b of structures){
    if(b.clanId!==ownership||b.type==='mine'||b.type==='wall'||!b.hitbox)continue;
    sources.push({x:(b.hitbox.minX+b.hitbox.maxX)/2,
      z:(b.hitbox.minZ+b.hitbox.maxZ)/2});
  }
  return sources;
}
function updateVision(){
  const structures=liveBuildings();
  for(const [clan,ownership] of [['witch','witch'],['orc','orcs']]){
    const sources=groundSightSources(clan,structures);
    if(clan==='witch'&&ravenModelLoaded)sources.push(...ravenFlock.visionSources());
    fogOfWar.update(clan,sources);
    for(const b of structures){
      if(b.clanId!==ownership&&b.clanId!=='neutral'&&buildingInDiscoveredZone(b,clan))
        knownEnemyBuildings[clan].add(b.id);
    }
  }
  // Only active-faction discovery controls gameplay visibility. The player
  // keeps seeing all units in discovered zones, even after scouts leave;
  // the Orc clan's discovery never leaks into the Witch player's map.
  const ownership=activeFaction==='witch'?'witch':'orcs';
  for(const actor of units){
    actor.root.visible=actor.kind===activeFaction||
      fogOfWar.exploredAt(actor.root.position.x,actor.root.position.z,activeFaction);
  }
  for(const b of structures){
    const friendly=b.clanId===ownership;
    const discovered=buildingInDiscoveredZone(b,activeFaction);
    if(b.root)b.root.visible=friendly||discovered;
    if(b.healthBar)b.healthBar.root.visible=(friendly||discovered)&&
      (b.health<b.maxHealth||selectedBuilding===b);
  }
  for(const job of pendingBuilds)if(job.preview){
    const owner=buildFaction(job.type);
    job.preview.root.visible=owner===activeFaction||
      fogOfWar.exploredAt(job.x,job.z,activeFaction);
  }
  fogTexture.image.data=fogOfWar.textureData(activeFaction);
  fogTexture.needsUpdate=true;
}
function visibleToPlayer(x,z){
  return fogOfWar.exploredAt(x,z,activeFaction);
}
// Units in explored terrain remain visible and audible; units in the
// never-discovered black territory remain hidden and silent.
const ROLE_VOICE=Object.freeze({
  witch:Object.freeze({worker:'worker',melee:'guard',ranged:'arcane',elder:'elder'}),
  orc:Object.freeze({worker:'worker',melee:'warrior',ranged:'shaman',brute:'brute'})
});
function playOrcVoice(category,actorOrPosition){
  const actor=actorOrPosition?.root?actorOrPosition:null;
  const position=actor?.root.position||actorOrPosition;
  if(!running||paused||!position||!visibleToPlayer(position.x,position.z))return false;
  const {x,z}=position;
  // The callback is evaluated again after asynchronous MP3 fetch/decode.
  void orcSound.play(category,()=>running&&!paused&&visibleToPlayer(x,z),
    actor?{voice:ROLE_VOICE.orc[actor.role],variant:actor.voiceLineIndex}:{});
  return true;
}
function playWitchVoice(category,actorOrPosition){
  const actor=actorOrPosition?.root?actorOrPosition:null;
  const position=actor?.root.position||actorOrPosition;
  if(!running||paused||!position||!visibleToPlayer(position.x,position.z))return false;
  const {x,z}=position;
  const options=actor?{voice:ROLE_VOICE.witch[actor.role],unitId:actor.id}:{};
  void witchSound.play(category,()=>running&&!paused&&visibleToPlayer(x,z),options);
  return true;
}
// Every physical interaction has its own short material-specific recording.
// The dedicated SFX bus preserves dialogue and limits noise in large battles.
function playEffect(type,position){
  if(!running||paused||!position||!visibleToPlayer(position.x,position.z))return;
  void effects.play(type,position,
    ()=>running&&!paused&&visibleToPlayer(position.x,position.z));
}
function clearWitchDome(){
  if(!domeEffect)return;
  for(const mesh of [domeEffect.shell,domeEffect.ring]){
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();mesh.material.dispose();
  }
  domeEffect=null;
}
function castWitchDome(building=selectedBuilding,{byAI=false}={}){
  if(!domeRules.canCast(building,magic,{faction:byAI?'witch':activeFaction,running,paused,
    active:!!domeEffect})||byAI&&!witchDirector.enabled)return false;
  const {hitbox}=building;
  const x=(hitbox.minX+hitbox.maxX)/2,z=(hitbox.minZ+hitbox.maxZ)/2;
  // One shared translucent hemisphere and rim per activation, with no mesh
  // per enemy. Both are removed and their GPU resources freed after the spell.
  const shell=new THREE.Mesh(new THREE.SphereGeometry(1,48,24,0,Math.PI*2,0,Math.PI/2),
    new THREE.MeshBasicMaterial({color:0x348dff,transparent:true,opacity:.19,
      side:THREE.DoubleSide,depthWrite:false}));
  shell.position.set(x,.07,z);shell.scale.setScalar(.001);shell.renderOrder=12;
  const ring=new THREE.Mesh(new THREE.RingGeometry(.982,1.014,96),
    new THREE.MeshBasicMaterial({color:0x7edbff,transparent:true,opacity:.77,
      side:THREE.DoubleSide,depthWrite:false}));
  ring.rotation.x=-Math.PI/2;ring.position.set(x,.12,z);
  ring.scale.setScalar(.001);ring.renderOrder=13;
  scene.add(shell,ring);
  domeEffect={buildingId:building.id,x,z,elapsed:0,shell,ring,radius:0};
  magic=Math.max(0,magic-domeRules.COST);
  // The recorded four-voice cry is already mixed with 100% wet echoes and
  // reverberation; it is heard regardless of camera position.
  void effects.play('dome',{x,z},()=>running&&!paused);
  showBanner('DÔME ARCANIQUE · 100 MAGIE');
  refreshHUD();return true;
}
function stepWitchDome(dt){
  if(!domeEffect)return;
  const dome=domeEffect;
  dome.elapsed+=dt;
  const radius=domeRules.radiusAt(dome.elapsed);
  dome.radius=radius;
  dome.shell.scale.setScalar(Math.max(.001,radius));
  dome.ring.scale.setScalar(Math.max(.001,radius));
  const fading=Math.max(0,Math.min(1,(domeRules.DURATION-dome.elapsed)/1.5));
  dome.shell.material.opacity=.19*fading;
  dome.ring.material.opacity=.77*fading;
  for(const actor of units){
    if(actor.dead||actor.kind!=='orc'||
      !domeRules.inRange(dome,actor.root.position,radius))continue;
    // Standard death cleanup is maintained, but the corpses dissipate fast.
    dealDamage(actor,actor.health,null);
    actor.deadTime=Math.min(actor.deadTime,1.25);
  }
  if(dome.elapsed>=domeRules.DURATION){clearWitchDome();refreshHUD();}
}
function clearFireRain(){
  if(!fireEffect)return;
  for(const mesh of [fireEffect.bolts,fireEffect.trails,fireEffect.impacts]){
    mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();
  }
  fireEffect.light.parent?.remove(fireEffect.light);
  fireEffect=null;
}
function castFireRain(building=selectedBuilding,{byAI=false}={}){
  if(!fireRules.canCast(building,orcMagic,{faction:byAI?'orc':activeFaction,
    running,paused,active:!!fireEffect})||byAI&&!orcDirector.enabled)return false;
  const x=(building.hitbox.minX+building.hitbox.maxX)/2;
  const z=(building.hitbox.minZ+building.hitbox.maxZ)/2;
  const amount=54,stars=[],dummy=new THREE.Object3D();
  // GPU instancing: 54 fireballs and their glowing trails cost two draw calls,
  // even during a large engagement. Each has a slightly different trajectory.
  const bolts=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.32,1),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.95,
      depthWrite:false,toneMapped:false}),amount);
  const trails=new THREE.InstancedMesh(new THREE.CylinderGeometry(.02,.18,2.2,7),
    new THREE.MeshBasicMaterial({color:0xff6f21,transparent:true,opacity:.68,
      blending:THREE.AdditiveBlending,depthWrite:false,toneMapped:false}),amount);
  const impacts=new THREE.InstancedMesh(new THREE.RingGeometry(.3,.85,28),
    new THREE.MeshBasicMaterial({color:0xffae45,transparent:true,opacity:.68,
      blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
      depthWrite:false,toneMapped:false}),amount);
  for(const mesh of [bolts,trails,impacts]){
    mesh.frustumCulled=false;mesh.renderOrder=14;scene.add(mesh);
  }
  for(let i=0;i<amount;i++){
    const angle=i*2.399963+Math.sin(i*19.17)*.27;
    const distance=Math.sqrt((i+.5)/amount)*fireRules.RADIUS*.96;
    stars.push({x:x+Math.cos(angle)*distance,z:z+Math.sin(angle)*distance,
      start:.08+i*3.3/amount,fall:.63+(i%7)*.075,
      driftX:Math.cos(i*1.37)*2.7,driftZ:Math.sin(i*1.87)*2.7});
    const flame=new THREE.Color().setHSL(.035+(i%5)*.014,1,.52+(i%4)*.07);
    bolts.setColorAt(i,flame);
  }
  bolts.instanceColor.needsUpdate=true;
  const light=new THREE.PointLight(0xff6619,2,23);
  light.position.set(x,9,z);scene.add(light);
  fireEffect={buildingId:building.id,x,z,elapsed:0,radius:0,
    bolts,trails,impacts,light,stars,dummy};
  orcMagic=Math.max(0,orcMagic-fireRules.COST);
  void effects.play('fireRain',{x,z},()=>running&&!paused);
  showBanner('PLUIE DE FEU · 100 MAGIE');refreshHUD();return true;
}
function stepFireRain(dt){
  if(!fireEffect)return;
  const effect=fireEffect;effect.elapsed+=dt;
  const fade=Math.min(1,(fireRules.DURATION-effect.elapsed)/.85);
  effect.radius=fireRules.impactRadiusAt(effect.elapsed);
  effect.light.intensity=2.6*Math.max(0,fade)*(.83+.17*Math.sin(effect.elapsed*17));
  const {dummy,bolts,trails,impacts}=effect;
  for(let i=0;i<effect.stars.length;i++){
    const star=effect.stars[i],age=effect.elapsed-star.start,
      phase=age/star.fall,visible=phase>=0&&phase<1;
    if(visible){
      const y=25-24*phase*phase;
      const px=star.x+star.driftX*(1-phase),pz=star.z+star.driftZ*(1-phase);
      dummy.position.set(px,y,pz);dummy.rotation.set(0,0,0);
      dummy.scale.setScalar(.84+.25*Math.sin(phase*23+i));
      dummy.updateMatrix();bolts.setMatrixAt(i,dummy.matrix);
      dummy.position.y+=1.22;dummy.rotation.set(.1,0,-.22);
      dummy.scale.set(.75,1+.6*phase,.75);dummy.updateMatrix();
      trails.setMatrixAt(i,dummy.matrix);
    }else{
      dummy.scale.setScalar(0);dummy.updateMatrix();
      bolts.setMatrixAt(i,dummy.matrix);trails.setMatrixAt(i,dummy.matrix);
    }
    const impactAge=age-star.fall,impactVisible=impactAge>=0&&impactAge<.45;
    dummy.position.set(star.x,.12,star.z);dummy.rotation.set(-Math.PI/2,0,0);
    dummy.scale.setScalar(impactVisible?(1+impactAge*2.8)*(1-impactAge/.5):0);
    dummy.updateMatrix();impacts.setMatrixAt(i,dummy.matrix);
  }
  bolts.instanceMatrix.needsUpdate=true;
  trails.instanceMatrix.needsUpdate=true;
  impacts.instanceMatrix.needsUpdate=true;
  if(effect.elapsed>=fireRules.START_DAMAGE&&effect.elapsed<=fireRules.END_DAMAGE){
    for(const actor of units){
      if(actor.dead||actor.kind!=='witch'||
        !fireRules.inRange(effect,actor.root.position,effect.radius))continue;
      dealDamage(actor,actor.health,null);
      actor.deadTime=Math.min(actor.deadTime,1.25);
    }
  }
  if(effect.elapsed>=fireRules.DURATION){clearFireRain();refreshHUD();}
}
function stepSpellDefense(dt){
  spellDecisionElapsed+=dt;
  if(spellDecisionElapsed<1.5)return;
  spellDecisionElapsed=0;
  const homes=[...buildingInstances.values()].filter(b=>!b.destroyed&&b.type==='hut'&&b.level>=3);
  if(witchDirector.enabled&&!witchBuilding.destroyed&&witchBuilding.level>=3)homes.push(witchBuilding);
  for(const home of homes){
    const faction=home.clanId==='witch'?'witch':'orc';
    if(!(faction==='witch'?witchDirector.enabled:orcDirector.enabled)||
      (faction==='witch'?magic:orcMagic)<100)continue;
    const center={x:(home.hitbox.minX+home.hitbox.maxX)/2,
      z:(home.hitbox.minZ+home.hitbox.maxZ)/2};
    const threat=spellDefense.assess({faction,center,units,radius:domeRules.RADIUS,
      visible:(x,z,clan)=>fogOfWar.visibleAt(x,z,clan)});
    if(!threat.threatened)continue;
    if(faction==='witch'){
      if(!domeRules.canCast(home,magic,{faction:'witch',running,paused,
        active:!!domeEffect}))continue;
      castWitchDome(home,{byAI:true});
    }else if(castFireRain(home,{byAI:true}))break;
  }
}
function playConstructionHit(actor){playEffect('hammer',actor.root.position);}
const ravenSoundState=new Map();
function tickRavenSounds(){
  const now=performance.now();
  for(const raven of ravenFlock.ravens){
    let state=ravenSoundState.get(raven.id);
    if(!state){
      state={mode:raven.mode,nextWing:0,
        nextCaw:now+1400+Math.random()*2300};
      ravenSoundState.set(raven.id,state);
    }
    if(raven.mode==='flying'&&
      (state.mode!=='flying'||now>=state.nextWing)){
      playEffect('wing',raven);
      state.nextWing=now+720+Math.random()*250;
    }
    if(now>=state.nextCaw){
      playEffect('caw',raven);
      state.nextCaw=now+4600+Math.random()*5000;
    }
    state.mode=raven.mode;
  }
}
function acknowledgeOrcOrder(actors){
  // A single voice for a whole squad, never one voice per unit.
  const actor=[...actors].find(a=>a.kind==='orc'&&!a.dead&&
    visibleToPlayer(a.root.position.x,a.root.position.z));
  if(actor)playOrcVoice('interaction',actor);
}
function acknowledgePlayerOrder(actors,category='interaction'){
  const members=[...actors];
  if(members.some(actor=>actor.kind==='orc'&&!actor.dead)){
    if(category==='interaction')return acknowledgeOrcOrder(members);
    const actor=members.find(a=>a.kind==='orc'&&!a.dead&&
      visibleToPlayer(a.root.position.x,a.root.position.z));
    if(actor)playOrcVoice(category,actor);
    return;
  }
  const actor=members.find(a=>a.kind==='witch'&&!a.dead&&
    visibleToPlayer(a.root.position.x,a.root.position.z));
  if(actor)playWitchVoice(category,actor);
}
let lastOrcAiVoice=-Infinity;
function acknowledgeOrcAiOrder(actors){
  // Autonomous decisions can happen four times per second. Only announce
  // meaningful NEW tasks, with an additional 3.5s AI-specific throttle.
  const now=performance.now();
  if(now-lastOrcAiVoice<3500)return;
  const actor=[...actors].find(a=>a.kind==='orc'&&!a.dead&&
    visibleToPlayer(a.root.position.x,a.root.position.z));
  if(actor&&playOrcVoice('interaction',actor))lastOrcAiVoice=now;
}

// Warcraft II's always-visible minimap. One 112×112 CPU buffer is reused;
// it consumes ~49 KiB, without textures, GLBs or a second WebGL renderer.
const minimap=$('war2-minimap'),minimapContext=minimap.getContext('2d',{alpha:false});
const minimapRaster=document.createElement('canvas');
minimapRaster.width=112;minimapRaster.height=112;
const minimapRasterContext=minimapRaster.getContext('2d',{alpha:false});
const minimapImage=minimapRasterContext.createImageData(112,112);
// World-to-fog sampling coordinates never change: cache them instead of
// allocating 12,544 {x,z} objects on every minimap repaint.
const minimapFogIndices=new Int32Array(112*112);
for(let row=0;row<112;row++)for(let col=0;col<112;col++){
  const world=arena.toWorld((col+.5)/112*ARENA_SIZE-ARENA_HALF,
    (row+.5)/112*ARENA_SIZE-ARENA_HALF);
  minimapFogIndices[row*112+col]=fogOfWar.index(world.x,world.z);
}
// Raven scouting permanently discovers terrain but never creates a moving
// bright patch that would betray each bird's position on the minimap.
const minimapGroundFog=new window.FightersFog.FogGrid({halfSize:arena.worldHalf});
let minimapElapsed=0;
function miniPoint(x,z){
  const p=arena.toMap(x,z);
  return {x:(p.x+ARENA_HALF)/ARENA_SIZE*minimap.width,
    y:(p.z+ARENA_HALF)/ARENA_SIZE*minimap.height};
}
function drawMinimap(){
  const fog=fogOfWar.maps[activeFaction],paint=minimapImage.data;
  minimapGroundFog.update(activeFaction,groundSightSources(activeFaction));
  const groundVisible=minimapGroundFog.maps[activeFaction].visible;
  // Resample the world-space visibility grids into the square camera-aligned
  // map. A simple X/Z drawImage would recreate the old diamond discrepancy.
  for(let cell=0;cell<minimapFogIndices.length;cell++){
    const index=minimapFogIndices[cell],j=cell*4;
    const light=index<0?0:Math.max(groundVisible[index],fog.explored[index]*.28)/255;
    paint[j]=Math.round(7+46*light);
    paint[j+1]=Math.round(10+90*light);
    paint[j+2]=Math.round(11+54*light);
    paint[j+3]=255;
  }
  minimapRasterContext.putImageData(minimapImage,0,0);
  minimapContext.imageSmoothingEnabled=false;
  minimapContext.drawImage(minimapRaster,0,0,minimap.width,minimap.height);
  for(const b of liveBuildings()){
    if(!b.hitbox)continue;
    const box=b.hitbox,x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2;
    const visibility=fogOfWar.sample(x,z,activeFaction);
    if(visibility.explored<.2||
      (b.clanId!==(activeFaction==='witch'?'witch':'orcs')&&
        b.clanId!=='neutral'&&!knownEnemyBuildings[activeFaction].has(b.id)))continue;
    minimapContext.fillStyle=b.type==='mine'?'#d4c36e':
      b.clanId===(activeFaction==='witch'?'witch':'orcs')?'#b2d3ce':'#c16c57';
    const corners=[[box.minX,box.minZ],[box.maxX,box.minZ],
      [box.maxX,box.maxZ],[box.minX,box.maxZ]].map(([bx,bz])=>miniPoint(bx,bz));
    minimapContext.beginPath();
    corners.forEach((p,i)=>i?minimapContext.lineTo(p.x,p.y):minimapContext.moveTo(p.x,p.y));
    minimapContext.closePath();minimapContext.fill();
  }
  for(const actor of units){
    if(actor.dead||actor.kind!==activeFaction&&!fogOfWar.exploredAt(
      actor.root.position.x,actor.root.position.z,activeFaction))continue;
    minimapContext.fillStyle=actor.kind===activeFaction?'#c6f4a3':'#ff7b76';
    const p=miniPoint(actor.root.position.x,actor.root.position.z);
    minimapContext.fillRect(p.x-1,p.y-1,3,3);
  }
  minimapContext.strokeStyle='#f6f1c3';
  minimapContext.lineWidth=1;
  const rect=viewport.getBoundingClientRect();
  const footprint=[[rect.left,rect.top],[rect.right,rect.top],
    [rect.right,rect.bottom],[rect.left,rect.bottom]]
    .map(([x,y])=>worldPoint(x,y)).filter(Boolean).map(p=>miniPoint(p.x,p.z));
  if(footprint.length===4){
    minimapContext.beginPath();
    footprint.forEach((p,i)=>i?minimapContext.lineTo(p.x,p.y):
      minimapContext.moveTo(p.x,p.y));
    minimapContext.closePath();minimapContext.stroke();
  }
}
function minimapCenterAt(clientX,clientY){
  const rect=minimap.getBoundingClientRect();
  if(!rect.width||!rect.height)return;
  const world=arena.toWorld((clientX-rect.left)/rect.width*ARENA_SIZE-ARENA_HALF,
    (clientY-rect.top)/rect.height*ARENA_SIZE-ARENA_HALF);
  cameraFollow=arena.clamp(world.x,world.z,2);
  positionCamera();drawMinimap();
}
minimap.addEventListener('pointerdown',event=>event.stopPropagation());
minimap.addEventListener('click',event=>{
  event.stopPropagation();if(running&&!paused)minimapCenterAt(event.clientX,event.clientY);
});
minimap.addEventListener('keydown',event=>{
  const offsets={ArrowLeft:[-4,0],ArrowRight:[4,0],ArrowUp:[0,-4],ArrowDown:[0,4]};
  const step=offsets[event.key];if(!step||!running||paused)return;
  event.preventDefault();event.stopPropagation();
  const delta=arena.toWorld(step[0],step[1]);
  cameraFollow=arena.clamp(cameraFollow.x+delta.x,cameraFollow.z+delta.z,2);
  positionCamera();drawMinimap();
});
let cameraFollow={x:0,z:0};
const cameraLook=new THREE.Vector3(0,1.15,0);
const clock=new THREE.Clock();
const rand=(min,max)=>min+Math.random()*(max-min);
// Fixed orthographic scale: 35% closer than the previous 3x zoom (now 4.05x
// the original view). Camera translation works; input cannot modify zoom.
const CAMERA_ZOOM=35/(3*1.35);
const cameraZoom=CAMERA_ZOOM;
let cameraDrag=null;
const activeTouches=new Map();
const cameraControls=window.FightersCamera.create({
  camera,look:cameraLook,offset:CAMERA_OFFSET,arena,viewport,renderer,
  zoom:cameraZoom,worldPoint,panel:()=>$('command-panel'),matchMedia,clamp
});
function panCamera(dx,dy){
  cameraFollow=cameraControls.pan(cameraFollow,dx,dy);
}

function createSign(label,color,width=4){
  const c=document.createElement('canvas');c.width=512;c.height=160;
  const ctx=c.getContext('2d');
  ctx.fillStyle='#080b17';ctx.fillRect(0,0,c.width,c.height);
  ctx.strokeStyle=color;ctx.lineWidth=10;ctx.strokeRect(12,10,488,140);
  ctx.shadowColor=color;ctx.shadowBlur=18;ctx.fillStyle=color;ctx.font='bold 58px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,256,80);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,1.25),new THREE.MeshBasicMaterial({map:tex,transparent:true}));
  return mesh;
}
function box(w,h,d,color,x,y,z,emissive=0x000000){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.85,emissive,emissiveIntensity:emissive? .42:0}));
  mesh.position.set(x,y,z);scene.add(mesh);return mesh;
}
function mapBox(width,height,depth,color,mapX,mapZ,y){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(width,height,depth*Math.sqrt(3)),
    new THREE.MeshStandardMaterial({color,roughness:.98}));
  const p=arena.toWorld(mapX,mapZ);
  mesh.position.set(p.x,y,p.z);mesh.rotation.y=Math.PI/4;scene.add(mesh);
  return mesh;
}
function buildTerrain(){
  // The terrain's X/Z footprint is a 45-degree rotated rectangle, stretched
  // by sqrt(3) along the camera's depth axis. Its isometric projection is an
  // exact square, matching the map and the WASD/screen pan directions.
  mapBox(ARENA_SIZE,.045,ARENA_SIZE,0x344739,0,0,-.045);
  mapBox(ARENA_SIZE,.013,7.5,0x3c4135,0,0,-.015);
  mapBox(7.5,.013,ARENA_SIZE,0x3c4135,0,0,-.014);
  const edge=ARENA_HALF+.14;
  mapBox(ARENA_SIZE+.45,.10,.20,0x505b49,0,-edge,.012);
  mapBox(ARENA_SIZE+.45,.10,.20,0x505b49,0,edge,.012);
  mapBox(.20,.10,ARENA_SIZE+.45,0x505b49,-edge,0,.012);
  mapBox(.20,.10,ARENA_SIZE+.45,0x505b49,edge,0,.012);
}
buildTerrain();
// House is a genuine GLB asset, not a procedural stand-in. Its local front
// vector is configurable until visually calibrated against the Sketchfab mesh.
async function loadWitchHouse(){
  const [gltf,projection]=await Promise.all([
    loader.loadAsync('./models/witch_house.glb'),
    loadFootprint('./models/witch_house.glb')
  ]);
  const house=gltf.scene;
  const bounds=new THREE.Box3().setFromObject(house);
  const size=bounds.getSize(new THREE.Vector3());
  const center=bounds.getCenter(new THREE.Vector3());
  const scale=WITCH_HOUSE.maxFootprint/Math.max(size.x,size.z);
  // Center in the model's own coordinates BEFORE rotating it. Otherwise
  // the building drifts away from its intended footprint as yaw changes.
  house.position.set(-center.x,-bounds.min.y,-center.z);
  const anchor=new THREE.Group();
  anchor.scale.setScalar(scale);
  // Model facade is provisionally assumed to face local -Z.
  // Rotate the house 90 degrees counterclockwise from its previous orientation.
  anchor.rotation.y=-Math.PI/4;
  anchor.position.set(WITCH_HOUSE.x,0,WITCH_HOUSE.z);
  anchor.add(house);
  scene.add(anchor);witchHouse=anchor;witchBuilding.root=anchor;
  witchBuilding.hitbox=buildingBounds(house,projection);
  witchBuilding.visualHitbox=buildingVisualBounds(anchor);
  updateNavObstacles();drawBuildingSelection();refreshHUD();
}
loadWitchHouse().catch(err=>console.warn('Witch house GLB unavailable:',err));
loader.loadAsync('./models/standing-stone.glb').then(gltf=>{
  standingStoneModel=gltf.scene;
  refreshHUD();
}).catch(err=>console.warn('Standing stone GLB unavailable:',err));

// Buildings must survive a meaningful siege; higher levels also buy resilience.
const BUILDING_TYPES=Object.freeze({
  barrack:{name:'Barracks',levels:{1:{maxHealth:450,constructionCost:180,requiredTechnology:null},2:{maxHealth:675,constructionCost:240,requiredTechnology:null},3:{maxHealth:900,constructionCost:240,requiredTechnology:null}}},
  hut:{name:'Hut',levels:{1:{maxHealth:450,constructionCost:240,requiredTechnology:null},2:{maxHealth:675,constructionCost:240,requiredTechnology:null},3:{maxHealth:900,constructionCost:240,requiredTechnology:null}}},
  mine:{name:'Mine',levels:{1:{maxHealth:100,constructionCost:240,requiredTechnology:null},2:{maxHealth:150,constructionCost:240,requiredTechnology:null},3:{maxHealth:200,constructionCost:240,requiredTechnology:null}}},
  cauldron:{name:'Cauldron',levels:{1:{maxHealth:450,constructionCost:240,requiredTechnology:null},2:{maxHealth:675,constructionCost:240,requiredTechnology:null},3:{maxHealth:900,constructionCost:240,requiredTechnology:null}}},
  factory:{name:'Factory',levels:{1:{maxHealth:450,constructionCost:240,requiredTechnology:null},2:{maxHealth:675,constructionCost:240,requiredTechnology:null},3:{maxHealth:900,constructionCost:240,requiredTechnology:null}}},
  wall:{name:'Stone wall',levels:{1:{maxHealth:280,constructionCost:32,requiredTechnology:null}}}
});
const ORC_VILLAGE={
  positions:{
    barrack:{x:15,z:20},hut:{x:22,z:21},mine:{x:1,z:26},
    cauldron:{x:16,z:13},factory:{x:23,z:13}
  }
};
const buildingInstances=new Map();
const buildingBlueprints=new Map();
const orcLevelEntries=new Map(),orcLevelCache=new Map();
function createBuildingInstance(entry,type,level,anchor,footprint,model,projection){
  const spec=BUILDING_TYPES[type].levels[level];
  const id=type==='mine'?
    'neutral-gold-mine-'+String([...buildingInstances.values()].filter(b=>b.type==='mine').length+1).padStart(2,'0'):
    'orc-'+type+'-'+String([...buildingInstances.keys()].filter(key=>key.startsWith('orc-'+type+'-')).length+1).padStart(2,'0');
  const instance={
    id,modelId:entry.id,sourceNode:entry.sourceNode||entry.name,
    type,level,clanId:type==='mine'?'neutral':'orcs',
    health:spec.maxHealth,maxHealth:spec.maxHealth,
    constructionCost:spec.constructionCost,requiredTechnology:spec.requiredTechnology,
    hitbox:buildingBounds(model,projection),visualHitbox:buildingVisualBounds(anchor),
    queue:[],progress:0,rally:null,rallyMarker:null,
    root:anchor,footprintProjection:projection,visualLevel:1,initial:false,destroyed:false
  };
  // Deposits are permanent world resources. No HP bar or per-mine UI meshes.
  if(type!=='mine'){
    const bar=new THREE.Group();
    bar.name='healthbar-world-'+id;
    const background=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.24),
      new THREE.MeshBasicMaterial({color:0x292929,depthTest:false,side:THREE.DoubleSide}));
    const fill=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.17),
      new THREE.MeshBasicMaterial({color:0x65c957,depthTest:false,side:THREE.DoubleSide}));
    fill.position.z=.01;
    bar.add(background,fill);
    // World-space billboard: never inherit the rotated/scaled orc GLB transform.
    instance.healthBar={root:bar,fill};
    scene.add(bar);
    updateHealthBar(instance);
  }
  buildingInstances.set(id,instance);
  updateNavObstacles();
  return instance;
}
function updateHealthBar(building){
  if(!building.healthBar)return;
  const bar=building.healthBar.root,b=building.hitbox;
  bar.position.set((b.minX+b.maxX)/2,b.maxY+.85,(b.minZ+b.maxZ)/2);
  bar.quaternion.copy(camera.quaternion);
  const friendly=building.clanId===(activeFaction==='witch'?'witch':'orcs');
  bar.visible=!building.destroyed&&(friendly||buildingInDiscoveredZone(building,activeFaction))&&
    (building.health<building.maxHealth||selectedBuilding===building);
  const fraction=THREE.MathUtils.clamp(building.health/building.maxHealth,0,1);
  // PlaneGeometry is centre-anchored. Shift the shrinking fill left so its
  // left edge stays at -1.1 and damage empties the bar from right to left.
  building.healthBar.fill.scale.x=fraction;
  building.healthBar.fill.position.x=-1.1*(1-fraction);
}
let orcVillage=null;
const orcAnimationMixers=[];
async function loadOrcVillage(limit=3){
  const response=await fetch('./models/orc-buildings/manifest.json');
  if(!response.ok)throw Error('Orc manifest HTTP '+response.status);
  const manifest=await response.json();
  if(!Array.isArray(manifest.buildings)||!manifest.buildings.length)
    throw Error('Orc building manifest is empty');
  const village=new THREE.Group();
  scene.add(village);
  for(const entry of manifest.buildings){
    const match=(entry.sourceNode||entry.name).match(/(?:orc_)?(barrack|hut|mine|cauldron|factory)_Lv([123])$/i);
    if(match)orcLevelEntries.set(match[1].toLowerCase()+':'+match[2],entry);
  }
  const sharedTextureSlots=new Map();
  let deduplicatedTextures=0;
  // Each file contains exactly one complete building and its dependencies.
  // Target a visible 3–5 world-unit footprint; never shrink an already
  // small model and never confuse a single roof or wall with a building.
  const entries=manifest.buildings.filter(entry=>/_Lv1$/i.test(entry.sourceNode||entry.name))
    .slice(0,Math.min(limit,Object.keys(ORC_VILLAGE.positions).length));
  // Never decode all 15 textured GLBs simultaneously. On mobile this can
  // exhaust memory and freeze the main thread during the loading screen.
  for(let i=0;i<entries.length;i++){
    let model;
    let buildingClips=[];
    let projection;
    try{
      const [gltf,collision]=await Promise.all([
        loader.loadAsync(entries[i].file),
        loadFootprint(entries[i].file)
      ]);
      model=gltf.scene;
      projection=collision;
      buildingClips=gltf.animations||[];
    }catch(err){
      console.warn('Orc building unavailable:',entries[i].name,err);
      continue;
    }
    if(manifest.sharedTexturesVerified){
      // The build compares SHA-256 of every embedded image across all buildings.
      // GLTFLoader otherwise creates a separate GPU texture per GLB.
      model.traverse(object=>{
        if(!object.isMesh)return;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        for(const material of materials){
          if(!material)continue;
          for(const slot of ['map','normalMap','roughnessMap','metalnessMap','aoMap','emissiveMap','alphaMap']){
            const texture=material[slot];
            if(!texture)continue;
            const key=slot+'|'+texture.wrapS+'|'+texture.wrapT+'|'+texture.flipY+
              '|'+texture.colorSpace+'|'+texture.offset.toArray()+'|'+texture.repeat.toArray()+
              '|'+texture.rotation+'|'+texture.magFilter+'|'+texture.minFilter;
            const canonical=sharedTextureSlots.get(key);
            if(canonical&&canonical!==texture){
              material[slot]=canonical;
              texture.dispose();
              deduplicatedTextures++;
              material.needsUpdate=true;
            }else if(!canonical)sharedTextureSlots.set(key,texture);
          }
        }
      });
    }
    if(buildingClips.length){
      const mixer=new THREE.AnimationMixer(model);
      for(const clip of buildingClips){
        if(clip.tracks.length)mixer.clipAction(clip).play();
      }
      orcAnimationMixers.push(mixer);
      console.info('Orc animation started:',entries[i].name,buildingClips.map(clip=>({name:clip.name,tracks:clip.tracks.length,duration:clip.duration})));
    }
    // Let the renderer and input loop run between buildings.
    await new Promise(resolve=>setTimeout(resolve,0));
    model.updateMatrixWorld(true);
    const type=(entries[i].sourceNode||entries[i].name).match(/(?:orc_)?(barrack|hut|mine|cauldron|factory)_Lv1$/i)?.[1]?.toLowerCase();
    if(!type)continue;
    const bounds=orcModelBounds(model,type);
    const size=bounds.getSize(new THREE.Vector3());
    const footprint=Math.max(size.x,size.z);
    if(!Number.isFinite(footprint)||footprint<=1e-6)continue;
    const center=bounds.getCenter(new THREE.Vector3());
    const anchor=new THREE.Group();
    // Center the source asset using a separate transform, preserving
    // the original node transforms and every mesh/material underneath.
    const offset=new THREE.Group();
    offset.position.set(-center.x,-bounds.min.y,-center.z);
    offset.add(model);
    anchor.add(offset);
    const physicalPrototype=prototypeBuildingBounds(projection,center,3.9/footprint);
    buildingBlueprints.set(type,{
      entry:entries[i],source:model.clone(true),clips:buildingClips,
      footprint,projection,collisionLocal:physicalPrototype
    });
    const target=3.9;
    anchor.scale.setScalar(target/footprint);
    const p=ORC_VILLAGE.positions[type];
    anchor.position.set(p.x,0,p.z);
    anchor.rotation.y=(i%4)*Math.PI/2;
    const instance=createBuildingInstance(entries[i],type,1,anchor,target,model,projection);
    instance.initial=true;
    anchor.userData={instanceId:instance.id,buildingId:entries[i].id,buildingName:entries[i].name,
      description:entries[i].description,originalFootprint:footprint,targetFootprint:target};
    village.add(anchor);
    if(type==='mine'){
      // Reuse the loaded mine's geometry and materials for a neutral deposit
      // close to the witch base. No second GLB is downloaded or decoded.
      const mirror=anchor.clone(true);
      mirror.position.set(-12,0,-21);mirror.rotation.y=0;
      mirror.updateMatrixWorld(true);
      const mirrorModel=mirror.children[0]?.children[0];
      if(mirrorModel){
        const deposit=createBuildingInstance(entries[i],type,1,mirror,target,mirrorModel,projection);
        const generatedId=deposit.id;
        deposit.initial=true;deposit.id='neutral-gold-mine';
        buildingInstances.delete(generatedId);
        buildingInstances.set(deposit.id,deposit);
        village.add(mirror);updateNavObstacles();
      }
    }
  }
  orcVillage=village;
  refreshStartButton();
  refreshHUD();
  console.info('Orc village:',village.children.length,'/',entries.length,'individual buildings loaded; textures reused:',deduplicatedTextures,'verified:',manifest.sharedTexturesVerified);
}
// Do not compete with 70MB of original character rigs during startup.
// The full 3D orc village streams in AFTER the player is ready to start.
const orcCountParam=new URLSearchParams(location.search).get('orcDebug');
const orcDebugCount=orcCountParam===null?5:Math.min(5,Math.max(0,Math.floor(Number(orcCountParam)||0)));
let orcVillageLoadStarted=false,orcVillageLoadError=null;
function beginOrcVillageLoad(){
  if(orcVillageLoadStarted||!orcDebugCount)return;
  orcVillageLoadStarted=true;
  setTimeout(()=>loadOrcVillage(orcDebugCount)
    .catch(err=>{
      orcVillageLoadError=err;
      console.warn('Orc village loading failed:',err);
      refreshStartButton();
    }),100);
}

function resize(){
  cameraControls.resize();
}
new ResizeObserver(resize).observe(viewport);
new ResizeObserver(resize).observe($('command-panel'));
resize();
// Each job selects its real Quaternius motion. Mining/building swing tools;
// garden construction plants seeds and wheat harvesting picks by hand.
const WORK_SWING='Work_Swing';
const FARM_HARVEST='Farm_Harvest';
const FARM_PLANT='Farm_PlantSeed';
const TREE_CHOP='TreeChopping_Loop';
function showWorkerTool(actor,name){
  if(!actor.workTool)return;
  const swing=name===WORK_SWING;
  const chopping=name===TREE_CHOP;
  actor.workTool.visible=chopping&&actor.kind==='orc';
  actor.pickTool.visible=swing&&!!actor.mineJob;
  actor.hammerTool.visible=swing&&(!!actor.repairJob||
    !!actor.constructJob&&actor.constructJob.type!=='garden');
  if(actor.chopTool)actor.chopTool.visible=chopping;
}
function animation(actor,name,force=false){
  if(!actor)return;
  showWorkerTool(actor,name);
  if(!force&&actor.current===name)return;
  // Initialize only clips ACTUALLY played. Previously every new unit allocated
  // 86 mixer actions and thousands of joint-track bindings at creation time.
  let next=actor.actions.get(name);
  if(!next){
    const clip=actor.clipCatalog.get(name===WORK_SWING?'Sword_Attack':name);
    if(!clip)return;
    next=actor.mixer.clipAction(clip);
    actor.actions.set(name,next);
  }
  const last=actor.action;
  if(last&&last!==next)last.fadeOut(.13);
  // Complete one natural pick gesture per harvest and three planting gestures
  // during construction, preserving every original native keyframe.
  const rate=name===FARM_HARVEST?
    next.getClip().duration/window.FightersFarming.HARVEST_SECONDS:
    name===FARM_PLANT?next.getClip().duration/(BUILD_SECONDS/3):1;
  next.reset().stopFading().setEffectiveWeight(1).setEffectiveTimeScale(rate);
  const oneshot=name!==WORK_SWING&&name!==FARM_HARVEST&&name!==FARM_PLANT&&
    !name.includes('Loop')&&!name.includes('Idle');
  next.setLoop(oneshot?THREE.LoopOnce:THREE.LoopRepeat,oneshot?1:Infinity);
  next.clampWhenFinished=oneshot;
  if(last&&last!==next)next.fadeIn(.13);
  next.play();
  actor.action=next;actor.current=name;
}
// The official Peasant meshes carry exactly the same named 65-bone Quaternius rig.
// Skin the garments/hair with this actor's own skeleton, never copy foreign joints.
const headGeometryCache=new WeakMap();
const orcAppearance=window.FightersOrcAppearance;
const WITCH_HAIR_STYLES=['short','long','very-long','ponytail','side-buns'];
const WITCH_HAIR_COLORS=[
  {name:'black',hex:0x191718},{name:'blonde',hex:0xe9c87e},
  {name:'white',hex:0xf5f3e9},{name:'brown',hex:0x603b2a},
  {name:'red',hex:0xbd582d},{name:'gray',hex:0x94938e},
  {name:'green',hex:0x4fa46a}
];
const hairStyleDeck=[],hairColorDeck=[];
function shuffledDraw(deck,options){
  if(!deck.length){
    deck.push(...options);
    for(let i=deck.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [deck[i],deck[j]]=[deck[j],deck[i]];
    }
  }
  return deck.pop();
}
function randomWitchHair(){
  return {style:shuffledDraw(hairStyleDeck,WITCH_HAIR_STYLES),
    color:shuffledDraw(hairColorDeck,WITCH_HAIR_COLORS)};
}
// A single extended geometry is shared by every very-long-haired witch.
// Stretch only the lower part of the source hairstyle, never its scalp.
const veryLongHairCache=new WeakMap();
function veryLongHairGeometry(original){
  if(veryLongHairCache.has(original))return veryLongHairCache.get(original);
  const geometry=original.clone(),positions=geometry.getAttribute('position');
  for(let i=0;i<positions.count;i++){
    const y=positions.getY(i),z=positions.getZ(i);
    const t=THREE.MathUtils.clamp((1.70-y)/.20,0,1);
    if(t<=0)continue;
    positions.setY(i,y-.45*t*t);
    if(z<-.01)positions.setZ(i,z-.055*t);
  }
  positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();
  veryLongHairCache.set(original,geometry);
  return geometry;
}
// A tiny rigid ponytail follows the head bone; no per-frame hair simulation.
const ponytailGeometry=new THREE.CylinderGeometry(.075,.014,.48,8,6);
const ponytailPositions=ponytailGeometry.getAttribute('position');
for(let i=0;i<ponytailPositions.count;i++){
  const t=THREE.MathUtils.clamp((.24-ponytailPositions.getY(i))/.48,0,1);
  ponytailPositions.setZ(i,ponytailPositions.getZ(i)-.065*t*t);
}
ponytailPositions.needsUpdate=true;ponytailGeometry.computeVertexNormals();
const ponytailMaterials=new Map();
function addPonytail(skeleton,color){
  const head=skeleton.bones.find(b=>b.name==='Head');
  if(!head)throw Error('Os Head manquant pour la queue de cheval');
  let material=ponytailMaterials.get(color.hex);
  if(!material){
    material=new THREE.MeshStandardMaterial({color:color.hex,roughness:.94});
    ponytailMaterials.set(color.hex,material);
  }
  const tail=new THREE.Mesh(ponytailGeometry,material);
  tail.name='hair_ponytail';tail.userData.costumeLayer='hair';
  tail.position.set(0,-.14,-.18);
  head.add(tail);
}
function exposedSkinGeometry(body,kind){
  const key=kind==='orc'?'orc':'witch';
  let variants=headGeometryCache.get(body.geometry);
  if(variants?.[key])return variants[key];
  const geom=body.geometry,si=geom.getAttribute('skinIndex'),sw=geom.getAttribute('skinWeight');
  const active=new Set(body.skeleton.bones.flatMap((b,i)=>
    ['Head','neck_01'].includes(b.name)||kind==='orc'&&
      /(?:hand|thumb|index|middle|ring|pinky|finger)/i.test(b.name)?[i]:[]));
  const score=v=>{let sum=0;for(let k=0;k<4;k++)if(active.has(si.getComponent(v,k)))sum+=sw.getComponent(v,k);return sum;};
  const ix=geom.getIndex(),indices=[];
  for(let k=0;k<(ix?ix.count:geom.getAttribute('position').count);k+=3){
    const a=ix?ix.getX(k):k,b=ix?ix.getX(k+1):k+1,c=ix?ix.getX(k+2):k+2;
    if((score(a)>.45)+(score(b)>.45)+(score(c)>.45)>=2)indices.push(a,b,c);
  }
  if(indices.length<60)throw Error('Impossible d’isoler la tête du corps Quaternius');
  const cut=geom.clone();cut.setIndex(indices);cut.clearGroups();cut.computeBoundingSphere();
  if(!variants){variants={};headGeometryCache.set(geom,variants);}
  variants[key]=cut;
  return cut;
}
// Materials and geometry are shared across every instance of the same role.
function sharedRoleMaterial(original,key,configure){
  const id=original.uuid+'|'+key;
  let material=sharedCostumeMaterials.get(id);
  if(!material){
    material=original.clone();
    configure(material);
    sharedCostumeMaterials.set(id,material);
  }
  return material;
}
function costumeLayers(visual,kind,index,role,appearance=null){
  const bodyName=kind==='witch'?'Superhero_Female':'SuperHero_Male';
  let body=null;
  visual.traverse(o=>{if(o.isSkinnedMesh&&o.name===bodyName)body=o;});
  if(!body)throw Error('Le squelette du personnage est introuvable : '+bodyName);
  const skeleton=body.skeleton,profile=roles.profile(kind,role);
  if(kind==='orc'){
    // Saturated green visible on the face AND the gripped hands. Reuse each
    // variant's material across actors rather than allocating per unit.
    const skin=orcAppearance.SKIN_COLORS[index%orcAppearance.SKIN_COLORS.length];
    const originals=Array.isArray(body.material)?body.material:[body.material];
    const materials=originals.map(mat=>sharedRoleMaterial(mat,'orc-skin-'+skin,m=>{
      // The original face texture is dark. A little same-hue emission keeps
      // the green vivid at RTS distance without losing the facial details.
      m.color?.setHex(skin);m.emissive?.setHex(skin);
      m.emissiveIntensity=.4;m.roughness=.91;
    }));
    body.material=Array.isArray(body.material)?materials:materials[0];
  }
  // Keep the original body skinning; the orcs' fingers stay green on their
  // native hand joints even when swinging or carrying objects.
  body.geometry=exposedSkinGeometry(body,kind);
  const clothing=kind==='witch'?clothingFemale:clothingMale;
  const hairstyle=kind==='witch'?({short:hairParted,long:hairLong,
    'very-long':hairLong,ponytail:hairParted,'side-buns':hairBuns}[appearance.style]):
    (index%2?hairParted:hairBuzzed);
  let garmentMeshes=0,hairMeshes=0;
  for(const [source,type] of [[clothing,'garment'],[hairstyle,'hair']]){
    if(!source)throw Error('Tenue ou coiffure manquante : '+type);
    source.scene.traverse(o=>{
      if(!o.isSkinnedMesh)return;
      if(o.skeleton.bones.length!==skeleton.bones.length||
         o.skeleton.bones.some((b,i)=>b.name!==skeleton.bones[i].name))
        throw Error('Ordre des os incompatible pour '+o.name);
      const sourceMaterials=Array.isArray(o.material)?o.material:[o.material];
      const materials=sourceMaterials.map(mat=>sharedRoleMaterial(mat,
        type==='hair'&&kind==='witch'?'witch-hair-'+appearance.color.name:
          kind+'-'+role+'-'+type+(type==='hair'?'-'+index%2:''),
        m=>{
          if(!m.color)return;
          if(type==='garment')m.color.lerp(new THREE.Color(profile.garment),.72);
          else if(kind==='witch')m.color.setHex(appearance.color.hex);
          else m.color.multiply(new THREE.Color(index%2?0x302a28:0x63452e));
        }));
      const geometry=kind==='orc'&&type==='garment'?
        orcAppearance.bulkyGarmentGeometry(o.geometry,skeleton.bones):
        kind==='witch'&&type==='hair'&&appearance.style==='very-long'?
          veryLongHairGeometry(o.geometry):o.geometry;
      const layer=new THREE.SkinnedMesh(geometry,Array.isArray(o.material)?materials:materials[0]);
      layer.name=type+'_'+o.name;layer.userData.costumeLayer=type;
      layer.frustumCulled=false;
      layer.bind(skeleton,body.bindMatrix.clone());
      visual.add(layer);
      if(type==='garment')garmentMeshes++;else hairMeshes++;
    });
  }
  if(garmentMeshes<4||hairMeshes!==1)throw Error('Tenue civile incomplète');
  if(kind==='witch'&&appearance.style==='ponytail')addPonytail(skeleton,appearance.color);
  return {garmentMeshes,hairMeshes,headTriangles:body.geometry.getIndex()?.count/3||0,
    role,hairStyle:appearance?.style||null,hairColor:appearance?.color.name||null};
}
// All tools are built once from tiny primitives. Their clones share geometry
// and materials across every worker; no worker-only GLB or texture is loaded.
const toolWood=new THREE.MeshStandardMaterial({color:0x77502d,roughness:1});
const toolIron=new THREE.MeshStandardMaterial({color:0xbac5bd,metalness:.65,roughness:.42,side:THREE.DoubleSide});
function workToolTemplate(kind){
  const tool=new THREE.Group();
  tool.name=kind==='hammer'?'Worker_Hammer':kind==='pickaxe'?'Worker_Pickaxe':
    kind==='witch'?'Worker_Scythe':'Worker_Axe';
  if(kind==='pickaxe'){
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.032,.043,.9,7),toolWood);
    handle.position.y=.32;tool.add(handle);
    const center=new THREE.Mesh(new THREE.CylinderGeometry(.085,.10,.36,6),toolIron);
    center.rotation.z=Math.PI/2;center.position.y=.72;tool.add(center);
    for(const side of [-1,1]){
      const tip=new THREE.Mesh(new THREE.ConeGeometry(.105,.42,6),toolIron);
      tip.rotation.z=-side*Math.PI/2;
      tip.position.set(side*.37,.72,0);tool.add(tip);
    }
    return tool;
  }
  if(kind==='hammer'){
    const handle=new THREE.Mesh(new THREE.CylinderGeometry(.036,.043,.79,7),toolWood);
    handle.position.y=.28;tool.add(handle);
    const head=new THREE.Mesh(new THREE.BoxGeometry(.47,.17,.22),toolIron);
    head.position.y=.65;tool.add(head);
    return tool;
  }
  const length=kind==='witch'?1.14:.82;
  const handle=new THREE.Mesh(new THREE.CylinderGeometry(.035,.046,length,7),toolWood);
  handle.position.y=length*.34;tool.add(handle);
  // Silhouette is deliberately chunky enough to read at Warcraft II zoom.
  const blade=new THREE.Shape();
  if(kind==='witch'){
    blade.moveTo(-.03,.89);
    blade.quadraticCurveTo(.5,1.08,.94,.75);
    blade.quadraticCurveTo(.68,.86,.28,.77);
    blade.quadraticCurveTo(.07,.75,-.03,.82);
  }else{
    blade.moveTo(.03,.55);
    blade.lineTo(.30,.46);blade.lineTo(.48,.43);
    blade.lineTo(.48,.89);blade.lineTo(.30,.84);
    blade.lineTo(.03,.77);
  }
  blade.closePath();
  const head=new THREE.Mesh(new THREE.ExtrudeGeometry(blade,{
    depth:.065,bevelEnabled:false,curveSegments:5
  }),toolIron);
  head.position.z=-.0325;tool.add(head);
  return tool;
}
const sharedWorkToolTemplates={witch:workToolTemplate('witch'),orc:workToolTemplate('orc'),
  hammer:workToolTemplate('hammer'),pickaxe:workToolTemplate('pickaxe')};
// Adapted from asset-tooling/examples/weapons/derive-sockets.ts (CC0):
// anatomy-driven grip from the actual Quaternius rig's finger bones, not
// manual offset or an unrelated Ranger skeleton transform.
function nativeRightHandSocket(visual){
  const hand=visual.getObjectByName('hand_r');
  const finger=name=>visual.getObjectByName(name+'_r');
  const fingertips=['index_01','middle_01','ring_01','pinky_01','thumb_03'].map(finger);
  if(!hand||fingertips.some(b=>!b))throw Error('Os de préhension Quaternius incomplets');
  visual.updateWorldMatrix(true,true);
  const point=b=>hand.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
  const [index,middle,ring,pinky,thumb]=fingertips.map(point);
  const fingers=middle.clone().normalize();
  const knuckles=index.clone().sub(pinky).normalize();
  const centroid=index.clone().add(middle).add(ring).add(pinky).multiplyScalar(.25);
  const palm=new THREE.Vector3().crossVectors(fingers,knuckles).normalize();
  if(thumb.clone().sub(centroid).dot(palm)<0)palm.negate();
  if(thumb.clone().sub(pinky).dot(knuckles)<=0)
    throw Error('La prise anatomique du rig est inversée');
  const grip=centroid.multiplyScalar(.8).addScaledVector(palm,.03);
  const y=knuckles;
  const z=palm.negate();
  const x=new THREE.Vector3().crossVectors(y,z).normalize();
  z.crossVectors(x,y).normalize();
  const socket=new THREE.Group();
  socket.name='hand_r.weapon';socket.position.copy(grip);
  socket.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  hand.add(socket);
  return socket;
}
// The authored sword mesh has an identity 'grip' node at its origin.
function mountNativeSword(actor){
  if(actor.role!=='melee'||!swordModel)throw Error('Épée indisponible pour cet combattant');
  if(actor.weapon)return;
  const socket=nativeRightHandSocket(actor.visual);
  const sword=swordModel.scene.clone(true);
  sword.name='Quaternius_Gripped_Sword';
  socket.add(sword);
  actor.weapon={socket,mesh:sword,hand:socket.parent};
}
function mountWorkTool(actor){
  if(actor.role!=='worker')return;
  const socket=nativeRightHandSocket(actor.visual);
  const tool=sharedWorkToolTemplates[actor.kind].clone(true);
  const hammer=sharedWorkToolTemplates.hammer.clone(true);
  const pickTool=sharedWorkToolTemplates.pickaxe.clone(true);
  // Workers wield a pickaxe at mines, a hammer for construction/repairs and
  // an axe while chopping. The unused tools remain hidden in the hand socket.
  const chopTool=actor.kind==='witch'?sharedWorkToolTemplates.orc.clone(true):null;
  socket.name='hand_r.work-tool';
  tool.visible=false;hammer.visible=false;pickTool.visible=false;
  socket.add(tool,hammer,pickTool);
  if(chopTool){chopTool.visible=false;socket.add(chopTool);}
  actor.workTool=tool;actor.hammerTool=hammer;actor.pickTool=pickTool;
  actor.chopTool=chopTool;
}

function spawnUnit(kind,x,z,index=0,role='melee'){
  const source=kind==='witch'?female:male;
  if(!source)throw Error('Source GLB absente pour '+kind);
  const profile=roles.profile(kind,role);
  const root=new THREE.Group(),visual=cloneSkeleton(source.scene);
  const appearance=kind==='witch'?randomWitchHair():null;
  // Orcs still keep their previously approved fixed recording. Witch units
  // rotate all phrases cloned from the same role's reference voice.
  const voiceLineIndex=1+Math.floor(Math.random()*4);
  const outfitInfo=costumeLayers(visual,kind,index,role,appearance);
  const bounds=new THREE.Box3().setFromObject(visual);
  const center=bounds.getCenter(new THREE.Vector3());
  visual.position.set(-center.x,-bounds.min.y,-center.z);
  root.add(visual);root.position.set(x,0,z);scene.add(root);
  const marker=new THREE.Mesh(sharedSelectionGeometry,sharedSelectionMaterials[kind]);
  marker.rotation.x=-Math.PI/2;marker.position.y=.11;
  marker.renderOrder=20;marker.visible=false;root.add(marker);
  const actor={
    id:nextUnitId++,kind,role,profile,root,visual,radius:UNIT_RADIUS,
    mixer:new THREE.AnimationMixer(visual),actions:new Map(),
    clipCatalog:sharedClipCatalog.get(kind),current:'',action:null,
    health:profile.health,maxHealth:profile.health,
    heading:{x:kind==='witch'?1:-1,z:0},facing:1,attack:null,stun:0,cooldown:rand(.25,1),dead:false,deadTime:0,
    speed:profile.speed,destination:null,attackOrder:null,raiding:false,
    retaliationTarget:null,retaliationOrigin:null,route:null,routeVersion:-1,
    routeGoal:null,routeAge:0,approachCache:null,approachAge:0,
    navWatch:null,unstickSeconds:0,noStepFailures:0,
    unreachableTarget:null,unreachableTime:0,workerRetryTime:0,
    mineJob:null,carryGold:null,defenseTime:0,defenseAnchor:null,
    constructJob:null,repairJob:null,farmJob:null,carryWheat:null,
    treeJob:null,woodJob:null,carryBundle:null,berryJob:null,
    orcFoodJob:null,
    healJob:null,healRetry:0,soulJob:null,soulClaimed:false,soulReservedBy:null,
    workTool:null,hammerTool:null,pickTool:null,chopTool:null,
    weapon:null,selectionRing:marker,outfitInfo,voiceLineIndex
  };
  // A single sword asset is cloned as a lightweight scene node for melee orcs.
  // Workers and ranged units never allocate weapons.
  if(kind==='orc'&&role==='melee'&&swordModel)mountNativeSword(actor);
  if(role==='worker')mountWorkTool(actor);
  animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop',true);applyFacing(actor);
  units.push(actor);refreshHUD();
  return actor;
}
function spawnOrcDefenders(){
  if(orcSpawned||!male)return;
  orcSpawned=true;
  const starters=[['melee',15,17],['worker',21,17],['ranged',19,23],['melee',12,22]];
  starters.forEach(([role,x,z],i)=>spawnUnit('orc',x,z,i,role));
}
function clearSelection(){
  ravenMoveMode=false;selectedRaven=null;
  constructionTab=false;
  for(const actor of selected)actor.selectionRing.visible=false;
  selected.clear();selectedBuilding=null;drawBuildingSelection();refreshHUD();
}
function selectRaven(raven){
  if(activeFaction!=='witch')return;
  clearSelection();selectedRaven=raven;
  refreshHUD();
}
function selectUnits(actors,append=false){
  if(!append)clearSelection();
  for(const actor of actors){
    if(actor.dead||actor.kind!==activeFaction)continue;
    if(append&&selected.has(actor)){selected.delete(actor);actor.selectionRing.visible=false;}
    else{selected.add(actor);actor.selectionRing.visible=true;}
  }
  if(selected.size)acknowledgePlayerOrder(selected);
  refreshHUD();
}
function selectBuilding(building){
  clearSelection();selectedBuilding=building;buildMode=null;rallyMode=false;constructionTab=false;attackMode=false;
  drawBuildingSelection();refreshHUD();
}
function worldPoint(clientX,clientY){
  const rect=viewport.getBoundingClientRect();
  const ndc=new THREE.Vector2((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);
  const point=new THREE.Vector3();
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),point)?{x:point.x,z:point.z}:null;
}
function screenGroundPoint(x,z){
  const projected=new THREE.Vector3(x,0,z).project(camera);
  const rect=viewport.getBoundingClientRect();
  return {x:rect.left+(projected.x+1)*rect.width/2,
    y:rect.top+(1-projected.y)*rect.height/2};
}
function screenPoint(actor){
  const point=actor.root.position.clone();point.y=1;point.project(camera);
  const rect=viewport.getBoundingClientRect();
  return {x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
}
const screenPicking=window.FightersPicking.create({
  viewport,project:(x,y,z)=>new THREE.Vector3(x,y,z).project(camera),
  units:()=>units,ravens:()=>ravenFlock.ravens,ravensReady:()=>ravenModelLoaded,
  trees:()=>forestLayout,woodDeposits:()=>woodDeposits,buildings:liveBuildings,
  activeFaction:()=>activeFaction,visible:visibleToPlayer,
  inside:window.FightersFootprints.inside,clamp
});
function pickUnit(x,y,includeEnemies=false){return screenPicking.unit(x,y,includeEnemies);}
function pickRaven(x,y){return screenPicking.raven(x,y);}
function pickBuilding(pos){return screenPicking.building(pos);}
function pickTree(x,y){return screenPicking.tree(x,y);}
function pickLogBundle(x,y){return screenPicking.logBundle(x,y);}
const activeOrderPings=new Set();
function removeOrderPing(el){
  if(!activeOrderPings.delete(el))return;
  clearTimeout(el.cleanupTimer);
  el.remove();uiStats.feedbackRemoved++;
}
function clearOrderPings(){
  for(const el of [...activeOrderPings])removeOrderPing(el);
}
function expireOrderPings(){
  const now=performance.now();
  for(const el of [...activeOrderPings])if(now-el.createdAt>=950)removeOrderPing(el);
}
function showOrderPing(position,type){
  // A bounded, non-interactive DOM overlay, released on animation completion.
  // Never attach a new Three.js material or mesh for each tactical order.
  const rect=viewport.getBoundingClientRect();
  const point=new THREE.Vector3(position.x,position.y??.12,position.z).project(camera);
  if(!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
  const x=(point.x+1)*rect.width/2,y=(1-point.y)*rect.height/2;
  if(x<-40||y<-40||x>rect.width+40||y>rect.height+40)return;
  while(activeOrderPings.size>=6)removeOrderPing(activeOrderPings.values().next().value);
  const el=document.createElement('div');
  el.className='order-ping '+(type==='attack'?'attack':'move');
  el.style.left=x+'px';el.style.top=y+'px';
  el.createdAt=performance.now();
  $('order-pings').appendChild(el);activeOrderPings.add(el);
  uiStats.feedbackCreated++;uiStats.peakPings=Math.max(uiStats.peakPings,activeOrderPings.size);
  el.addEventListener('animationend',()=>removeOrderPing(el),{once:true});
  el.cleanupTimer=setTimeout(()=>removeOrderPing(el),1100);
}
function pingAttackTarget(target){
  if(isBuilding(target)){
    const b=target.hitbox;
    showOrderPing({x:(b.minX+b.maxX)/2,z:(b.minZ+b.maxZ)/2,y:b.maxY+.35},'attack');
  }else if(target?.root)showOrderPing({
    x:target.root.position.x,z:target.root.position.z,y:1.2
  },'attack');
}
const unitOrders=window.FightersOrders.create({
  navigation:navigatorRTS,
  formationGoals:window.FightersUnitPhysics.formationGoals,
  cancelMoveWork:actor=>{
    cancelConstruction(actor);cancelWoodJob(actor);cancelRepair(actor);
    cancelSoulJob(actor);cancelMineJob(actor);cancelFarmJob(actor);
    actor.treeJob=null;actor.berryJob=null;actor.healJob=null;
  },
  endRaid:window.FightersRaiding.end,
  beginRaid:window.FightersRaiding.begin,
  canAttack:(actor,target)=>!actor.dead&&roles.isFighter(actor)&&enemyOf(actor,target),
  isBuilding,
  cancelSoulJob,
  cancelFoodJob:cancelOrcFoodJob
});
const workerOrders=window.FightersOrders.createWorkerOrders({
  canRepair:repairRules.canRepair,isWorker:roles.isWorker,canMine,
  cancelConstruction,cancelWoodJob,cancelRepair,cancelFarmJob,
  cancelSoulJob,cancelFoodJob:cancelOrcFoodJob,cancelMineJob
});
const aiCommands=window.FightersAiCommands.create({
  scheduleBuild,queueOrder,buildingById:id=>buildingInstances.get(id),
  witchBuilding,units:()=>units,isFighter:roles.isFighter,isWorker:roles.isWorker,
  visibleAt:(x,z,clan)=>fogOfWar.visibleAt(x,z,clan),
  exploredAt:(x,z,clan)=>fogOfWar.exploredAt(x,z,clan),
  targetDistance,localDefensePost,acknowledgeOrcAiOrder,
  beginRaid:window.FightersRaiding.begin,
  cancelFoodJob:cancelOrcFoodJob,cancelSoulJob,orderRepair
});
function issueMove(destination,{spacing=1.35,withinRadius=Infinity}={}){
  const actors=[...selected].filter(actor=>!actor.dead&&actor.kind===activeFaction);
  unitOrders.move(actors,destination,{spacing,withinRadius});
  if(actors.length){
    showOrderPing({x:destination.x,z:destination.z,y:.1},'move');
    acknowledgePlayerOrder(actors);
  }
  refreshHUD();
}
function issueStoneCircleMove(circle){
  if(circle?.type!=='stone-circle'||circle.destroyed||activeFaction!=='witch'||!selected.size)
    return false;
  const centre={x:circle.root.position.x,z:circle.root.position.z};
  // Ordinary formations spread outside the healing radius. Keep sanctuary
  // orders compact so several selected witches can all stand in the glow.
  issueMove(centre,{spacing:.72,withinRadius:stoneHealing.RADIUS-.12});
  showBanner('SORCIÈRES AU CERCLE DE ROCHES');
  return true;
}
function issueRavenMove(destination){
  if(activeFaction!=='witch'||!selectedRaven)return false;
  const raven=ravenFlock.orderMove(selectedRaven.id,destination);
  ravenMoveMode=false;
  if(!raven){showBanner('AUCUN CORBEAU DISPONIBLE');refreshHUD();return false;}
  showOrderPing({x:destination.x,z:destination.z,y:.15},'move');
  showBanner('CORBEAU EN RECONNAISSANCE');refreshHUD();return true;
}
function trainingDuration(building,kind,role='melee'){
  const factor=role==='worker'?.9:role==='ranged'?1.25:1;
  return (kind==='orc'?ORC_TRAIN_DURATION:TRAIN_DURATION)*(1-.2*(building.level-1))*factor;
}
function orcHousingCap(){return orcFoodRules.housingCap(liveBuildings());}
function orcPopulationCommitted(){
  return units.filter(u=>u.kind==='orc'&&!u.dead).length+
    liveBuildings().reduce((sum,b)=>sum+b.queue.filter(o=>o.kind==='orc').length,0);
}
function orcMageUnlocked(){return orcFoodRules.hasCauldron(liveBuildings());}
function canTrainOrcRole(role){
  return orcPopulationCommitted()<orcHousingCap()&&
    (role!=='ranged'||orcMageUnlocked());
}
function upgradeCost(building){
  if(!building||['mine','garden','stone-circle','wall'].includes(building.type)||building.clanId==='neutral')return null;
  return building.level>=3?null:(building.clanId==='witch'?230:160)+building.level*100;
}
function queueOrder(building,kind,role='melee'){
  if(!running||paused||!building||building.destroyed||building.clanId==='neutral'||
    building.type==='mine'||building.queue.length>=MAX_QUEUE)return false;
  const faction=building.clanId==='witch'?'witch':'orc';
  if(kind==='witch'&&(faction!=='witch'||building.type!=='witch-house')||
     kind==='orc'&&(faction!=='orc'||building.type!=='barrack'))return false;
  if(kind==='witch'&&role==='ranged'&&!arcanistUnlocked())return false;
  if(kind==='orc'&&!canTrainOrcRole(role))return false;
  let cost,duration,woodCost=0;
  if(kind==='upgrade'){
    if(building.level+building.queue.filter(j=>j.kind==='upgrade').length>=3)return false;
    cost=upgradeCost(building);woodCost=40;duration=6+building.level*2;
  }else{
    cost=roles.profile(faction,role).cost;
    duration=trainingDuration(building,kind,role);
  }
  if(cost===null||gold[faction]<cost||wood[faction]<woodCost)return false;
  gold[faction]-=cost;wood[faction]-=woodCost;
  building.queue.push({kind,role:kind==='upgrade'?null:role,cost,woodCost,duration});
  refreshHUD();return true;
}
function issueTrain(role='melee'){return queueOrder(witchBuilding,'witch',role);}
function issueOrcTrain(building=selectedBuilding,role='melee'){return queueOrder(building,'orc',role);}
function issueUpgrade(building=selectedBuilding){return queueOrder(building,'upgrade');}
function cancelOrder(building,index){
  if(!building?.queue[index])return false;
  const [order]=building.queue.splice(index,1);
  const clan=building.clanId==='witch'?'witch':'orc';
  gold[clan]+=order.cost;wood[clan]+=order.woodCost||0;
  if(index===0)building.progress=0;
  refreshHUD();return true;
}
function buildingPerimeterSites(building,clearance=UNIT_RADIUS+.08){
  // A source mesh can have thousands of microscopic contour edges. Sample
  // by actual perimeter ARC LENGTH instead of once per vertex, and cache the
  // result until a building changes. Collider detail is NEVER simplified.
  const key=clearance.toFixed(4)+':'+navigatorRTS.version;
  if(building.perimeterCache?.key===key)return building.perimeterCache.sites;
  const collider=building.hitbox,sites=[],spacing=UNIT_RADIUS*2.25;
  // Use exterior rings only: holes can be isolated interior courtyards.
  // Spawning or attacking from an unreachable hole traps actors near walls.
  for(const poly of collider.polygons){
    const ring=poly[0];
    let remaining=spacing*.5;
    for(let k=0;k<ring.length;k++){
      const a=ring[k],b=ring[(k+1)%ring.length],dx=b[0]-a[0],dz=b[1]-a[1];
      const length=Math.hypot(dx,dz);
      if(length<1e-8)continue;
      while(remaining<=length){
        const t=remaining/length,x=a[0]+dx*t,z=a[1]+dz*t;
        for(const sign of [-1,1]){
          const p={x:x+sign*(-dz/length)*clearance,
            z:z+sign*(dx/length)*clearance};
          if(navigatorRTS.pointClear(p))sites.push(p);
        }
        remaining+=spacing;
      }
      remaining-=length;
    }
  }
  building.perimeterCache={key,sites};
  return sites;
}
function safeSpawnNear(building){
  const sites=buildingPerimeterSites(building,UNIT_RADIUS+.14);
  // Exact polygons can leave narrow pockets between a wall and the map edge.
  // A point may be collision-free yet have no A* exit; do not spawn a unit
  // that can never reach the rest of the battlefield.
  const hub=navigatorRTS.findSafeGoal({x:0,z:0});
  if(!hub)return null;
  if(building.spawnReachVersion!==navigatorRTS.version){
    building.spawnReachVersion=navigatorRTS.version;
    building.spawnReachable=new Map();
  }
  for(let i=0;i<sites.length;i++){
    const point=sites[i];
    if(units.some(u=>!u.dead&&Math.hypot(u.root.position.x-point.x,
      u.root.position.z-point.z)<UNIT_RADIUS*2.3))continue;
    if(!building.spawnReachable.has(i))
      building.spawnReachable.set(i,!!navigatorRTS.plan(point,hub));
    if(!building.spawnReachable.get(i))continue;
    return point;
  }
  const b=building.hitbox;
  const fallback=navigatorRTS.findSafeSpawn(building.rally||{
    x:(b.minX+b.maxX)/2,z:b.maxZ+UNIT_RADIUS*3
  });
  return fallback&&navigatorRTS.plan(fallback,hub)?fallback:null;
}
function finishTraining(building,kind,role='melee'){
  const position=safeSpawnNear(building);
  if(!position){showBanner('SORTIE BLOQUÉE');return;}
  const actor=spawnUnit(kind,position.x,position.z,units.filter(u=>u.kind===kind).length,role);
  if(building.rally)actor.destination=navigatorRTS.findSafeGoal(building.rally);
  if(kind==='orc')playOrcVoice('creation',actor);
  else if(kind==='witch')playWitchVoice('creation',actor);
  showBanner(role==='melee'?(kind==='witch'?'SORCIÈRE FORMÉE':'ORC FORMÉ'):
    roles.profile(kind,role).name.toUpperCase()+' FORMÉ(E)');
}
async function useOrcLevelModel(building,level){
  const key=building.type+':'+level,entry=orcLevelEntries.get(key);
  if(!entry)throw Error('GLB de niveau manquant : '+key);
  if(!orcLevelCache.has(key))orcLevelCache.set(key,loader.loadAsync(entry.file));
  const gltf=await orcLevelCache.get(key);
  if(building.level!==level||building.destroyed)return;
  const model=gltf.scene.clone(true),bounds=orcModelBounds(model,building.type);
  const size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  const footprint=Math.max(size.x,size.z);
  if(!Number.isFinite(footprint)||footprint<=0)throw Error('GLB de niveau invalide');
  const anchor=building.root,old=anchor.children.find(n=>n!==building.healthBar.root);
  if(old){
    const previous=old.children[0];
    for(let i=orcAnimationMixers.length-1;i>=0;i--){
      const mixer=orcAnimationMixers[i];
      if(mixer.getRoot()===previous){mixer.stopAllAction();orcAnimationMixers.splice(i,1);}
    }
    anchor.remove(old);
  }
  const offset=new THREE.Group();
  offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(model);
  anchor.add(offset);anchor.scale.setScalar(3.9/footprint);
  const mixer=new THREE.AnimationMixer(model);
  for(const clip of gltf.animations||[])if(clip.tracks.length)mixer.clipAction(clip).play();
  orcAnimationMixers.push(mixer);
  const projection=await loadFootprint(entry.file);
  building.hitbox=buildingBounds(model,projection);
  building.footprintProjection=projection;
  building.visualHitbox=buildingVisualBounds(offset);building.visualLevel=level;
  updateNavObstacles();drawBuildingSelection();refreshHUD();
}
function finishUpgrade(building){
  if(['mine','garden','stone-circle'].includes(building.type)||building.clanId==='neutral'||building.level>=3)return;
  const prev=building.maxHealth;building.level++;
  building.maxHealth=building.clanId==='witch'?WITCH_HOUSE_HEALTH+750*(building.level-1):
    BUILDING_TYPES[building.type].levels[building.level].maxHealth;
  building.health=Math.min(building.maxHealth,building.health+(building.maxHealth-prev));
  if(building.healthBar)updateHealthBar(building);
  if(building.clanId==='orcs')
    useOrcLevelModel(building,building.level).catch(err=>console.warn('Upgrade GLB:',err));
  showBanner('AMÉLIORATION NIVEAU '+building.level);refreshHUD();
}
function stepProduction(dt){
  for(const building of liveBuildings()){
    if(!building.queue.length){building.progress=0;continue;}
    building.progress+=dt;
    const order=building.queue[0];
    if(building.progress+1e-9<order.duration)continue;
    building.progress=Math.max(0,building.progress-order.duration);building.queue.shift();
    if(order.kind==='upgrade')finishUpgrade(building);
    else finishTraining(building,order.kind,order.role||'melee');
  }
}
function setRally(building,location){
  if(!building||building.clanId==='neutral')return false;
  const point=navigatorRTS.findSafeGoal(location);if(!point)return false;
  building.rally=point;rallyMode=false;
  if(building.rallyMarker){
    scene.remove(building.rallyMarker);building.rallyMarker.geometry.dispose();
    building.rallyMarker.material.dispose();
  }
  const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.57,24),
    new THREE.MeshBasicMaterial({color:0xf4d46a,side:THREE.DoubleSide,depthTest:false}));
  ring.rotation.x=-Math.PI/2;ring.position.set(point.x,.045,point.z);
  scene.add(ring);building.rallyMarker=ring;showBanner('POINT DE RASSEMBLEMENT');
  refreshHUD();return true;
}
function beginRally(){
  if(!selectedBuilding)return false;
  rallyMode=true;buildMode=null;constructionTab=false;refreshHUD();return true;
}

const WITCH_BUILD_COST=230,GARDEN_BUILD_COST=175,STONE_BUILD_COST=260,BUILD_SECONDS=6;
const BUILD_WOOD_COST=Object.freeze({'witch-house':75,garden:0,'stone-circle':85,
  hut:55,barrack:95,cauldron:80,factory:130,wall:10});
const pendingBuilds=[];
function constructionCost(type){
  return type==='witch-house'?WITCH_BUILD_COST:type==='garden'?GARDEN_BUILD_COST:
    type==='stone-circle'?STONE_BUILD_COST:ORC_COSTS[type]||null;
}
function constructionWood(type){return BUILD_WOOD_COST[type]??0;}
function canAffordConstruction(clan,type){
  return gold[clan]>=constructionCost(type)&&wood[clan]>=constructionWood(type);
}
function buildFaction(type){return ['witch-house','garden','stone-circle'].includes(type)?'witch':'orc';}
function builderAvailable(clan){
  return units.some(u=>u.kind===clan&&roles.isWorker(u)&&!u.dead);
}
function beginBuild(type){
  const clan=buildFaction(type),cost=constructionCost(type);
  if(!running||paused||activeFaction!==clan||!cost||
    (clan==='orc'&&type!=='wall'&&!buildingBlueprints.has(type))||
    (clan==='witch'&&type==='witch-house'&&!witchHouse)||
    (type==='stone-circle'&&!circleUnlocked())||
    (type==='stone-circle'&&!standingStoneModel)||
    !canAffordConstruction(clan,type)||!builderAvailable(clan))return false;
  buildMode=type;rallyMode=false;constructionTab=false;refreshHUD();return true;
}
function wallNeighbours(){return [...buildingInstances.values()].filter(b=>b.type==='wall'&&!b.destroyed)
  .map(b=>({x:b.root.position.x,z:b.root.position.z,axis:b.wallAxis,hitbox:b.hitbox}));}
function wallPlacement(x,z,axis){return window.FightersWalls.resolve(x,z,wallNeighbours(),
  liveBuildings().filter(b=>b.clanId==='orcs'),axis);}
function wallKeepsVillageExit(proposed){
  // Compare paths from an actual village orc to westward exits before/after
  // placement. Even a player-placed wall cannot seal the last usable exit.
  const inside=units.filter(u=>u.kind==='orc'&&!u.dead&&
    Math.hypot(u.root.position.x-19,u.root.position.z-18)<10&&
    navigatorRTS.pointClear(u.root.position)).sort((a,b)=>
    Math.hypot(a.root.position.x-19,a.root.position.z-18)-
    Math.hypot(b.root.position.x-19,b.root.position.z-18))[0];
  const source=inside?{x:inside.root.position.x,z:inside.root.position.z}:
    navigatorRTS.findSafeGoal({x:19,z:18});
  if(!source)return true;
  const exits=[{x:3,z:18},{x:6,z:10},{x:5,z:26}].filter(p=>
    navigatorRTS.pointClear(p)&&!!navigatorRTS.plan(source,p));
  if(!exits.length)return true;
  const check=new window.FightersNavigation.Navigator({
    halfSize:arena.worldHalf,cellSize:1,radius:UNIT_RADIUS,region:arena});
  check.setObstacles([...navigatorRTS.obstacles,proposed]);
  return check.pointClear(source)&&exits.some(p=>check.pointClear(p)&&!!check.plan(source,p));
}
function buildShape(type,x,z,axis){
  const geometry=window.FightersFootprints;
  if(type==='wall')return window.FightersWalls.shape(x,z,axis||wallPlacement(x,z).axis);
  if(type==='garden')return gardenShape(x,z);
  if(type==='stone-circle')return stoneCircleShape(x,z);
  if(type==='witch-house'&&witchHouse&&witchBuilding.hitbox.shape==='polygon')
    return geometry.translated(witchBuilding.hitbox,x-WITCH_HOUSE.x,z-WITCH_HOUSE.z);
  const template=buildingBlueprints.get(type);
  return template?.collisionLocal?geometry.translated(template.collisionLocal,x,z):null;
}
function validBuildPosition(x,z,type='hut',axis){
  if(!constructionCost(type))return false;
  if(type==='stone-circle'&&!circleUnlocked())return false;
  if(type==='wall'&&!axis){const point=wallPlacement(x,z);x=point.x;z=point.z;axis=point.axis;}
  const proposed=buildShape(type,x,z,axis);
  if(!proposed)return false;
  const clan=buildFaction(type),geometry=window.FightersFootprints;
  const minX=clan==='witch'?-arena.worldHalf:0,
    maxX=clan==='witch'?0:arena.worldHalf;
  // Keep the existing faction territories on their world X side, but test
  // every silhouette vertex against the actual screen-square battlefield.
  if(proposed.minX<minX+BUILD_CLEARANCE||proposed.maxX>maxX-BUILD_CLEARANCE||
    proposed.polygons.some(poly=>poly.some(ring=>ring.some(([px,pz])=>
      !arena.contains(px,pz,BUILD_CLEARANCE)))))return false;
  // The same true projected X/Z polygons govern construction and collision.
  if(forestObstacles.some(tree=>geometry.withinClearance(proposed,tree,BUILD_CLEARANCE))||
     wildBerries.bushes.some(b=>geometry.distanceTo({x:b.x,z:b.z},proposed)<1.65)||
     liveBuildings().some(b=>b.type!=='wall'&&geometry.withinClearance(proposed,b.hitbox,BUILD_CLEARANCE))||
     pendingBuilds.some(job=>job.type!=='wall'&&geometry.withinClearance(proposed,job.site.hitbox,BUILD_CLEARANCE)))return false;
  const walls=wallNeighbours(),candidate={x,z,axis:axis||wallPlacement(x,z).axis};
  const pendingWalls=pendingBuilds.filter(j=>j.type==='wall').map(j=>({
    x:j.x,z:j.z,axis:j.axis,hitbox:j.site.hitbox}));
  if(type==='wall'){
    if([...walls,...pendingWalls].some(w=>!window.FightersWalls.compatible(candidate,w)))return false;
    // Wall-to-wall placement cannot leave an isolated distant section; touching
    // caps are permitted (indeed preferred) at straight runs and corners.
    if(![...walls,...pendingWalls].some(w=>geometry.withinClearance(proposed,w.hitbox,
      window.FightersWalls.MAX_LINK_GAP))&&
      !liveBuildings().some(b=>b.clanId==='orcs'&&b.type!=='mine'&&b.type!=='wall'&&
        geometry.withinClearance(proposed,b.hitbox,16)))return false;
    if(!wallKeepsVillageExit(proposed))return false;
  }else{
    // New structures must grow from a real allied structure, never from walls
    // or neutral gold deposits. Both clans obey the same 8-world-unit limit.
    if(!liveBuildings().some(b=>b.clanId===(clan==='orc'?'orcs':'witch')&&
      b.type!=='wall'&&b.type!=='mine'&&
      geometry.withinClearance(proposed,b.hitbox,8)))return false;
    if([...walls,...pendingWalls].some(w=>geometry.withinClearance(proposed,w.hitbox,BUILD_CLEARANCE)))return false;
  }
  // The garden is cultivated ground, not a solid building: occupying a bed
  // must not prevent the gardener from finishing construction inside it.
  return type==='garden'||type==='stone-circle'||units.every(actor=>actor.dead||
    !geometry.pointBlocked(actor.root.position,proposed,UNIT_RADIUS));
}
function stoneCircleShape(x,z){
  const points=Array.from({length:24},(_,i)=>{
    const angle=2*Math.PI*i/24;
    return [x+3.42*Math.cos(angle),z+3.42*Math.sin(angle)];
  });
  return {...window.FightersFootprints.shapeFromPolygons([[points]]),minY:0,maxY:2.8};
}
function stoneRingObstacles(x,z,id){
  return Array.from({length:STONE_RING_COUNT},(_,i)=>{
    const angle=i*2*Math.PI/STONE_RING_SLOTS+STONE_RING_START;
    const cx=x+Math.cos(angle)*STONE_RING_RADIUS;
    const cz=z+Math.sin(angle)*STONE_RING_RADIUS;
    return {id:id+'-menhir-'+i,shape:'aabb',minX:cx-.47,maxX:cx+.47,
      minZ:cz-.47,maxZ:cz+.47,minY:0,maxY:2.8};
  });
}
function makeStoneCircleVisual(){
  const root=new THREE.Group();
  for(let i=0;i<STONE_RING_COUNT;i++){
    const angle=i*2*Math.PI/STONE_RING_SLOTS+STONE_RING_START;
    const menhir=standingStoneModel.clone(true);
    menhir.name='standing-stone-'+i;
    menhir.position.set(Math.cos(angle)*STONE_RING_RADIUS,0,
      Math.sin(angle)*STONE_RING_RADIUS);
    menhir.rotation.y=angle+.35+i*.41;
    menhir.scale.setScalar(.76+(i%3)*.03);
    root.add(menhir);
  }
  const magic=new THREE.Group();magic.name='healing-magic';root.add(magic);
  function disc(geometry,color,opacity,height){
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,
      transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide,
      blending:THREE.AdditiveBlending}));
    mesh.rotation.x=-Math.PI/2;mesh.position.y=height;
    mesh.userData.stoneEffect=true;magic.add(mesh);return mesh;
  }
  const core=disc(new THREE.CircleGeometry(1.42,64),0x389fbb,.23,.045);
  const pulse=disc(new THREE.RingGeometry(1.28,1.47,64),0xb5fce6,.75,.08);
  const glyphs=disc(new THREE.RingGeometry(1.64,1.69,64),0x8cead8,.5,.065);
  const positions=[];
  for(let i=0;i<28;i++){
    const angle=i*2.39996323,r=.2+1.25*Math.sqrt((i+.5)/28);
    positions.push(r*Math.cos(angle),.17+(i%5)*.13,r*Math.sin(angle));
  }
  const points=new THREE.BufferGeometry();points.setAttribute('position',
    new THREE.Float32BufferAttribute(positions,3));
  const sparkles=new THREE.Points(points,new THREE.PointsMaterial({
    color:0xd7fff3,size:.11,transparent:true,opacity:.8,depthWrite:false,
    blending:THREE.AdditiveBlending}));
  sparkles.userData.stoneEffect=true;magic.add(sparkles);
  return {root,magic:{core,pulse,glyphs,sparkles,phase:0}};
}
// Soil beds remain bare during construction and while the real crop catalog
// loads. The simple plant geometry below is only for wild-berry fallback and
// carried wheat, never for temporary garden crops.
const farmGeometry={
  bed:new THREE.BoxGeometry(3.55,.20,3.55),row:new THREE.BoxGeometry(1.48,.11,.91),
  stem:new THREE.CylinderGeometry(.055,.095,.8,5),
  leaves:new THREE.ConeGeometry(.36,.68,5),
  fruit:new THREE.SphereGeometry(.31,8,6)
};
const farmMaterial={
  edge:new THREE.MeshLambertMaterial({color:0x775436}),
  soil:new THREE.MeshLambertMaterial({color:0x4a3128}),
  stalk:new THREE.MeshLambertMaterial({color:0x4b8a42}),
  leaf:new THREE.MeshLambertMaterial({color:0x6cbd4d}),
  produce:new THREE.MeshLambertMaterial({color:0xdeb65b})
};
function gardenShape(x,z){
  const h=1.80;
  const shape=window.FightersFootprints.shapeFromPolygons([
    [[[x-h,z-h],[x+h,z-h],[x+h,z+h],[x-h,z+h]]]
  ]);
  return {...shape,minY:0,maxY:1.8};
}
function makeGardenVisual(){
  const root=new THREE.Group(),bed=new THREE.Mesh(farmGeometry.bed,farmMaterial.edge);
  bed.position.y=.10;root.add(bed);
  const plots=[];
  for(let index=0;index<6;index++){
    const x=index%2?+.91:-.91,z=(Math.floor(index/2)-1)*1.10;
    const row=new THREE.Mesh(farmGeometry.row,farmMaterial.soil);
    row.position.set(x,.24,z);root.add(row);
    const plant=new THREE.Group();plant.position.set(x,.28,z);
    // Leave the growing position empty until licensed Wheat_F1..F3 meshes
    // arrive. Construction previews must never show invented giant plants.
    root.add(plant);
    plots.push({plant,stage:0});
  }
  return {root,plots};
}
// The Sketchfab pack uses Z as up, and arranges variants very far apart.
// CI extracts real Wheat_F1..F3 and Tomatoe_F1..F3 meshes from the source GLB.
// The Tomatoe shrub becomes our wild, edible berry bush; geometry is shared.
const CROP_NAMES=['Wheat','Tomatoe'];
let cropCatalog=null,cropLoadPromise=null,cropLoadError=null;
let cropTransport=null,cropWireBytes=0;
function buildCropCatalog(gltf){
  const catalog=new Map();
  for(let species=0;species<CROP_NAMES.length;species++){
    const stages=[],sizes=[];
    for(let stage=1;stage<=3;stage++){
      const name=CROP_NAMES[species]+'_F'+stage;
      const source=gltf.scene.getObjectByName(name);
      if(!source)throw Error('Missing crop mesh: '+name);
      const upright=new THREE.Group(),model=source.clone(true);
      model.rotation.x=-Math.PI/2;upright.add(model);
      upright.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(upright);
      if(bounds.isEmpty())throw Error('Empty crop mesh: '+name);
      const center=bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x,-bounds.min.y,-center.z);
      stages.push(upright);sizes.push(bounds.getSize(new THREE.Vector3()));
    }
    const mature=sizes[2];
    const scale=species===0?
      Math.min(1.27/Math.max(mature.x,mature.z),1.20/mature.y):
      Math.min(1.65/Math.max(mature.x,mature.z),1.45/mature.y);
    for(const model of stages)model.scale.setScalar(scale);
    catalog.set(species,stages);
  }
  return catalog;
}
function installGardenCrops(building){
  if(!cropCatalog||building.destroyed||!farming.garden(building.id))return;
  const plots=farming.garden(building.id).plots;
  for(let i=0;i<plots.length;i++){
    const visual=building.cropVisuals[i];
    if(visual.variants)continue;
    visual.plant.clear();visual.plant.scale.setScalar(1);
    visual.variants=cropCatalog.get(plots[i].species).map(model=>model.clone(true));
    visual.plant.add(...visual.variants);
    visual.stage=0;
  }
  syncGardenVisual(building);
}
function beginCropLoad(){
  if(cropLoadPromise)return cropLoadPromise;
  cropLoadPromise=(async()=>{
    let gltf=null;
    if(typeof DecompressionStream==='function'){
      try{
        const result=await fetchAsset('./models/crops.rts.glb.gz',
          {compressed:true,timeout:30000});
        gltf=await loader.parseAsync(result.data,'');
        cropTransport='gzip';cropWireBytes=result.wireBytes;
      }catch(err){
        console.warn('Compressed garden assets unavailable, trying GLB:',err);
      }
    }
    if(!gltf){
      gltf=await loader.loadAsync('./models/crops.rts.glb');
      cropTransport='raw';cropWireBytes=0;
    }
    cropCatalog=buildCropCatalog(gltf);
    rebuildBerryVisuals();
    for(const building of buildingInstances.values())
      if(building.type==='garden')installGardenCrops(building);
  })().catch(err=>{
    cropLoadError=String(err?.message||err);
    console.warn('Could not load licensed garden crops:',err);
  });
  return cropLoadPromise;
}
// One instanced batch per source mesh and growth stage, even for dozens of
// shrubs. Updating the stage only swaps instance matrices; nothing is created
// during the animation loop. Shrubs have no building or navigation hitbox.
const berryBatches=[],berryInstanceRecords=[],berryVisualStages=[];
const berryHiddenMatrix=new THREE.Matrix4().makeScale(0,0,0);
const berryFallbackMaterial=new THREE.MeshLambertMaterial({color:0xb43148});
let berryFallbackStages=null;
function fallbackBerryStages(){
  if(berryFallbackStages)return berryFallbackStages;
  berryFallbackStages=[1,2,3].map(stage=>{
    const group=new THREE.Group();
    const stem=new THREE.Mesh(farmGeometry.stem,farmMaterial.stalk);
    stem.position.y=.30;stem.scale.setScalar(stage===1?.5:stage===2?.8:1);
    group.add(stem);
    const crown=new THREE.Mesh(farmGeometry.leaves,farmMaterial.leaf);
    crown.position.y=stage===1?.37:stage===2?.51:.63;
    crown.scale.setScalar(stage===1?.47:stage===2?.75:1);
    group.add(crown);
    if(stage===3){
      for(const [x,z] of [[-.22,0],[.18,-.15],[.08,.24]]){
        const fruit=new THREE.Mesh(farmGeometry.fruit,berryFallbackMaterial);
        fruit.scale.setScalar(.4);fruit.position.set(x,.57,z);group.add(fruit);
      }
    }
    return group;
  });
  return berryFallbackStages;
}
function rebuildBerryVisuals(){
  for(const batch of berryBatches){scene.remove(batch);batch.dispose();}
  berryBatches.length=0;berryInstanceRecords.length=0;berryVisualStages.length=0;
  for(let i=0;i<wildBerries.bushes.length;i++)berryInstanceRecords.push([]);
  const stages=cropCatalog?.get(1)||fallbackBerryStages();
  const position=new THREE.Vector3(),rotation=new THREE.Quaternion();
  const scale=new THREE.Vector3(),placement=new THREE.Matrix4();
  const yAxis=new THREE.Vector3(0,1,0);
  for(let stage=1;stage<=3;stage++){
    const template=stages[stage-1];template.updateMatrixWorld(true);
    template.traverse(mesh=>{
      if(!mesh.isMesh)return;
      const batch=new THREE.InstancedMesh(mesh.geometry,mesh.material,wildBerries.bushes.length);
      batch.name='wild-berry-stage-'+stage;
      batch.frustumCulled=false;batch.castShadow=false;batch.receiveShadow=false;
      wildBerries.bushes.forEach((bush,i)=>{
        position.set(bush.x,0,bush.z);
        rotation.setFromAxisAngle(yAxis,bush.angle);
        scale.setScalar(bush.scale);
        placement.compose(position,rotation,scale).multiply(mesh.matrixWorld);
        const matrix=placement.clone();
        berryInstanceRecords[i].push({stage,batch,matrix});
        batch.setMatrixAt(i,bush.stage===stage?matrix:berryHiddenMatrix);
      });
      batch.instanceMatrix.needsUpdate=true;scene.add(batch);berryBatches.push(batch);
    });
  }
  for(const bush of wildBerries.bushes)berryVisualStages.push(bush.stage);
}
function syncBerryVisuals(){
  for(let i=0;i<wildBerries.bushes.length;i++){
    const stage=wildBerries.bushes[i].stage;
    if(berryVisualStages[i]===stage)continue;
    for(const entry of berryInstanceRecords[i]||[]){
      entry.batch.setMatrixAt(i,entry.stage===stage?entry.matrix:berryHiddenMatrix);
      entry.batch.instanceMatrix.needsUpdate=true;
    }
    berryVisualStages[i]=stage;
  }
}
function syncGardenVisual(building){
  const state=farming.garden(building.id);
  if(!state)return;
  for(let i=0;i<state.plots.length;i++){
    const stage=state.plots[i].stage,visual=building.cropVisuals[i];
    if(visual.stage===stage)continue;
    visual.stage=stage;
    if(visual.variants){
      for(let index=0;index<visual.variants.length;index++)
        visual.variants[index].visible=index===stage-1;
    }
  }
}
function buildGarden(x,z,{prepaid=false}={}){
  if((!prepaid&&!canAffordConstruction('witch','garden'))||!validBuildPosition(x,z,'garden'))return false;
  const id='witch-garden-'+String(++farmSerial).padStart(2,'0');
  const {root,plots}=makeGardenVisual();
  root.position.set(x,0,z);scene.add(root);
  const bar=new THREE.Group();bar.name='healthbar-world-'+id;
  const background=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.24),
    new THREE.MeshBasicMaterial({color:0x292929,depthTest:false,side:THREE.DoubleSide}));
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.17),
    new THREE.MeshBasicMaterial({color:0x65c957,depthTest:false,side:THREE.DoubleSide}));
  fill.position.z=.01;bar.add(background,fill);scene.add(bar);
  const building={id,type:'garden',kind:'garden',clanId:'witch',level:1,
    health:GARDEN_HEALTH,maxHealth:GARDEN_HEALTH,root,hitbox:gardenShape(x,z),
    visualHitbox:buildingVisualBounds(root),queue:[],progress:0,
    rally:null,rallyMarker:null,healthBar:{root:bar,fill},
    cropVisuals:plots,destroyed:false,initial:false};
  farming.addGarden(id);syncGardenVisual(building);
  buildingInstances.set(id,building);
  if(cropCatalog)installGardenCrops(building);
  else void beginCropLoad();
  if(!prepaid){gold.witch-=GARDEN_BUILD_COST;wood.witch-=constructionWood('garden');}
  updateHealthBar(building);updateNavObstacles();refreshHUD();return building;
}
function buildStoneCircle(x,z,{prepaid=false}={}){
  if(!circleUnlocked()||!standingStoneModel||(!prepaid&&!canAffordConstruction('witch','stone-circle'))||
    !validBuildPosition(x,z,'stone-circle'))return false;
  const id='witch-stone-circle-'+String(++stoneCircleSerial).padStart(2,'0');
  const {root,magic}=makeStoneCircleVisual();
  root.position.set(x,0,z);scene.add(root);
  const bar=new THREE.Group();bar.name='healthbar-world-'+id;
  const background=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.24),
    new THREE.MeshBasicMaterial({color:0x292929,depthTest:false,side:THREE.DoubleSide}));
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.17),
    new THREE.MeshBasicMaterial({color:0x65c957,depthTest:false,side:THREE.DoubleSide}));
  fill.position.z=.01;bar.add(background,fill);scene.add(bar);
  const building={id,kind:'stone-circle',type:'stone-circle',clanId:'witch',level:1,
    health:STONE_CIRCLE_HEALTH,maxHealth:STONE_CIRCLE_HEALTH,root,magic,
    hitbox:stoneCircleShape(x,z),visualHitbox:buildingVisualBounds(root),
    queue:[],progress:0,rally:null,rallyMarker:null,healthBar:{root:bar,fill},
    destroyed:false,initial:false};
  buildingInstances.set(id,building);
  if(!prepaid){gold.witch-=STONE_BUILD_COST;wood.witch-=constructionWood('stone-circle');}
  updateHealthBar(building);updateNavObstacles();refreshHUD();return building;
}

// Each stone segment takes four small instanced batches, not dozens of draw
// calls. Subtle colour variation, offset masonry courses and raised coping
// remain visually continuous through straight joints and right-angle corners.
const WALL_PALETTE=[0x9b9e99,0x797e79,0xadb0a7,0x646d68].map(color=>
  new THREE.MeshLambertMaterial({color}));
function makeWallVisual(axis='x'){
  const root=new THREE.Group(),stone=window.FightersWalls;
  const blocks=WALL_PALETTE.map(()=>[]);
  const length=stone.LENGTH,half=length/2;
  const add=(x,y,z,w,h,d,shade,terminal=0)=>blocks[shade].push({x,y,z,w,h,d,terminal});
  for(let row=0;row<3;row++){
    const height=row===0?.46:.41,base=row===0?0:row===1?.46:.87;
    const count=row%2===0?6:7;
    for(let i=0;i<count;i++){
      const min=-half+i*length/count,max=-half+(i+1)*length/count;
      const bevel=.018;
      add((min+max)/2,base+height/2,0,max-min-bevel,height-.025,
        stone.WIDTH-(row===1?.03:0),(i*3+row*5)%4);
    }
  }
  // A light overhanging coping joins sections, while terminal capstones form
  // an intentional stone pier at every turn (not a broken miter).
  for(let i=0;i<6;i++)add(-half+(i+.5)*length/6,1.37,0,
    length/6-.018,.19,stone.WIDTH+.12,i%3);
  for(const sign of [-1,1]){
    const x=sign*half;
    add(x,.33,0,.78,.66,.82,1,sign);
    add(x,.84,0,.72,.36,.76,2,sign);
    add(x,1.25,0,.87,.18,.86,0,sign);
  }
  const transform=new THREE.Object3D();
  root.userData.wallBatches=[];
  blocks.forEach((list,i)=>{
    if(!list.length)return;
    const mesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),WALL_PALETTE[i],list.length);
    mesh.name='wall-stone-course-'+i;
    list.forEach((b,j)=>{
      transform.position.set(b.x,b.y,b.z);transform.scale.set(b.w,b.h,b.d);
      transform.updateMatrix();mesh.setMatrixAt(j,transform.matrix);
    });
    mesh.instanceMatrix.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=true;
    root.add(mesh);
    root.userData.wallBatches.push({mesh,blocks:list});
  });
  root.rotation.y=axis==='z'?-Math.PI/2:0;
  return root;
}
let wallSerial=0;
function syncWallJoints(){
  // At a shared endpoint exactly one segment owns the pier. Avoid doubled
  // stone caps and flickering coincident faces, even at T and L junctions.
  const occupied=new Set(),stone=window.FightersWalls;
  for(const building of [...buildingInstances.values()].filter(b=>
    b.type==='wall'&&!b.destroyed).sort((a,b)=>a.id.localeCompare(b.id))){
    const endpoints=stone.ends({x:building.root.position.x,
      z:building.root.position.z,axis:building.wallAxis});
    const visibility=new Map();
    [-1,1].forEach((sign,i)=>{
      const p=endpoints[i],key=p.x.toFixed(2)+':'+p.z.toFixed(2);
      visibility.set(sign,!occupied.has(key));occupied.add(key);
    });
    const transform=new THREE.Object3D();
    for(const {mesh,blocks} of building.root.userData.wallBatches||[]){
      blocks.forEach((b,j)=>{
        transform.position.set(b.x,b.y,b.z);
        const show=!b.terminal||visibility.get(b.terminal);
        transform.scale.set(show?b.w:.0001,show?b.h:.0001,show?b.d:.0001);
        transform.updateMatrix();mesh.setMatrixAt(j,transform.matrix);
      });
      mesh.instanceMatrix.needsUpdate=true;
    }
  }
}
function buildWall(x,z,{prepaid=false,byAI=false,axis=null}={}){
  const point=wallPlacement(x,z,axis);
  if((!prepaid&&!canAffordConstruction('orc','wall'))||
    !validBuildPosition(point.x,point.z,'wall',point.axis))return false;
  const root=makeWallVisual(point.axis),id='orc-wall-'+String(++wallSerial).padStart(3,'0');
  root.position.set(point.x,0,point.z);scene.add(root);
  const bar=new THREE.Group();bar.name='healthbar-world-'+id;
  const background=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.24),
    new THREE.MeshBasicMaterial({color:0x292929,depthTest:false,side:THREE.DoubleSide}));
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.17),
    new THREE.MeshBasicMaterial({color:0x65c957,depthTest:false,side:THREE.DoubleSide}));
  fill.position.z=.01;bar.add(background,fill);scene.add(bar);
  const building={id,type:'wall',clanId:'orcs',wallAxis:point.axis,level:1,
    health:280,maxHealth:280,root,hitbox:buildShape('wall',point.x,point.z,point.axis),
    visualHitbox:buildingVisualBounds(root),queue:[],progress:0,
    rally:null,rallyMarker:null,healthBar:{root:bar,fill},destroyed:false,initial:false};
  buildingInstances.set(id,building);
  syncWallJoints();
  if(!prepaid){gold.orc-=constructionCost('wall');wood.orc-=constructionWood('wall');}
  if(!byAI){buildMode=null;showBanner('MUR DE PIERRE CONSTRUIT');}
  updateHealthBar(building);updateNavObstacles();refreshHUD();return building;
}

function buildOrc(type,x,z,{byAI=false,prepaid=false}={}){
  if(type==='wall')return buildWall(x,z,{byAI,prepaid});
  if(!ORC_COSTS[type]||!buildingBlueprints.has(type)||
    (!prepaid&&!canAffordConstruction('orc',type))||!validBuildPosition(x,z,type))return false;
  const template=buildingBlueprints.get(type),model=template.source.clone(true);
  model.updateMatrixWorld(true);
  const bounds=orcModelBounds(model,type),center=bounds.getCenter(new THREE.Vector3());
  const anchor=new THREE.Group(),offset=new THREE.Group();
  offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(model);anchor.add(offset);
  anchor.scale.setScalar(3.9/template.footprint);anchor.position.set(x,0,z);
  if(template.clips.length){
    const mixer=new THREE.AnimationMixer(model);
    for(const clip of template.clips)if(clip.tracks.length)mixer.clipAction(clip).play();
    orcAnimationMixers.push(mixer);
  }
  const instance=createBuildingInstance(template.entry,type,1,anchor,3.9,model,template.projection);
  if(!orcVillage){orcVillage=new THREE.Group();scene.add(orcVillage);}
  orcVillage.add(anchor);
  if(!prepaid){gold.orc-=ORC_COSTS[type];wood.orc-=constructionWood(type);}
  if(!byAI){buildMode=null;showBanner(ORC_NAMES[type]+' CONSTRUITE');}
  updateNavObstacles();refreshHUD();return instance;
}
function buildWitchHouse(x,z,{prepaid=false}={}){
  if(!witchHouse||(!prepaid&&!canAffordConstruction('witch','witch-house'))||
     !validBuildPosition(x,z,'witch-house'))return false;
  // Reuse the already-loaded house hierarchy, geometry, materials and textures.
  const root=witchHouse.clone(true);
  root.position.set(x,0,z);
  const id='witch-house-'+String(2+[...buildingInstances.values()].filter(
    b=>b.type==='witch-house').length).padStart(2,'0');
  const instance={
    id,kind:'witch-house',type:'witch-house',clanId:'witch',level:1,
    health:WITCH_HOUSE_HEALTH,maxHealth:WITCH_HOUSE_HEALTH,root,destroyed:false,initial:false,
    queue:[],progress:0,rally:null,rallyMarker:null,
    hitbox:buildShape('witch-house',x,z),visualHitbox:buildingVisualBounds(root)
  };
  // Built houses participate in the same world-space health-bar lifecycle
  // and QA inspection as every original orc building.
  const bar=new THREE.Group();bar.name='healthbar-world-'+id;
  const backdrop=new THREE.Mesh(new THREE.PlaneGeometry(2.3,.24),
    new THREE.MeshBasicMaterial({color:0x292929,depthTest:false,side:THREE.DoubleSide}));
  const fill=new THREE.Mesh(new THREE.PlaneGeometry(2.2,.17),
    new THREE.MeshBasicMaterial({color:0x65c957,depthTest:false,side:THREE.DoubleSide}));
  fill.position.z=.01;bar.add(backdrop,fill);
  instance.healthBar={root:bar,fill};scene.add(bar);
  buildingInstances.set(id,instance);scene.add(root);updateHealthBar(instance);
  if(!prepaid){gold.witch-=WITCH_BUILD_COST;wood.witch-=constructionWood('witch-house');}
  updateNavObstacles();refreshHUD();return instance;
}
// Construction previews use the real building meshes. A horizontal WebGL
// clipping plane reveals their geometry from ground to roof; changing scale Y
// would squash the architecture and misalign its materials and animations.
function createConstructionPreview(type,x,z,axis=null){
  let root,architectureHeight=null;
  if(type==='wall'){
    root=makeWallVisual(axis||wallPlacement(x,z).axis);root.position.set(x,0,z);
  }else if(type==='witch-house'){
    if(!witchHouse)return null;
    root=witchHouse.clone(true);root.position.set(x,0,z);
  }else if(type==='garden'){
    root=makeGardenVisual().root;root.position.set(x,0,z);
  }else if(type==='stone-circle'){
    if(!standingStoneModel)return null;
    root=makeStoneCircleVisual().root;root.position.set(x,0,z);
  }else{
    const template=buildingBlueprints.get(type);
    if(!template)return null;
    const model=template.source.clone(true);
    const bounds=orcModelBounds(model,type),center=bounds.getCenter(new THREE.Vector3());
    const offset=new THREE.Group();
    offset.position.set(-center.x,-bounds.min.y,-center.z);offset.add(model);
    root=new THREE.Group();root.add(offset);
    root.scale.setScalar(3.9/template.footprint);root.position.set(x,0,z);
    if(type==='cauldron')architectureHeight=Math.max(1,
      (bounds.max.y-bounds.min.y)*root.scale.x);
  }
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root);
  if(bounds.isEmpty())return null;
  // The cauldron's animated skinned pot reports an oversized bind-pose box.
  // Reveal the actual architectural height, not the spurious animation bounds.
  const bottom=architectureHeight==null?bounds.min.y:0;
  const height=architectureHeight==null?Math.max(.01,bounds.max.y-bounds.min.y):
    Math.min(Math.max(1,bounds.max.y),architectureHeight*1.5);
  const plane=new THREE.Plane(new THREE.Vector3(0,-1,0),bottom);
  root.traverse(node=>{
    if(!node.isMesh&&!node.isPoints)return;
    const clipped=material=>{
      const copy=material.clone();copy.clippingPlanes=[plane];
      // Procedural circle effects own their material; imported and farm
      // materials are shared and must remain untouched.
      if(node.userData.stoneEffect)material.dispose();
      return copy;
    };
    node.material=Array.isArray(node.material)?node.material.map(clipped):clipped(node.material);
  });
  root.userData.constructionPreview=true;
  root.visible=buildFaction(type)===activeFaction||fogOfWar.exploredAt(x,z,activeFaction);
  scene.add(root);
  return {root,plane,bottom,height};
}
function updateConstructionPreview(job){
  if(job.preview)job.preview.plane.constant=job.preview.bottom+
    job.preview.height*Math.max(.025,Math.min(1,job.progress/BUILD_SECONDS));
}
function disposeConstructionPreview(job){
  const preview=job.preview;
  if(!preview)return;
  scene.remove(preview.root);
  preview.root.traverse(node=>{
    if(!node.isMesh&&!node.isPoints)return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    for(const material of materials)material.dispose();
    if(job.type==='wall')node.geometry.dispose();
    if(node.userData.stoneEffect)node.geometry.dispose();
  });
  job.preview=null;
}
function cancelConstruction(actor,refund=true){
  const job=actor.constructJob;
  if(!job)return false;
  disposeConstructionPreview(job);
  actor.constructJob=null;actor.route=null;actor.approachCache=null;
  const index=pendingBuilds.indexOf(job);
  if(index>=0)pendingBuilds.splice(index,1);
  if(refund){gold[actor.kind]+=job.cost;wood[actor.kind]+=job.woodCost;}
  return true;
}
function scheduleBuild(type,x,z,{byAI=false,axis=null}={}){
  const clan=buildFaction(type),cost=constructionCost(type),woodCost=constructionWood(type);
  if(type==='wall'){const point=wallPlacement(x,z,axis);x=point.x;z=point.z;axis=point.axis;}
  if(!running||paused||!cost||(type==='stone-circle'&&!circleUnlocked())||
    !canAffordConstruction(clan,type)||
    !validBuildPosition(x,z,type,axis))return false;
  const candidates=units.filter(u=>u.kind===clan&&roles.isWorker(u)&&!u.dead&&
    !u.constructJob&&(!byAI||(!u.repairJob&&!u.workerRetryTime)));
  const preferred=candidates.filter(u=>selected.has(u));
  const available=preferred.length?preferred:candidates;
  available.sort((a,b)=>Math.hypot(a.root.position.x-x,a.root.position.z-z)-
    Math.hypot(b.root.position.x-x,b.root.position.z-z));
  const worker=available[0];
  if(!worker)return false;
  const site={id:'construction-'+worker.id+'-'+nextUnitId,
    hitbox:buildShape(type,x,z,axis)};
  const job={type,x,z,axis,cost,woodCost,site,byAI,progress:0,
    preview:createConstructionPreview(type,x,z,axis)};
  pendingBuilds.push(job);gold[clan]-=cost;wood[clan]-=woodCost;
  cancelWoodJob(worker);cancelRepair(worker);
  cancelMineJob(worker);cancelFarmJob(worker);worker.treeJob=null;worker.berryJob=null;
  worker.constructJob=job;worker.destination=null;
  worker.workHitTimer=0;
  worker.attackOrder=null;worker.route=null;worker.approachCache=null;
  if(clan==='orc'&&byAI)acknowledgeOrcAiOrder([worker]);
  else if(!byAI)acknowledgePlayerOrder([worker]);
  buildMode=null;
  if(!byAI)showBanner('OUVRIER EN CONSTRUCTION');
  refreshHUD();return true;
}
function tickConstructWorker(actor,dt){
  const job=actor.constructJob;
  if(!job)return false;
  const isGarden=job.type==='garden';
  const enterSite=isGarden||job.type==='stone-circle';
  const distance=enterSite?
    Math.hypot(actor.root.position.x-job.x,actor.root.position.z-job.z):
    window.FightersFootprints.distanceTo(actor.root.position,job.site.hitbox);
  if(distance>(enterSite?.35:BUILDING_CONTACT)){
    const goal=enterSite?{x:job.x,z:job.z}:approachBuilding(actor,job.site);
    if(goal){
      const result=navigateActor(actor,goal,dt,'engage');
      if(result==='blocked'){markWorkBlocked(actor);cancelConstruction(actor);animation(actor,'Idle_Loop');return false;}
      if(result!=='moving')animation(actor,'Idle_Loop');
    }else{markWorkBlocked(actor);cancelConstruction(actor);animation(actor,'Idle_Loop');return false;}
    return true;
  }
  if(isGarden){
    faceDirection(actor,.6,.8);
    animation(actor,FARM_PLANT);
    job.soundTimer=(job.soundTimer||0)+dt;
    if(job.soundTimer>=1.0){
      job.soundTimer-=1.0;playEffect('garden',actor.root.position);
    }
  }else{
    faceBuildingCenter(actor,job.site);
    animation(actor,WORK_SWING);
    const swingSeconds=Math.max(.35,actor.clipCatalog.get('Sword_Attack')?.duration||1);
    actor.workHitTimer=(actor.workHitTimer||0)+dt;
    if(actor.workHitTimer>=swingSeconds*.4){
      actor.workHitTimer-=swingSeconds;
      playConstructionHit(actor);
    }
  }
  job.progress+=dt;
  updateConstructionPreview(job);
  if(job.progress>=BUILD_SECONDS){
    cancelConstruction(actor,false);
    const built=job.type==='witch-house'?buildWitchHouse(job.x,job.z,{prepaid:true}):
      job.type==='garden'?buildGarden(job.x,job.z,{prepaid:true}):
      job.type==='stone-circle'?buildStoneCircle(job.x,job.z,{prepaid:true}):
      job.type==='wall'?buildWall(job.x,job.z,{prepaid:true,byAI:job.byAI,axis:job.axis}):
      buildOrc(job.type,job.x,job.z,{prepaid:true,byAI:job.byAI});
    if(!built){gold[actor.kind]+=job.cost;wood[actor.kind]+=job.woodCost;}
    else if(job.byAI)showBanner('CONSTRUCTION TERMINÉE');
    refreshHUD();
  }
  return true;
}
function cancelRepair(actor){actor.repairJob=null;}
function orderRepair(actors,building,{byAI=false}={}){
  if(!running||paused)return false;
  const assigned=workerOrders.repair(actors,building,{byAI});
  if(assigned){
    if(!byAI){
      const box=building.hitbox;
      showOrderPing({x:(box.minX+box.maxX)/2,z:(box.minZ+box.maxZ)/2,y:.15},'move');
      acknowledgePlayerOrder(actors);
      showBanner('RÉPARATION EN COURS');
    }
    refreshHUD();
  }
  return assigned>0;
}
function tickRepairWorker(actor,dt){
  if(!actor.repairJob)return false;
  const building=actor.repairJob.buildingId===witchBuilding.id?witchBuilding:
    buildingInstances.get(actor.repairJob.buildingId);
  if(!repairRules.canRepair(actor,building)){
    cancelRepair(actor);animation(actor,'Idle_Loop');return false;
  }
  if(targetDistance(actor,building)>BUILDING_CONTACT){
    const goal=approachBuilding(actor,building);
    if(goal){
      const status=navigateActor(actor,goal,dt,'engage');
      if(status==='blocked'){markWorkBlocked(actor);cancelRepair(actor);animation(actor,'Idle_Loop');return false;}
      if(status!=='moving')animation(actor,'Idle_Loop');
    }else{markWorkBlocked(actor);cancelRepair(actor);animation(actor,'Idle_Loop');return false;}
    return true;
  }
  faceBuildingCenter(actor,building);
  animation(actor,WORK_SWING);
  actor.workHitTimer=(actor.workHitTimer||0)+dt;
  const swingSeconds=Math.max(.35,actor.clipCatalog.get('Sword_Attack')?.duration||1);
  if(actor.workHitTimer>=swingSeconds){
    actor.workHitTimer-=swingSeconds;playConstructionHit(actor);
  }
  repairRules.restore(building,dt);
  if(building.healthBar)updateHealthBar(building);
  if(building.health>=building.maxHealth){
    cancelRepair(actor);animation(actor,'Idle_Loop');
    showBanner('BÂTIMENT RÉPARÉ');refreshHUD();
  }
  return true;
}
const uiStats={commandRebuilds:0,feedbackCreated:0,feedbackRemoved:0,peakPings:0};
function setText(id,value){
  const el=$(id),display=String(value);
  if(el.textContent!==display)el.textContent=display;
}
function cancelTransientMode(){
  attackMode=false;ravenMoveMode=false;buildMode=null;rallyMode=false;constructionTab=false;refreshHUD();
}
function stopSelectedUnits(){
  attackMode=false;
  for(const unit of selected){
    cancelSoulJob(unit);
    cancelConstruction(unit);cancelWoodJob(unit);cancelRepair(unit);unit.treeJob=null;
    cancelMineJob(unit);cancelFarmJob(unit);unit.berryJob=null;unit.healJob=null;
    unit.orcFoodJob=null;
    unit.destination=null;unit.attackOrder=null;unit.route=null;
  }
  acknowledgePlayerOrder(selected);
  refreshHUD();
}
function refreshHUD(){
  setText('hud-gold',gold[activeFaction]);
  setText('hud-wood',wood[activeFaction]);
  setText('hud-food',Math.ceil(activeFaction==='witch'?farming.food:orcFood.food));
  setText('hud-food-label',activeFaction==='witch'?'🌾 VIVRES':'🍖 VIANDE');
  $('hud-food-chip').title=activeFaction==='witch'? 'Blé et baies · consommation des sorcières':
    'Lièvres et dépouilles de sorcières · les orcs mangent moins souvent';
  const factionMagic=activeFaction==='witch'?magic:orcMagic;
  setText('hud-magic',(Math.round(factionMagic*10)/10)+'/'+soulRules.MAX_MAGIC);
  $('hud-magic-fill').style.width=100*factionMagic/soulRules.MAX_MAGIC+'%';
  $('hud-magic-chip').title=activeFaction==='witch'?
    'Magie des sorcières · esprits siphonnés et 5 points toutes les 30 secondes':
    'Magie des orcs · récupère 5 points toutes les 30 secondes';
  $('hud-gold-chip').title='Or des '+(activeFaction==='witch'?'sorcières':'orcs');
  $('hud-wood-chip').title='Bois des '+(activeFaction==='witch'?'sorcières':'orcs');
  setText('unit-count',units.filter(u=>u.kind==='witch'&&!u.dead).length+' : '+
    units.filter(u=>u.kind==='orc'&&!u.dead).length);
  $('hud-units-chip').title='Sorcières : orcs · capacité orc : '+orcHousingCap()+
    ' (augmenter avec des huttes)';
  setText('faction-title',activeFaction==='witch'?'SORCIÈRES':'ORCS');
  const director=activeFaction==='witch'?orcDirector:witchDirector;
  setText('ai-status',director.enabled?(activeFaction==='witch'?'ORCS':'SORCIÈRES')+' · '+({
    develop:'Expansion',defend:'Défense',attack:'Assaut',recover:'Regroupement'
  }[director.mode]||'Stratégie'):'IA · En attente');

  const b=selectedBuilding,alive=[...selected].filter(u=>!u.dead),
    faction=b?.clanId==='witch'?'witch':'orc',
    title=$('command-title'),info=$('command-info'),health=$('command-health'),
    portrait=$('command-icon'),buttons=$('command-buttons'),queueUI=$('training-progress');
  const context=[activeFaction,b?.id||'',selectedRaven?.id||'',b?.level||0,alive.map(u=>u.id).join(','),
    constructionTab,constructionTab?buildingBlueprints.size:0,
    b?.queue.length||0,!!buildMode,attackMode,rallyMode,ravenMoveMode].join('|');

  if(context!==lastHudSignature){
    lastHudSignature=context;buttons.replaceChildren();health.replaceChildren();
    uiStats.commandRebuilds++;
    const add=(symbol,name,cost,action,disabled=false,tooltip='')=>{
      const element=document.createElement('button');
      element.type='button';element.disabled=!!disabled;
      const price=typeof cost==='object'?
        [cost.gold?cost.gold+'💰':'',cost.wood?cost.wood+'🪵':''].filter(Boolean).join(' '):
        cost?cost+'💰':'';
      const priceLabel=typeof cost==='object'&&cost.magic?cost.magic+'🔮':price;
      element.title=tooltip||name+(priceLabel?' · '+priceLabel:'');
      element.setAttribute('aria-label',element.title);
      for(const [className,text] of [['action-symbol',symbol],['action-name',name],
        ['action-cost',priceLabel]]){
        const span=document.createElement('span');span.className=className;span.textContent=text;
        element.appendChild(span);
      }
      element.onclick=event=>{event.stopPropagation();action();};
      buttons.appendChild(element);
    };
    if(constructionTab){
      portrait.textContent=constructionTab==='advanced'?'🏭':'🏗️';
      title.textContent=constructionTab==='advanced'?'Bâtiments avancés':'Bâtiments de base';
      info.textContent='Choisissez la structure à construire avec un ouvrier.';
      const types=activeFaction==='witch'?['witch-house','garden','stone-circle']:
        constructionTab==='advanced'?['cauldron','factory']:['hut','barrack','wall'];
      for(const type of types){
        const cost=constructionCost(type);
        add(({barrack:'🏰',hut:'🛖',wall:'🧱',cauldron:'⚗️',factory:'🏭','witch-house':'🏡',garden:'🌾','stone-circle':'🪨'})[type],
          type==='witch-house'?'Maison':type==='garden'?'Potager':
            type==='stone-circle'?'Cercle de roches':ORC_NAMES[type],
          {gold:cost,wood:constructionWood(type)},()=>beginBuild(type),
          !canAffordConstruction(activeFaction,type)||!builderAvailable(activeFaction)||
            (type==='stone-circle'&&(!standingStoneModel||!circleUnlocked()))||
            (activeFaction==='orc'&&type!=='wall'&&!buildingBlueprints.has(type)),
          'Confier '+(type==='witch-house'?'une maison':type==='garden'?'un potager':
            type==='stone-circle'?'un cercle de guérison':ORC_NAMES[type])+' à un ouvrier'+
            (type==='stone-circle'&&!circleUnlocked()?' · nécessite une maison niveau 2':''));
      }
      add('↩','Retour','',()=>{constructionTab=false;refreshHUD();});
    }else if(b){
      const names={'witch-house':'Maison des sorcières',garden:'Potager',
        'stone-circle':'Cercle de roches',...ORC_NAMES};
      const icons={'witch-house':'🏡',garden:'🌾','stone-circle':'🪨',barrack:'🏰',hut:'🛖',mine:'⛏️',
        cauldron:'⚗️',factory:'🏭',wall:'🧱'};
      portrait.textContent=icons[b.type]||'🏠';
      title.textContent=names[b.type]||'Bâtiment';
      const friendly=b.clanId===(activeFaction==='orc'?'orcs':'witch');
      info.textContent=b.type==='stone-circle'?
        'Sanctuaire : 11 PV/s par sorcière, pour 1 magie / 15 PV restaurés. Les blessées y reviennent au calme.':
        b.type==='garden'?'Cultures : trois stades, prêtes au troisième.':
        b.type==='mine'?
        'Gisement d’or neutre et indestructible · exploitable par les ouvriers des deux clans.':
        !friendly?'Bâtiment ennemi · sélectionnez vos unités pour l’attaquer.':b.clanId==='witch'?
        'Maison des sorcières : niveau 2 pour le cercle de roches (requis pour les Arcanistes); niveau 3 pour le dôme arcanique (100 magie).':
        b.type==='barrack'?'Caserne orc · forme les guerriers et les lanceurs-mages (chaudron requis).':
        b.type==='hut'?'Hutte orc · abrite '+orcFoodRules.HUT_CAPACITY[b.level]+
          ' orcs. Population totale : '+orcPopulationCommitted()+' / '+orcHousingCap()+'.':
        b.type==='cauldron'?'Chaudron orc · débloque les lanceurs-mages dans les casernes.':
        b.type==='wall'?'Mur de pierre infranchissable · les sections s’assemblent en angle.':
        'Bâtiment orc · améliorer la structure et définir un point de rassemblement.';
      if(b.type!=='mine'){
        const track=document.createElement('div');track.className='hp-track';
        const fill=document.createElement('div');fill.className='hp-fill';
        fill.style.width=100*b.health/b.maxHealth+'%';track.appendChild(fill);
        health.append(document.createTextNode('Niv. '+b.level+' · PV '+Math.ceil(b.health)+' / '+b.maxHealth),track);
      }
      if(friendly&&(b.type==='witch-house'||b.type==='barrack')){
        const clan=b.clanId==='witch'?'witch':'orc';
        for(const role of ROLE_IDS){
          const spec=roles.profile(clan,role);
          add(spec.icon,spec.name,spec.cost,()=>queueOrder(b,clan,role),
            gold[clan]<spec.cost||b.queue.length>=MAX_QUEUE||paused||
              (clan==='witch'&&role==='ranged'&&!arcanistUnlocked())||
              (clan==='orc'&&!canTrainOrcRole(role)),
            'Former '+spec.name+' · '+(role==='worker'?'minage et construction':
              role==='melee'?'combat rapproché':'attaque magique à distance')+
              (clan==='witch'&&role==='ranged'?' et siphonnage des âmes · cercle de roches requis':''));
        }
      }
      const cost=upgradeCost(b),pending=b.queue.some(item=>item.kind==='upgrade');
      if(friendly&&b.type!=='mine'&&b.type!=='garden'&&b.type!=='stone-circle'&&b.type!=='wall')add('⬆️','Améliorer',
        {gold:cost,wood:40},()=>issueUpgrade(b),
        cost===null||pending||gold[faction]<cost||wood[faction]<40||
          b.queue.length>=MAX_QUEUE||paused,
        cost===null?'Niveau maximal':pending?'Amélioration déjà dans la file':
        'Améliorer au niveau '+(b.level+1));
      if(friendly&&b.type==='witch-house'&&b.level>=3)
        add('🔵','Dôme arcanique',{magic:domeRules.COST},()=>castWitchDome(b),
          !domeRules.canCast(b,magic,{faction:activeFaction,running,paused,
            active:!!domeEffect}),
          'Pulvériser les orcs dans un rayon de '+domeRules.RADIUS+
            ' autour de cette maison · coûte 100 magie');
      if(friendly&&b.type==='hut'&&b.level>=3)
        add('🔥','Pluie de feu',{magic:fireRules.COST},()=>castFireRain(b),
          !fireRules.canCast(b,orcMagic,{faction:activeFaction,running,paused,
            active:!!fireEffect}),
          'Déchaîner le feu du ciel sur les sorcières dans un rayon de '+
            fireRules.RADIUS+' autour de cette hutte · coûte 100 magie');
      // Warcraft II buildings show their train/upgrade icons directly;
      // building construction belongs to the worker, never the barracks.
      if(friendly&&b.queue.length)
        add('✖','Annuler','',()=>cancelOrder(b,0),false,'Annuler la prochaine production');
    }else if(selectedRaven){
      portrait.textContent='🐦‍⬛';title.textContent='Corbeau familier';
      info.textContent='Reconnaissance aérienne · attire les orcs, mais reste intouchable.';
      health.textContent='En vol ou sur un arbre · vision limitée';
      add('🧭','Déplacer','',()=>{ravenMoveMode=true;refreshHUD();},paused,
        'Choisir une destination pour ce corbeau');
    }else if(alive.length){
      const single=alive.length===1?alive[0]:null;
      portrait.textContent=single?single.profile.icon:activeFaction==='witch'?'🧙':'👹';
      title.textContent=single?single.profile.name:alive.length+' unités '+(activeFaction==='witch'?'sorcières':'orcs');
      info.textContent=single?.role==='worker'?
        (single.kind==='witch'?'Ouvrière : mine, construit, récolte et répare les bâtiments.':
          'Ouvrier : mine, construit et répare les bâtiments. Aucun combat.'):
        single?.role==='ranged'?'Combattant à distance : attaque de loin, plus fragile.':
        'Déplacement : touchez le terrain. Les combattants engagent les ennemis proches.';
      const average=Math.round(alive.reduce((sum,u)=>sum+u.health/u.maxHealth,0)/alive.length*100);
      const track=document.createElement('div');track.className='hp-track';
      const fill=document.createElement('div');fill.className='hp-fill';
      fill.style.width=average+'%';track.appendChild(fill);
      health.append(document.createTextNode('Santé moyenne : '+average+' %'),track);
      if(alive.some(roles.isFighter))
        add('⚔️','Attaquer','',()=>{attackMode=true;refreshHUD();});
      if(alive.some(roles.isWorker)){
        if(activeFaction==='witch')add('🌾','Récolter','',()=>{
          const gardens=[...buildingInstances.values()].filter(b=>b.type==='garden'&&!b.destroyed);
          const workers=alive.filter(roles.isWorker);
          gardens.sort((a,b)=>Math.min(...workers.map(w=>targetDistance(w,a)))-
            Math.min(...workers.map(w=>targetDistance(w,b))));
          if(!orderHarvest(workers,gardens[0]))showBanner('AUCUN POTAGER DISPONIBLE');
        });
        add('⛏️','Miner','',()=>{
          const mines=[...buildingInstances.values()].filter(b=>b.type==='mine'&&
            b.clanId==='neutral'&&!b.destroyed);
          const workers=alive.filter(roles.isWorker);
          mines.sort((a,b)=>Math.min(...workers.map(w=>targetDistance(w,a)))-
            Math.min(...workers.map(w=>targetDistance(w,b))));
          if(!orderMine(workers,mines[0]))showBanner('AUCUNE MINE DISPONIBLE');
        });
        add('🔨','Réparer','',()=>{
          const workers=alive.filter(roles.isWorker);
          const damaged=liveBuildings().filter(b=>workers.some(w=>repairRules.canRepair(w,b)));
          damaged.sort((a,b)=>Math.min(...workers.map(w=>targetDistance(w,a)))-
            Math.min(...workers.map(w=>targetDistance(w,b))));
          if(!orderRepair(workers,damaged[0]))showBanner('AUCUN BÂTIMENT À RÉPARER');
        },!liveBuildings().some(b=>alive.some(w=>repairRules.canRepair(w,b))),
        'Envoyer les ouvriers vers le bâtiment allié endommagé le plus proche');
        add('🏗️',activeFaction==='witch'?'Construire':'Bât. base','',()=>{
          constructionTab='basic';refreshHUD();
        });
        if(activeFaction==='orc')add('🏭','Bât. avancé','',()=>{
          constructionTab='advanced';refreshHUD();
        });
      }
      add('✋','Arrêter','',stopSelectedUnits);
    }else{
      // Original Warcraft II: the command pad is empty without a selection.
      portrait.textContent='⌖';title.textContent='Aucune sélection';
      info.textContent='Sélectionnez une unité ou un bâtiment sur la carte.';
    }
    if(buildMode||attackMode||rallyMode||ravenMoveMode)
      add('↩','Annuler','',cancelTransientMode,false,'Annuler l’ordre en cours');
    $('selection-summary').textContent=buildMode?'Poser '+(ORC_NAMES[buildMode]||
      (buildMode==='garden'?'potager':buildMode==='stone-circle'?'cercle de roches':'maison')):
      rallyMode?'Choisir un point de rassemblement':selectedRaven?'Corbeau · éclaireur aérien':b?
      b.type==='mine'?'Gisement d’or · neutre':b.type==='garden'?'Potager · nourriture':
      b.type==='stone-circle'?'Cercle de roches · guérison':
      (b.type==='witch-house'?'Maison des sorcières':ORC_NAMES[b.type])+' · niveau '+b.level:
      alive.length+' unité(s) sélectionnée(s)';
  }
  // Mutable health, gold and AI income never rebuild the command DOM.
  // Reusing the exact buttons prevents flicker, focus loss, GC pressure and
  // the ResizeObserver/render-layout feedback that slowed long battles.
  if(b?.type==='garden'){
    const plots=farming.garden(b.id)?.plots||[];
    const ready=plots.filter(p=>p.stage===3).length;
    info.textContent='Cultures prêtes : '+ready+' / '+plots.length+' · stade 3 = récoltable.';
  }
  if(b&&b.type!=='mine'){
    const hp=health.firstChild,fill=health.querySelector('.hp-fill');
    const text='Niv. '+b.level+' · PV '+Math.ceil(b.health)+' / '+b.maxHealth+
      (b.queue.length?' · ⏳ '+Math.floor(100*clamp(b.progress/b.queue[0].duration,0,1))+'%':'');
    if(hp?.nodeType===Node.TEXT_NODE&&hp.textContent!==text)hp.textContent=text;
    if(fill)fill.style.width=(100*b.health/b.maxHealth)+'%';
  }else if(alive.length){
    const average=Math.round(alive.reduce((sum,u)=>sum+u.health/u.maxHealth,0)/alive.length*100);
    const hp=health.firstChild,fill=health.querySelector('.hp-fill');
    const text='Santé moyenne : '+average+' %';
    if(hp?.nodeType===Node.TEXT_NODE&&hp.textContent!==text)hp.textContent=text;
    if(fill)fill.style.width=average+'%';
  }
  for(const button of buttons.children){
    const action=button.querySelector('.action-name')?.textContent;
    let disabled=paused;
    const role=b&&['witch','orcs'].includes(b.clanId)?
      ROLE_IDS.find(id=>roles.profile(faction,id).name===action):null;
    if(role)disabled||=gold[faction]<roles.profile(faction,role).cost||b?.queue.length>=MAX_QUEUE||
      (faction==='witch'&&role==='ranged'&&!arcanistUnlocked())||
      (faction==='orc'&&!canTrainOrcRole(role));
    else if(action==='Améliorer')disabled||=upgradeCost(b)===null||
      b?.queue.some(item=>item.kind==='upgrade')||
      gold[faction]<upgradeCost(b)||wood[faction]<40||b?.queue.length>=MAX_QUEUE;
    else if(action==='Dôme arcanique')disabled||=!domeRules.canCast(b,magic,
      {faction:activeFaction,running,paused,active:!!domeEffect});
    else if(action==='Pluie de feu')disabled||=!fireRules.canCast(b,orcMagic,
      {faction:activeFaction,running,paused,active:!!fireEffect});
    else if(action==='Annuler prochain')disabled=b?.queue.length===0;
    else if(constructionTab&&(['Maison','Potager','Cercle de roches'].includes(action)||Object.values(ORC_NAMES).includes(action))){
      const type=action==='Maison'?'witch-house':action==='Potager'?'garden':
        action==='Cercle de roches'?'stone-circle':
        Object.keys(ORC_NAMES).find(key=>ORC_NAMES[key]===action);
      disabled||=!canAffordConstruction(activeFaction,type)||!builderAvailable(activeFaction)||
        (type==='stone-circle'&&(!standingStoneModel||!circleUnlocked()))||
        (activeFaction==='orc'&&type!=='wall'&&!buildingBlueprints.has(type));
    }else if(action==='Construire')disabled||=!builderAvailable(activeFaction);
    else if(action==='Réparer')disabled||=!liveBuildings().some(b=>
      alive.some(w=>repairRules.canRepair(w,b)));
    else if(action==='Caserne')disabled||=![...buildingInstances.values()].some(v=>v.type==='barrack'&&!v.destroyed);
    button.disabled=!!disabled;
  }
  const prompt=$('order-prompt');
  const hint=ravenMoveMode?'🐦‍⬛ Touchez la destination du corbeau.':
    attackMode?'⚔ Touchez une unité ou un bâtiment ennemi.':
    buildMode?'🏗 Touchez une zone libre : votre ouvrier y construira le bâtiment.':
    rallyMode?'🚩 Touchez le sol pour fixer le rassemblement.':
    constructionTab?'Choisissez le bâtiment à construire.':'';
  if(prompt.hidden===!!hint)prompt.hidden=!hint;
  if(hint&&prompt.textContent!==hint)prompt.textContent=hint;
  const orderSignature=b?b.id+'|'+b.queue.map(o=>o.kind+':'+o.role+':'+o.duration).join(','):'none';
  if(queueUI.dataset.signature!==orderSignature){
    queueUI.dataset.signature=orderSignature;queueUI.replaceChildren();
    if(b?.queue.length){
      const heading=document.createElement('div');
      heading.className='production-heading';queueUI.appendChild(heading);
      const meter=document.createElement('div');meter.className='production-meter';
      const fill=document.createElement('div');fill.className='production-meter-fill';
      meter.appendChild(fill);queueUI.appendChild(meter);
      const jobs=document.createElement('div');jobs.className='production-jobs';
      b.queue.forEach((job,i)=>{
        const btn=document.createElement('button');
        btn.title='Annuler cette commande et récupérer '+job.cost+' pièces d’or';
        btn.textContent=(job.kind==='upgrade'?'⬆️':roles.profile(job.kind,job.role||'melee').icon)+
          (i===0?' ⏳':'')+' ×';
        btn.onclick=event=>{event.stopPropagation();cancelOrder(b,i);};
        jobs.appendChild(btn);
      });
      queueUI.appendChild(jobs);
    }else{
      queueUI.textContent=b?.type==='mine'?'Ressource neutre · aucune production':
         b?.type==='garden'?'Potager · attendre la croissance et récolter':
         b?.type==='stone-circle'?'Sanctuaire · soigne les sorcières au centre':
        b?'File de production vide · max. '+MAX_QUEUE+' commandes':
        'Sélectionnez un bâtiment pour ses commandes';
    }
  }
  $('command-panel').classList.toggle('has-queue',!!b?.queue.length);
  if(b?.queue.length){
    const order=b.queue[0],progress=clamp(b.progress/order.duration,0,1);
    const header=queueUI.querySelector('.production-heading');
    const fill=queueUI.querySelector('.production-meter-fill');
    if(header)header.textContent='Production : '+(order.kind==='upgrade'?'amélioration':
      roles.profile(order.kind,order.role||'melee').name.toLowerCase())+' · '+Math.floor(progress*100)+' % · '+b.queue.length+' en file';
    if(fill)fill.style.width=progress*100+'%';
  }
}
function changeFaction(faction){
  if(faction!=='witch'&&faction!=='orc')return;
  activeFaction=faction;buildMode=null;rallyMode=false;constructionTab=false;
  attackMode=false;ravenMoveMode=false;
  updateVision();clearSelection();refreshHUD();
}
function chooseFaction(faction){
  if(faction!=='witch'&&faction!=='orc')return;
  chosenFaction=faction;
  $('choose-witch').setAttribute('aria-pressed',String(faction==='witch'));
  $('choose-orc').setAttribute('aria-pressed',String(faction==='orc'));
  refreshStartButton();
}
function refreshStartButton(){
  if(running||!ready)return;
  const waitingForOrcs=chosenFaction==='orc'&&!orcVillage;
  $('start').disabled=waitingForOrcs;
  $('start').textContent=waitingForOrcs?'Chargement du village ork…':'▶ COMMENCER';
  if(!$('overlay').hidden&&$('overlay-title').textContent==='Orks & Sorcières')
    $('overlay-desc').textContent=waitingForOrcs?
      (orcVillageLoadError?'Le village ork n’a pas pu charger. Choisissez les sorcières ou rechargez la page.':
      'Le village ork se prépare. Vous pourrez jouer dès que ses bâtiments seront chargés.'):
      'Vous incarnez les '+(chosenFaction==='witch'?'sorcières':'orks')+
      '. L’autre clan gère ses troupes, son économie et sa stratégie de manière autonome.';
}
function showBanner(message){
  // Short, compositor-driven toast. A JS timeout can be delayed under heavy
  // WebGL rendering and leave the notification stranded on-screen.
  const banner=$('banner');
  banner.textContent=message;
  banner.style.animation='none';
  void banner.offsetWidth; // restart the short animation for a fresh message
  banner.style.animation='tiny-rts-toast .6s linear forwards';
}
function startSession(){
  if(!ready||(chosenFaction==='orc'&&!orcVillage))return;
  hairStyleDeck.length=0;hairColorDeck.length=0;
  clearOrderPings();clearBolts();clearWitchDome();clearFireRain();lastOrcAiVoice=-Infinity;
  for(const effect of soulEffects)disposeSoulEffect(effect);
  soulEffects.length=0;magic=0;orcMagic=0;spellDecisionElapsed=0;soulAssignmentElapsed=0;
  for(const actor of units)releaseActor(actor);
  units.length=0;selected.clear();selectedBuilding=null;selectedRaven=null;nextUnitId=1;
  for(const job of pendingBuilds)disposeConstructionPreview(job);
  pendingBuilds.length=0;
  // Match reset removes constructed buildings while retaining the initial village.
  for(const [id,building] of buildingInstances){
    if(building.initial)continue;
    releaseConstructedBuilding(building);
    buildingInstances.delete(id);
  }
  for(const building of [witchBuilding,...buildingInstances.values()]){
    if(building.destroyed){building.destroyed=false;
      if(building.clanId==='witch')scene.add(building.root);
      else (orcVillage||scene).add(building.root);
    }
    if(building.healthBar)building.healthBar.root.visible=false;
    if(building.rallyMarker)removeRallyMarker(building);
    if(building.clanId==='orcs'&&building.level!==1){
      building.level=1;
      useOrcLevelModel(building,1).catch(err=>console.warn('Reset model:',err));
    }
  }
  resize();
  gold={witch:2000,orc:900};wood={...INITIAL_WOOD};
  farming.reset();farmSerial=0;farmAssignmentElapsed=0;famineAlerted=false;
  orcFood.reset();orcForageElapsed=0;orcFamineAlerted=false;
  stoneCircleSerial=0;wallSerial=0;healingAssignmentElapsed=0;
  wildBerries.reset();berryAssignmentElapsed=0;syncBerryVisuals();
  buildMode=null;orcSpawned=false;
  fogOfWar.reset();knownEnemyBuildings.witch.clear();
  knownEnemyBuildings.orc.clear();fogElapsed=0;fogStarted=true;
  orcDirector.reset();witchDirector.reset();orcIncomeFraction=0;
  strategyAccumulator=0;witchStrategyAccumulator=0;attackMode=false;
  orcDirector.enabled=!qaMode&&chosenFaction==='witch';
  witchDirector.enabled=!qaMode&&chosenFaction==='orc';
  ravenMoveMode=false;qaPassiveKind=null;
  completedMiningCycles=0;totalMinedGold=0;
  rallyMode=false;constructionTab=false;lastHudSignature='';
  for(const b of liveBuildings()){b.queue=[];b.progress=0;b.level=1;
    b.maxHealth=b.clanId==='witch'?
      (b.type==='garden'?GARDEN_HEALTH:b.type==='stone-circle'?STONE_CIRCLE_HEALTH:WITCH_HOUSE_HEALTH):
      BUILDING_TYPES[b.type].levels[1].maxHealth;
    b.health=b.maxHealth;}
  // Start next to the selected clan's headquarters, never in empty terrain.
  activeFaction=chosenFaction;paused=false;running=true;
  cameraFollow=chosenFaction==='witch'?{x:-18,z:-14}:{x:18,z:18};
  positionCamera();
  resetForest();
  ravenFlock.reset();
  void loadRavens();
  updateNavObstacles();
  hareField.reset();
  void loadHares();
  loadForest();
  if(!berryBatches.length)rebuildBerryVisuals();
  void beginCropLoad();
  spawnUnit('witch',-18,-13,0,'melee');spawnUnit('witch',-16.5,-15,1,'worker');spawnUnit('witch',-19,-16,2,'ranged');
  spawnOrcDefenders();updateVision();
  selectBuilding(chosenFaction==='witch'?witchBuilding:
    [...buildingInstances.values()].find(b=>b.type==='barrack'&&b.clanId==='orcs')||null);
  $('pause').disabled=false;$('pause').textContent='Ⅱ';$('overlay').hidden=true;
  showBanner('DÉBUT DE LA PARTIE');refreshHUD();
}
function unitFaction(actor){return actor.kind==='witch'?'witch':'orcs';}
function targetFaction(target){return target.clanId||unitFaction(target);}
function isBuilding(target){return !!target?.hitbox;}
function enemyOf(actor,target){
  return target&&!target.dead&&!target.destroyed&&targetFaction(target)!=='neutral'&&
    unitFaction(actor)!==targetFaction(target);
}
function targetDistance(actor,target){
  const p=actor.root.position;
  if(!isBuilding(target))return Math.hypot(target.root.position.x-p.x,target.root.position.z-p.z);
  return window.FightersFootprints.distanceTo(p,target.hitbox);
}
function nextRaidBuilding(actor){
  return window.FightersRaiding.nextBuilding(actor,liveBuildings(),
    knownEnemyBuildings[actor.kind],enemyOf,targetDistance);
}
function nearestHostile(actor,maxDistance=Infinity){
  let nearest=null,distance=maxDistance,priority=Infinity;
  const candidates=[...units,...liveBuildings()];
  for(const target of candidates){
    if(!enemyOf(actor,target))continue;
    if(actor.unreachableTime>0&&actor.unreachableTarget===target)continue;
    // Player-controlled troops must never automatically swing at a hidden
    // building. Enemy AI still reasons with its own faction's fog/strategy.
    if(isBuilding(target)&&actor.kind===activeFaction&&!target.root?.visible)continue;
    const d=targetDistance(actor,target);
    const typePriority=isBuilding(target)?1:0;
    if(d<distance-.5||(Math.abs(d-distance)<=.5&&typePriority<priority)){
      nearest=target;distance=d;priority=typePriority;
    }
  }
  return nearest?{target:nearest,distance}:null;
}
const BUILDING_CONTACT=.78;
function faceBuildingCenter(actor,building){
  const b=building.hitbox;
  faceDirection(actor,(b.minX+b.maxX)/2-actor.root.position.x,
    (b.minZ+b.maxZ)/2-actor.root.position.z);
}
function approachBuilding(actor,building){
  const b=building.hitbox,p=actor.root.position,pad=UNIT_RADIUS+.14;
  const cache=actor.approachCache;
  // Failed perimeter searches must also be cached. Otherwise an unreachable
  // HQ triggers a full A* search for every candidate on every game tick.
  if(cache?.id===building.id&&cache.version===navigatorRTS.version&&
    actor.approachAge<(cache.point?2.5:.75)&&
    (!cache.point||navigatorRTS.pointClear(cache.point)))
    return cache.point;
  const from={x:p.x,z:p.z};
  // Perimeter sites belong to the building's shared cache. Never sort or
  // unshift into that array: repeated attacks used to grow it without bound.
  const candidates=[...buildingPerimeterSites(building,pad)];
  // Find the closest point on the *actual polygon* and project outward.
  const closest=window.FightersFootprints.closestBoundary(from,b);
  if(closest.closest){
    const q=closest.closest,dx=p.x-q.x,dz=p.z-q.z;
    const length=Math.hypot(dx,dz);
    if(length>.01){
      const point={x:q.x+pad*dx/length,z:q.z+pad*dz/length};
      if(navigatorRTS.pointClear(point))candidates.unshift(point);
    }
  }
  const coworkers=units.filter(other=>other!==actor&&!other.dead&&
    (other.attackOrder===building||other.attack?.target===building||
      other.mineJob?.mineId===building.id));
  candidates.sort((a,b)=>{
    const score=goal=>{
      let cost=Math.hypot(goal.x-p.x,goal.z-p.z);
      for(const other of coworkers){
        const site=other.approachCache?.id===building.id&&other.approachCache.point?
          other.approachCache.point:other.root.position;
        const gap=Math.hypot(goal.x-site.x,goal.z-site.z);
        if(gap<1.4)cost+=(1.4-gap)*4;
      }
      return cost;
    };
    return score(a)-score(b);
  });
  for(const candidate of candidates){
    if(navigatorRTS.segmentClear(from,candidate)||
      navigatorRTS.plan(from,candidate)){
      actor.approachCache={id:building.id,point:candidate,
        version:navigatorRTS.version};
      actor.approachAge=0;return candidate;
    }
  }
  actor.approachCache={id:building.id,point:null,version:navigatorRTS.version};
  actor.approachAge=0;
  return null;
}
function orderAttack(actors,target){
  if(!target||target.destroyed||target.dead)return false;
  const issued=unitOrders.attack(actors,target);
  if(issued){attackMode=false;pingAttackTarget(target);
    acknowledgePlayerOrder(actors.filter(actor=>actor.attackOrder===target),'attack');
    refreshHUD();}
  return issued>0;
}
function removeRallyMarker(b){
  if(!b.rallyMarker)return;
  scene.remove(b.rallyMarker);b.rallyMarker.geometry.dispose();
  b.rallyMarker.material.dispose();b.rallyMarker=null;
}
function releaseActor(actor){
  cancelSoulJob(actor);
  cancelRepair(actor);
  cancelMineJob(actor);
  if(actor.dead)for(const mage of units)if(mage.soulJob===actor)cancelSoulJob(mage);
  cancelConstruction(actor);cancelWoodJob(actor);cancelFarmJob(actor);
  selected.delete(actor);
  // Phrase history belongs to the departing witch, not to the match.
  // Keep the remaining characters' voice identities and rotations intact.
  if(actor.kind==='witch')witchSound.forgetUnit(actor.id);
  actor.mixer.stopAllAction();actor.mixer.uncacheRoot(actor.visual);
  // Every SkeletonUtils.clone owns one or more GPU bone textures. Removing
  // the actor from the scene does NOT release these WebGL allocations.
  // Dispose only its unique skeletons; shared body/outfit geometry, textures
  // and materials must remain available to every other unit.
  const skeletons=new Set();
  actor.visual.traverse(node=>{
    if(node.isSkinnedMesh&&node.skeleton)skeletons.add(node.skeleton);
  });
  for(const skeleton of skeletons)skeleton.dispose();
  scene.remove(actor.root);
  // Selection geometry and material belong to the shared per-clan cache.
}
function buildingMixerAttached(mixer,building){
  let node=mixer.getRoot();
  while(node){if(node===building.root)return true;node=node.parent;}
  return false;
}
function releaseConstructedBuilding(building){
  if(building.initial)return;
  for(let i=orcAnimationMixers.length-1;i>=0;i--){
    if(!buildingMixerAttached(orcAnimationMixers[i],building))continue;
    orcAnimationMixers[i].stopAllAction();orcAnimationMixers.splice(i,1);
  }
  building.root.parent?.remove(building.root);
  if(building.type==='wall')building.root.traverse(node=>{
    if(node.isInstancedMesh)node.geometry.dispose();
  });
  if(building.magic){
    for(const mesh of [building.magic.core,building.magic.pulse,
      building.magic.glyphs,building.magic.sparkles]){
      mesh.geometry.dispose();mesh.material.dispose();
    }
  }
  if(building.healthBar){
    const bar=building.healthBar.root;
    scene.remove(bar);
    bar.traverse(node=>{
      if(!node.isMesh)return;
      node.geometry?.dispose();
      const materials=Array.isArray(node.material)?node.material:[node.material];
      for(const material of materials)material?.dispose();
    });
  }
  removeRallyMarker(building);
}
function isSceneDescendant(node){
  for(let n=node;n;n=n.parent)if(n===scene)return true;
  return false;
}
function destroyBuilding(building){
  if(building.type==='mine'||building.clanId==='neutral'||building.destroyed)return;
  building.destroyed=true;building.health=0;building.queue.length=0;
  if(domeEffect?.buildingId===building.id)clearWitchDome();
  building.progress=0;
  building.root.parent?.remove(building.root);
  if(building.healthBar)building.healthBar.root.visible=false;
  removeRallyMarker(building);
  if(selectedBuilding===building){selectedBuilding=null;drawBuildingSelection();}
  // The next discovered enemy building will replace this one on the next
  // combat tick, once the destroyed building has left navigation obstacles.
  for(const actor of units){
    if(actor.attackOrder===building)actor.attackOrder=null;
    if(actor.attack?.target===building)actor.attack=null;
  }
  for(const actor of units){
    if(actor.mineJob?.mineId===building.id)cancelMineJob(actor);
    if(actor.farmJob?.gardenId===building.id)cancelFarmJob(actor);
    if(actor.healJob?.id===building.id)actor.healJob=null;
    if(actor.repairJob?.buildingId===building.id)cancelRepair(actor);
  }
  if(building.type==='garden')farming.removeGarden(building.id);
  if((building.clanId==='orcs'||building.type==='garden'||building.type==='stone-circle')&&!building.initial){
    releaseConstructedBuilding(building);
    buildingInstances.delete(building.id);
  }
  if(building.type==='wall')syncWallJoints();
  updateNavObstacles();lastHudSignature='';refreshHUD();
  if(building===witchBuilding)endBattle(false);
  else if(building.clanId==='orcs'&&![...buildingInstances.values()].some(
    b=>!b.destroyed&&b.clanId==='orcs'&&b.type!=='wall'))endBattle(true);
}
function alertNearbyDefenders(victim,attacker){
  if(!attacker||attacker.dead||victim.dead||!enemyOf(attacker,victim))return;
  const kind=victim.kind,point=victim.root.position;
  // Enemy counterattacks temporarily supersede a raid's building target.
  // Nearby squadmates help, but nobody abandons the enemy village for home.
  if(victim.raiding&&roles.isFighter(victim)){
    for(const ally of units){
      if(ally.kind!==kind||ally.dead||!roles.isFighter(ally)||!ally.raiding||
        Math.hypot(ally.root.position.x-point.x,
          ally.root.position.z-point.z)>8)continue;
      window.FightersRaiding.attacked(ally,attacker,enemyOf);
    }
  }
  const aiControlled=kind==='orc'?orcDirector.enabled:witchDirector.enabled;
  const guards=units.filter(u=>u.kind===kind&&!u.dead&&roles.isFighter(u)&&
    !u.raiding&&
    Math.hypot(u.root.position.x-point.x,u.root.position.z-point.z)<=18&&
    (aiControlled||(!u.destination&&!u.attackOrder)));
  for(const guard of guards){
    if(guard.attackOrder===attacker&&guard.defenseAnchor)continue;
    const p=guard.root.position;
    guard.defenseAnchor={x:point.x,z:point.z,radius:13,
      returnPoint:{x:p.x,z:p.z}};
    guard.defenseTime=Math.max(guard.defenseTime,18);
    cancelSoulJob(guard);cancelOrcFoodJob(guard);
    guard.ravenDistraction=null;guard.healJob=null;
    guard.scouting=false;guard.attackOrder=attacker;
    guard.destination=null;guard.route=null;guard.routeAge=0;guard.navWatch=null;
    guard.approachCache=null;
  }
}
const VILLAGE_DEFENSE_LEASH=18;
function villageCenter(building){
  return {x:(building.hitbox.minX+building.hitbox.maxX)/2,
    z:(building.hitbox.minZ+building.hitbox.maxZ)/2};
}
function defenseTargetPosition(target){
  return isBuilding(target)?villageCenter(target):target.root.position;
}
function localDefensePost(actor,threat){
  let nearby=null,distance=12;
  for(const building of liveBuildings()){
    if(building.clanId!==unitFaction(actor))continue;
    const d=window.FightersFootprints.distanceTo(threat,building.hitbox);
    if(d<distance){nearby=building;distance=d;}
  }
  const origin=nearby?villageCenter(nearby):{x:threat.x,z:threat.z};
  return {...origin,buildingId:nearby?.id||null,
    radius:nearby?VILLAGE_DEFENSE_LEASH:13,
    returnPoint:{x:actor.root.position.x,z:actor.root.position.z}};
}
function returnFromDefense(actor){
  const anchor=actor.defenseAnchor;
  if(!anchor)return;
  actor.attackOrder=null;actor.route=null;actor.navWatch=null;
  actor.approachCache=null;
  actor.destination=anchor.returnPoint||{x:actor.root.position.x,z:actor.root.position.z};
  actor.defenseAnchor=null;
}
function updateVillageDefense(actor){
  const anchor=actor.defenseAnchor;
  if(!anchor)return;
  const target=actor.attackOrder;
  const position=target&&enemyOf(actor,target)?defenseTargetPosition(target):null;
  if(position&&Math.hypot(position.x-anchor.x,position.z-anchor.z)<=anchor.radius)return;
  if(position){
    actor.unreachableTarget=target;
    actor.unreachableTime=Math.max(actor.unreachableTime,5);
  }
  // A fleeing raider must not drag the entire garrison across the map.
  // If another visible raider remains inside the village, defend that one.
  const next=units.filter(other=>enemyOf(actor,other)&&
    (other!==actor.unreachableTarget||actor.unreachableTime<=0)&&
    Math.hypot(other.root.position.x-anchor.x,
      other.root.position.z-anchor.z)<=anchor.radius&&
    fogOfWar.visibleAt(other.root.position.x,other.root.position.z,actor.kind))
    .sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b))[0];
  if(next){
    actor.attackOrder=next;actor.destination=null;actor.route=null;
    actor.navWatch=null;return;
  }
  returnFromDefense(actor);
}
// A building hit is a village-wide alarm, not a local vision check: guards
// can be on patrol or raiding far from home when their base needs defending.
function alertVillageUnderAttack(building,attacker){
  if(!attacker||attacker.dead||building.health<=0||
    !enemyOf(attacker,building))return;
  const clan=building.clanId==='orcs'?'orc':'witch';
  const aiControlled=clan==='orc'?orcDirector.enabled:witchDirector.enabled;
  const center=villageCenter(building);
  const guards=units.filter(u=>u.kind===clan&&!u.dead&&roles.isFighter(u)&&
    !u.raiding&&
    // Never overwrite an explicit player move/attack order. Idle player
    // defenders still respond, even without the autonomous clan director.
    (aiControlled||(!u.destination&&(!u.attackOrder||u.defenseAnchor))));
  guards.sort((a,b)=>targetDistance(a,building)-targetDistance(b,building));
  const headquarters=building.type==='barrack'||building.type==='witch-house';
  for(const guard of guards.slice(0,headquarters?8:6)){
    guard.defenseTime=45;
    // A pre-existing defense for this exact building keeps its original post.
    // A new building alarm may legitimately relocate that defensive post.
    if(guard.attackOrder===attacker&&guard.defenseAnchor?.buildingId===building.id)continue;
    const p=guard.root.position;
    const local=Math.hypot(p.x-center.x,p.z-center.z)<VILLAGE_DEFENSE_LEASH-4;
    const previous=guard.defenseAnchor?.buildingId===building.id?guard.defenseAnchor:null;
    const approach={x:center.x+Math.cos(guard.id*2.399963)*4,
      z:center.z+Math.sin(guard.id*2.399963)*4};
    guard.defenseAnchor={...center,buildingId:building.id,radius:VILLAGE_DEFENSE_LEASH,
      returnPoint:previous?.returnPoint||(local?{x:p.x,z:p.z}:
        (navigatorRTS.findSafeGoal(approach)||{x:p.x,z:p.z}))};
    cancelSoulJob(guard);cancelOrcFoodJob(guard);
    guard.ravenDistraction=null;guard.healJob=null;
    guard.scouting=false;guard.attackOrder=attacker;
    guard.destination=null;guard.route=null;guard.routeAge=0;guard.navWatch=null;
    guard.approachCache=null;
  }
  // A serious attack interrupts ordinary mining/farming so workers can save
  // threatened buildings. Repairs finish normally once the building is safe.
  const ratio=building.health/building.maxHealth;
  if(ratio>.72)return;
  const needed=ratio<.4?2:1;
  const repairing=units.filter(u=>u.kind===clan&&!u.dead&&
    u.repairJob?.buildingId===building.id).length;
  if(repairing>=needed)return;
  const workers=units.filter(u=>u.kind===clan&&!u.dead&&roles.isWorker(u)&&
    !u.repairJob&&!u.workerRetryTime&&(ratio<.3||!u.constructJob));
  workers.sort((a,b)=>Number(!!a.constructJob)-Number(!!b.constructJob)||
    targetDistance(a,building)-targetDistance(b,building));
  for(const worker of workers.slice(0,needed-repairing))
    orderRepair([worker],building,{byAI:true});
}
function damageBuilding(building,amount,attacker){
  if(building.type==='mine'||building.clanId==='neutral'||building.destroyed)return;
  building.health=Math.max(0,building.health-amount);
  alertVillageUnderAttack(building,attacker);
  if(building.healthBar){
    building.healthBar.fill.material.color.setHex(0x72cb6a);
    updateHealthBar(building);
  }
  if(building.health===0){showBanner('BÂTIMENT DÉTRUIT');destroyBuilding(building);}
  else if(selectedBuilding===building)refreshHUD();
}
function endBattle(victory){
  running=false;
  // QA can temporarily inspect the opposing faction without changing who
  // the human actually selected at the title screen.
  const playerWon=victory===(chosenFaction==='witch');
  $('overlay-title').textContent=playerWon?'VICTOIRE':'DÉFAITE';
  $('overlay-desc').textContent=victory?'Le village ork a été détruit.':
    'La maison principale des sorcières a été détruite.';
  $('start').textContent='Nouvelle partie';$('start').disabled=false;
  $('overlay').hidden=false;$('pause').disabled=true;
}
function dealDamage(target,amount,attacker){
  if(isBuilding(target)){damageBuilding(target,amount,attacker);return;}
  if(target.dead)return;
  alertNearbyDefenders(target,attacker);
  target.health=Math.max(0,target.health-amount);target.stun=.24;
  if(!target.health){
    cancelSoulJob(target);
    cancelConstruction(target);cancelWoodJob(target);cancelFarmJob(target);
    if(target.kind==='orc')playOrcVoice('loud',target.root.position);
    else if(target.kind==='witch')playWitchVoice('destruction',target.root.position);
    target.dead=true;target.deadTime=soulRules.CORPSE_SECONDS;
    target.soulClaimed=false;target.soulReservedBy=null;
    target.destination=null;target.attackOrder=null;
    selected.delete(target);target.selectionRing.visible=false;
    animation(target,'Death01',true);refreshHUD();
    // The killer can visibly feast on the fallen witch after its finishing
    // attack. Nearby living enemies still interrupt this opportunistic meal.
    if(target.kind==='witch'&&attacker?.kind==='orc'&&!attacker.dead&&
      !attacker.orcFoodJob){
      attacker.orcFoodJob={kind:'corpse',id:target.id,progress:0};
      attacker.ravenDistraction=null;
    }
  }else animation(target,'Hit_Chest',true);
}

function cancelSoulJob(actor){
  const corpse=actor.soulJob;
  if(corpse?.soulReservedBy===actor.id)corpse.soulReservedBy=null;
  actor.soulJob=null;
}
function beginSoulEffect(corpse,mage){
  // Copy the ACTUAL fallen body, including its frozen skeleton pose, costume,
  // hair, weapon and identical geometries. Never substitute a flat icon.
  const ghostVisual=cloneSkeleton(corpse.visual);
  const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,
    opacity:.66,side:THREE.DoubleSide,forceSinglePass:true,depthTest:false,
    depthWrite:false,toneMapped:false});
  const sourceMeshes=[],ghostMeshes=[],sourceSkins=[],ghostSkins=[];
  corpse.visual.traverse(node=>{
    if(node.isMesh)sourceMeshes.push(node);
    if(node.isSkinnedMesh)sourceSkins.push(node);
  });
  ghostVisual.traverse(node=>{
    if(node.isMesh){ghostMeshes.push(node);node.material=material;node.renderOrder=9;}
    if(node.isSkinnedMesh)ghostSkins.push(node);
  });
  const sameGeometry=sourceMeshes.length===ghostMeshes.length&&
    sourceMeshes.every((mesh,i)=>mesh.geometry===ghostMeshes[i].geometry);
  const sameQuaternion=(a,b)=>Math.abs(a.x-b.x)<1e-6&&
    Math.abs(a.y-b.y)<1e-6&&Math.abs(a.z-b.z)<1e-6&&Math.abs(a.w-b.w)<1e-6;
  const samePose=sourceSkins.length===ghostSkins.length&&sourceSkins.every((mesh,i)=>{
    const a=mesh.skeleton.bones,b=ghostSkins[i].skeleton.bones;
    return a.length===b.length&&a.every((bone,j)=>
      bone.position.distanceTo(b[j].position)<1e-6&&
      sameQuaternion(bone.quaternion,b[j].quaternion)&&
      bone.scale.distanceTo(b[j].scale)<1e-6);
  });
  const root=new THREE.Group();
  root.position.copy(corpse.root.position);
  root.quaternion.copy(corpse.root.quaternion);
  root.scale.copy(corpse.root.scale);
  root.add(ghostVisual);scene.add(root);
  const sameTransform=root.position.distanceTo(corpse.root.position)<1e-6&&
    root.quaternion.angleTo(corpse.root.quaternion)<1e-6&&
    root.scale.distanceTo(corpse.root.scale)<1e-6;
  soulEffects.push({root,material,mage,source:corpse.root.position.clone(),elapsed:0,
    sameGeometry,samePose,sameTransform,meshCount:ghostMeshes.length,
    skinnedCount:ghostSkins.length});
}
function disposeSoulEffect(effect){
  const skeletons=new Set();
  effect.root.traverse(node=>{
    if(node.isSkinnedMesh&&node.skeleton)skeletons.add(node.skeleton);
  });
  for(const skeleton of skeletons)skeleton.dispose();
  scene.remove(effect.root);effect.material.dispose();
  // All copied geometry and texture resources belong to the original actors.
}
function stepSoulEffects(dt){
  for(let i=soulEffects.length-1;i>=0;i--){
    const effect=soulEffects[i];effect.elapsed+=dt;
    const t=clamp(effect.elapsed/soulRules.SOUL_SECONDS,0,1);
    const flight=t*t*(3-2*t),target=effect.mage.root.position;
    effect.root.position.set(
      THREE.MathUtils.lerp(effect.source.x,target.x,flight),
      THREE.MathUtils.lerp(effect.source.y,target.y+1.2,flight)+
        1.15*Math.sin(Math.PI*t),
      THREE.MathUtils.lerp(effect.source.z,target.z,flight));
    effect.root.scale.setScalar(1-.92*flight);
    effect.material.opacity=.66*(1-t*.82);
    if(t<1)continue;
    if(!effect.mage.dead)magic=soulRules.magicAfterSoul(magic);
    disposeSoulEffect(effect);soulEffects.splice(i,1);refreshHUD();
  }
}
function assignSoulHarvesters(dt){
  if(magic>=soulRules.MAX_MAGIC)return;
  soulAssignmentElapsed+=dt;
  if(soulAssignmentElapsed<.65)return;
  soulAssignmentElapsed=0;
  for(const mage of units){
    if(mage.kind!=='witch'||mage.role!=='ranged'||mage.dead||mage.soulJob||
      mage.raiding||mage.destination||mage.attackOrder||mage.attack||mage.healJob||mage.berryJob||
      mage.workerRetryTime||nearestHostile(mage,5)?.target)continue;
    const position=mage.root.position;
    const available=units.filter(unit=>unit.dead).map(unit=>({
      id:unit.id,x:unit.root.position.x,z:unit.root.position.z,
      dead:true,deadTime:unit.deadTime,soulClaimed:unit.soulClaimed,
      soulReservedBy:unit.soulReservedBy
    }));
    const nearest=soulRules.nearestSoul(position,available,corpse=>
      fogOfWar.visibleAt(corpse.x,corpse.z,'witch')&&
      (navigatorRTS.segmentClear(position,corpse)||!!navigatorRTS.plan(position,corpse)));
    if(!nearest)continue;
    const corpse=units.find(unit=>unit.id===nearest.id);
    corpse.soulReservedBy=mage.id;mage.soulJob=corpse;
  }
}
function tickSoulHarvester(actor,dt){
  const corpse=actor.soulJob;
  if(!corpse)return false;
  if(corpse.deadTime<=0||!corpse.dead||corpse.soulClaimed||
    actor.destination||actor.attackOrder||actor.attack||
    nearestHostile(actor,5)?.target){cancelSoulJob(actor);return false;}
  const position=corpse.root.position;
  if(Math.hypot(actor.root.position.x-position.x,actor.root.position.z-position.z)>
    soulRules.SOUL_APPROACH){
    const status=navigateActor(actor,position,dt,'engage');
    if(status==='blocked'){markWorkBlocked(actor);cancelSoulJob(actor);}
    if(status!=='moving')animation(actor,'Idle_Loop');
    return status!=='blocked';
  }
  faceDirection(actor,position.x-actor.root.position.x,
    position.z-actor.root.position.z);
  // Wait for the authentic Death01 pose to settle before copying the corpse.
  // Otherwise the spirit could inherit a standing or half-fallen skeleton.
  if(corpse.current==='Death01'&&corpse.action?.isRunning()){
    animation(actor,'Idle_Loop');return true;
  }
  corpse.soulClaimed=true;cancelSoulJob(actor);
  animation(actor,'Idle_Loop');
  playWitchVoice('interaction',actor);
  beginSoulEffect(corpse,actor);
  return true;
}

function navigateActor(actor,target,dt,mode){
  const pos=actor.root.position,from={x:pos.x,z:pos.z};
  actor.unstickSeconds=Math.max(0,actor.unstickSeconds-dt);
  const distance=Math.hypot(target.x-pos.x,target.z-pos.z);
  const arrival=mode==='engage'?.055:mode==='pursuit'?1.35:.36;
  if(distance<=arrival){actor.navWatch=null;return 'arrived';}
  const goalChanged=!actor.routeGoal||
    Math.hypot(target.x-actor.routeGoal.x,target.z-actor.routeGoal.z)>(mode==='pursuit'?1.1:.4);
  actor.routeAge+=dt;
  const directClear=navigatorRTS.segmentClear(from,target);
  if(directClear){
    actor.route=null;actor.routeGoal={x:target.x,z:target.z};
    actor.routeVersion=navigatorRTS.version;
  }else if(actor.routeVersion!==navigatorRTS.version||goalChanged||
    actor.routeAge>(actor.route?2.3:.75)){
    // Retain a failed-route result briefly: an impossible goal must not run
    // full A* 60 times per second for every unit in a siege.
    actor.route=navigatorRTS.plan(from,target);
    actor.routeGoal={x:target.x,z:target.z};
    actor.routeVersion=navigatorRTS.version;actor.routeAge=0;
  }
  if(!directClear&&!actor.route){actor.navWatch=null;return 'blocked';}
  let waypoint=actor.route?.waypoints[0]||target;
  if(actor.route){
    while(actor.route.waypoints.length>1&&Math.hypot(waypoint.x-pos.x,waypoint.z-pos.z)<.45){
      actor.route.waypoints.shift();waypoint=actor.route.waypoints[0];
    }
    // As in WarConquer, simplify waypoints using an authoritative swept circle.
    for(let i=actor.route.waypoints.length-1;i>0;i--){
      if(navigatorRTS.segmentClear(from,actor.route.waypoints[i])){
        actor.route.waypoints.splice(0,i);waypoint=actor.route.waypoints[0];break;
      }
    }
  }
  const gap=Math.hypot(waypoint.x-pos.x,waypoint.z-pos.z);
  if(gap<.03){actor.navWatch=null;return 'arrived';}
  const stalls=window.FightersUnitPhysics.watchMovement(actor,from,waypoint,dt);
  if(stalls){
    // Retry a fresh path and temporarily ignore soft crowd avoidance before
    // giving up. A real wall remains impassable throughout the recovery.
    actor.route=null;actor.routeGoal=null;actor.routeAge=0;
    actor.approachCache=null;actor.unstickSeconds=2;
    if(stalls>=3){actor.navWatch=null;return 'blocked';}
    return 'retrying';
  }
  const speed=actor.speed*dt;
  const budget=Math.max(0,Math.min(gap-(actor.route?0:arrival),speed));
  const next=window.FightersUnitPhysics.step(from,waypoint,budget,actor,units,
    navigatorRTS,UNIT_RADIUS);
  if(!next){
    actor.route=null;actor.routeGoal=null;actor.routeAge=0;
    if(++actor.noStepFailures<3)return 'retrying';
    actor.noStepFailures=0;actor.navWatch=null;return 'blocked';
  }
  actor.noStepFailures=0;
  const step=Math.hypot(next.x-pos.x,next.z-pos.z);
  if(step<.00001)return 'retrying';
  faceDirection(actor,next.x-pos.x,next.z-pos.z);
  pos.set(next.x,0,next.z);animation(actor,'Walk_Loop');
  return 'moving';
}
function markWorkBlocked(actor){
  actor.workerRetryTime=Math.max(actor.workerRetryTime||0,6);
  actor.navWatch=null;actor.route=null;actor.approachCache=null;
}
const MINING_SECONDS=4.5,MINING_PAY=60;
const goldOreGeometry=new THREE.DodecahedronGeometry(.17,0);
const goldOreMaterials=[new THREE.MeshStandardMaterial({color:0xffc631,
  roughness:.36,metalness:.64}),new THREE.MeshStandardMaterial({color:0xffe26c,
  roughness:.42,metalness:.5})];
function mountCarriedGold(actor){
  if(!actor.carryGold){
    // Three physical gold nuggets travel with the worker all the way home.
    const cargo=new THREE.Group();
    for(const [i,x,y,z] of [[0,-.17,0,0],[1,.13,.06,.06],[2,0,.21,-.08]]){
      const ore=new THREE.Mesh(goldOreGeometry,goldOreMaterials[i%2]);
      ore.position.set(x,y,z);cargo.add(ore);
    }
    cargo.position.set(0,1.06,.36);actor.root.add(cargo);actor.carryGold=cargo;
  }
  actor.carryGold.visible=true;
}
function cancelMineJob(actor){
  actor.mineJob=null;
  if(actor.carryGold)actor.carryGold.visible=false;
}
function goldStoreFor(actor){
  const clan=unitFaction(actor),preferred=actor.kind==='witch'?'witch-house':'barrack';
  const stores=liveBuildings().filter(b=>b.clanId===clan&&b.type===preferred);
  stores.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
  return stores[0]||woodStoreFor(actor);
}
function assignMiners(clan='orc'){
  if(!running||!(clan==='orc'?orcDirector.enabled:witchDirector.enabled))return;
  const mines=[...buildingInstances.values()].filter(b=>b.type==='mine'&&
    b.clanId==='neutral'&&!b.destroyed&&
    (clan==='orc'||fogOfWar.exploredAt(b.root.position.x,b.root.position.z,clan)));
  const workers=units.filter(u=>u.kind===clan&&roles.isWorker(u)&&!u.dead&&
    !u.constructJob&&!u.repairJob&&!u.treeJob&&!u.woodJob&&!u.farmJob&&
    !u.workerRetryTime);
  const limit=Math.min(mines.length,Math.max(1,Math.floor(workers.length/3)));
  let assigned=workers.filter(u=>u.mineJob&&mines.some(b=>b.id===u.mineJob.mineId));
  for(const worker of workers){
    if(worker.mineJob&&!mines.some(m=>m.id===worker.mineJob.mineId))cancelMineJob(worker);
  }
  assigned=workers.filter(u=>u.mineJob);
  if(assigned.length>=limit)return;
  const needed=mines.filter(m=>!assigned.some(u=>u.mineJob.mineId===m.id));
  for(const mine of needed){
    if(assigned.length>=limit)break;
    const available=workers.filter(u=>!u.mineJob&&!u.constructJob&&!u.destination&&
      !u.berryJob&&!u.soulJob);
    available.sort((a,b)=>targetDistance(a,mine)-targetDistance(b,mine));
    const miner=available[0];
    if(!miner)continue;
    miner.mineJob={mineId:mine.id,phase:'extract',progress:0,cycles:0,amount:0};
    miner.route=null;miner.approachCache=null;
    assigned.push(miner);
    if(clan==='orc')acknowledgeOrcAiOrder([miner]);
  }
}
function canMine(actor,mine){
  return roles.isWorker(actor)&&mine?.type==='mine'&&
    mine.clanId==='neutral'&&!mine.destroyed;
}
function orderMine(actors,mine){
  const issued=workerOrders.mine(actors,mine);
  if(issued){showBanner('EXTRACTION D’OR');acknowledgePlayerOrder(actors);refreshHUD();}
  return issued>0;
}
function tickMineWorker(actor,dt){
  const job=actor.mineJob;
  if(!job)return false;
  if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
    animation(actor,'Idle_Loop');return true;}
  const mine=buildingInstances.get(job.mineId);
  if(!canMine(actor,mine)){cancelMineJob(actor);return false;}
  // Workers are economic units: they never acquire combat targets.
  if(job.phase==='carry'){
    const store=goldStoreFor(actor);
    if(!store){animation(actor,'Idle_Loop');return true;}
    if(targetDistance(actor,store)>BUILDING_CONTACT){
      const goal=approachBuilding(actor,store);
      if(goal){const status=navigateActor(actor,goal,dt,'engage');
        if(status==='blocked')job.retryWait=5;
        if(status!=='moving')animation(actor,'Idle_Loop');}
      else{job.retryWait=5;animation(actor,'Idle_Loop');}
      return true;
    }
    // No income exists in transit: resources enter the treasury at delivery.
    gold[actor.kind]+=job.amount;totalMinedGold+=job.amount;completedMiningCycles++;
    job.amount=0;job.phase='extract';job.progress=0;job.cycles++;
    if(actor.carryGold)actor.carryGold.visible=false;
    actor.route=null;actor.approachCache=null;
    animation(actor,'Idle_Loop');refreshHUD();return true;
  }
  const reach=targetDistance(actor,mine);
  if(reach>BUILDING_CONTACT){
    const goal=approachBuilding(actor,mine);
    if(!goal){markWorkBlocked(actor);cancelMineJob(actor);return false;}
    const status=navigateActor(actor,goal,dt,'engage');
    if(status==='blocked'){markWorkBlocked(actor);cancelMineJob(actor);return false;}
    // Mining is a physical contact task, not a loose formation move.
    // The order-mode .36m arrival tolerance left workers .2m beyond reach.
    if(status!=='moving')animation(actor,'Idle_Loop');
    return true;
  }
  // Extract at the mine, then transport the ore to an allied headquarters.
  faceBuildingCenter(actor,mine);
  animation(actor,WORK_SWING);
  job.soundTimer=(job.soundTimer||0)+dt;
  if(job.soundTimer>=.78){
    job.soundTimer-=.78;playEffect('mine',actor.root.position);
  }
  job.progress+=dt;
  if(job.progress>=MINING_SECONDS){
    job.progress=0;job.phase='carry';job.amount=MINING_PAY*mine.level;
    actor.route=null;actor.approachCache=null;
    mountCarriedGold(actor);animation(actor,'Idle_Loop');
  }
  return true;
}
const TREE_CHOP_SECONDS=4.2;
const WOOD_PICKUP_SECONDS=1.15;
function mountCarriedWood(actor){
  if(!woodBundleTemplate)return;
  if(!actor.carryBundle){
    // A small bundle is held in front of the torso, without rig-specific
    // hand-bone retargeting. The original GLB geometry/materials are shared.
    const root=new THREE.Group(),model=woodBundleTemplate.clone(true);
    const scale=woodBundleScale*.57;
    model.scale.setScalar(scale);
    model.position.set(-woodBundleCenter.x*scale,-woodBundleFloor*scale,
      -woodBundleCenter.z*scale);
    root.position.set(0,1.02,.25);root.add(model);
    actor.root.add(root);actor.carryBundle=root;
  }
  actor.carryBundle.visible=true;
}
function cancelWoodJob(actor){
  const job=actor.woodJob;
  if(!job)return;
  if(job.phase==='carry'){
    woodDeposits.set(job.index,{amount:job.amount,reservedBy:null});
    placeLogBundle(job.index);
  }else{
    const deposit=woodDeposits.get(job.index);
    if(deposit?.reservedBy===actor.id)deposit.reservedBy=null;
  }
  actor.woodJob=null;
  if(actor.carryBundle)actor.carryBundle.visible=false;
}
function orderCollectWood(actors,index,{byAI=false}={}){
  const deposit=woodDeposits.get(index);
  const assigned=workerOrders.collectWood(actors,index,deposit);
  if(assigned){if(!byAI)showBanner('RAMASSAGE DES BÛCHES');refreshHUD();}
  return assigned>0;
}
function woodStoreFor(actor){
  const clan=actor.kind==='witch'?'witch':'orcs';
  const homes=liveBuildings().filter(b=>b.clanId===clan&&b.type!=='garden');
  homes.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
  return homes[0]||null;
}
function safeWitchWoodLocation(tree){
  if(!tree||!fogOfWar.exploredAt(tree.x,tree.z,'witch'))return false;
  // Keep automatic gatherers out of the Orc village, even before its
  // buildings have been discovered. Also respect any scouted Orc expansion.
  if(Math.hypot(tree.x-SPAWNS.enemies.x,tree.z-SPAWNS.enemies.z)<11)return false;
  return liveBuildings().every(b=>b.clanId!=='orcs'||
    !knownEnemyBuildings.witch.has(b.id)||
    window.FightersFootprints.distanceTo(tree,b.hitbox)>=7);
}
function continueWitchWoodRun(actor){
  if(actor.kind!=='witch'||actor.dead||actor.destination||actor.constructJob||
    actor.repairJob||actor.farmJob||actor.mineJob||actor.treeJob||actor.woodJob||
    actor.workerRetryTime)return false;
  if(witchDirector.enabled&&wood.witch>=220)return false;
  const candidates=forestLayout.map((tree,index)=>({tree,index,d:
    Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)}))
    .filter(({tree})=>safeWitchWoodLocation(tree))
    .sort((a,b)=>a.d-b.d);
  // Collect already-felled bundles first; only one worker may reserve each.
  for(const {tree,index} of candidates){
    const deposit=woodDeposits.get(index);
    if(!tree.felled||!deposit||deposit.reservedBy||!treeChopGoal(actor,tree))continue;
    if(orderCollectWood([actor],index,{byAI:true}))return true;
  }
  for(const {tree,index} of candidates){
    if(!tree.felled&&treeChopGoal(actor,tree)&&orderChop([actor],index,{byAI:true}))
      return true;
  }
  return false;
}
function tickWoodWorker(actor,dt){
  const job=actor.woodJob;
  if(!job)return false;
  if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
    animation(actor,'Idle_Loop');return true;}
  if(job.phase==='pickup'){
    const deposit=woodDeposits.get(job.index),tree=forestLayout[job.index];
    if(!deposit||deposit.reservedBy!==actor.id){actor.woodJob=null;return true;}
    if(Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)>1.45){
      if(!job.goal||!navigatorRTS.pointClear(job.goal))job.goal=treeChopGoal(actor,tree);
      if(job.goal){const status=navigateActor(actor,job.goal,dt,'engage');
        if(status==='blocked'){markWorkBlocked(actor);cancelWoodJob(actor);return false;}
        if(status!=='moving')animation(actor,'Idle_Loop');}
      else{markWorkBlocked(actor);cancelWoodJob(actor);return false;}
      return true;
    }
    faceDirection(actor,tree.x-actor.root.position.x,tree.z-actor.root.position.z);
    animation(actor,FARM_HARVEST);job.progress+=dt;
    if(job.progress>=WOOD_PICKUP_SECONDS){
      job.amount=deposit.amount;job.phase='carry';job.goal=null;
      woodDeposits.delete(job.index);removeLogBundle(job.index);
      mountCarriedWood(actor);animation(actor,'Idle_Loop');
    }
    return true;
  }
  const home=woodStoreFor(actor);
  if(!home){animation(actor,'Idle_Loop');return true;}
  if(targetDistance(actor,home)>BUILDING_CONTACT){
    const goal=approachBuilding(actor,home);
    if(goal){const status=navigateActor(actor,goal,dt,'engage');
      if(status==='blocked')job.retryWait=5;
      if(status!=='moving')animation(actor,'Idle_Loop');}
    else{job.retryWait=5;animation(actor,'Idle_Loop');}
    return true;
  }
  wood[actor.kind]+=job.amount;
  if(actor.carryBundle)actor.carryBundle.visible=false;
  actor.woodJob=null;animation(actor,'Idle_Loop');
  showBanner('BOIS LIVRÉ : +'+job.amount+' 🪵');refreshHUD();
  continueWitchWoodRun(actor);
  return true;
}
function assignOrcLumberjack(){
  if(!orcDirector.enabled||wood.orc>=140||
    units.some(u=>u.kind==='orc'&&!u.dead&&(u.treeJob||u.woodJob)))return;
  const workers=units.filter(u=>u.kind==='orc'&&roles.isWorker(u)&&!u.dead&&
    !u.constructJob&&!u.repairJob&&!u.farmJob&&!u.destination&&!u.workerRetryTime);
  if(!workers.length)return;
  const candidates=[];
  for(let i=0;i<forestLayout.length;i++){
    const tree=forestLayout[i];
    if(tree.felled||!fogOfWar.exploredAt(tree.x,tree.z,'orc'))continue;
    for(const actor of workers){
      candidates.push({actor,index:i,d:Math.hypot(actor.root.position.x-tree.x,
        actor.root.position.z-tree.z)});
    }
  }
  candidates.sort((a,b)=>a.d-b.d);
  for(const {actor,index} of candidates.slice(0,12)){
    const goal=treeChopGoal(actor,forestLayout[index]);
    if(goal&&orderChop([actor],index))return;
  }
}
function assignWitchLumberjack(){
  if(!witchDirector.enabled||wood.witch>=180||
    units.some(u=>u.kind==='witch'&&!u.dead&&(u.treeJob||u.woodJob)))return;
  const workers=units.filter(u=>u.kind==='witch'&&roles.isWorker(u)&&!u.dead&&
    !u.constructJob&&!u.repairJob&&!u.farmJob&&!u.mineJob&&!u.destination&&
    !u.workerRetryTime);
  if(!workers.length)return;
  const candidates=[];
  for(let index=0;index<forestLayout.length;index++){
    const tree=forestLayout[index];
    if(tree.felled||!safeWitchWoodLocation(tree))continue;
    for(const actor of workers)candidates.push({actor,index,
      distance:Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const {actor,index} of candidates.slice(0,15)){
    if(treeChopGoal(actor,forestLayout[index])&&orderChop([actor],index,{byAI:true}))return;
  }
}
function orderChop(actors,index,{byAI=false}={}){
  const tree=forestLayout[index];
  const assigned=workerOrders.chop(actors,index,tree);
  if(assigned){if(!byAI){showBanner('COUPE DU BOIS');acknowledgePlayerOrder(actors);}refreshHUD();}
  return assigned>0;
}
function treeChopGoal(actor,tree){
  const radius=tree.radius+UNIT_RADIUS+.25;
  const origin=actor.root.position;
  const angles=[0,Math.PI/4,Math.PI/2,3*Math.PI/4,Math.PI,
    5*Math.PI/4,3*Math.PI/2,7*Math.PI/4];
  const options=angles.map(angle=>({x:tree.x+Math.cos(angle)*radius,
    z:tree.z+Math.sin(angle)*radius}));
  options.sort((a,b)=>Math.hypot(a.x-origin.x,a.z-origin.z)-
    Math.hypot(b.x-origin.x,b.z-origin.z));
  return options.find(goal=>navigatorRTS.pointClear(goal)&&
    (navigatorRTS.segmentClear(origin,goal)||navigatorRTS.plan(origin,goal)))||null;
}
function tickTreeWorker(actor,dt){
  const job=actor.treeJob;
  if(!job)return false;
  const tree=forestLayout[job.index];
  if(!tree||tree.felled){actor.treeJob=null;animation(actor,'Idle_Loop');return true;}
  const reach=tree.radius+UNIT_RADIUS+.35;
  if(Math.hypot(actor.root.position.x-tree.x,actor.root.position.z-tree.z)>reach){
    if(!job.goal||!navigatorRTS.pointClear(job.goal))
      job.goal=treeChopGoal(actor,tree);
    if(!job.goal){markWorkBlocked(actor);actor.treeJob=null;animation(actor,'Idle_Loop');return true;}
    const status=navigateActor(actor,job.goal,dt,'engage');
    if(status==='blocked'){markWorkBlocked(actor);actor.treeJob=null;animation(actor,'Idle_Loop');return false;}
    if(status!=='moving')animation(actor,'Idle_Loop');
    return true;
  }
  faceDirection(actor,tree.x-actor.root.position.x,tree.z-actor.root.position.z);
  animation(actor,TREE_CHOP);
  job.progress+=dt;
  if(job.progress>=TREE_CHOP_SECONDS){
    fellTree(job.index);actor.treeJob=null;
    animation(actor,'Idle_Loop');showBanner('BRASSÉE DE BÛCHES');
    orderCollectWood([actor],job.index,{byAI:true});
  }
  return true;
}
// Garden workers enter the aisle between wheat rows instead of stopping at the
// garden's exterior perimeter. Two columns x three rows match makeGardenVisual.
function gardenHarvestGoal(garden,index){
  const x=index%2===0?-.24:.24;
  const z=(Math.floor(index/2)-1)*1.10;
  return {x:garden.root.position.x+x,z:garden.root.position.z+z};
}
function mountCarriedWheat(actor){
  if(!actor.carryWheat){
    const bundle=new THREE.Group();
    const matureWheat=cropCatalog?.get(0)?.[2];
    if(matureWheat){
      const model=matureWheat.clone(true);
      model.scale.setScalar(.43);bundle.add(model);
    }else{
      // Small fallback only until the licensed wheat asset finishes loading.
      for(let i=0;i<5;i++){
        const stalk=new THREE.Mesh(farmGeometry.stem,farmMaterial.produce);
        stalk.scale.set(.3,.7,.3);stalk.position.set((i-2)*.10,.29,0);
        bundle.add(stalk);
      }
    }
    bundle.position.set(0,.95,.30);actor.root.add(bundle);
    actor.carryWheat=bundle;
  }
  actor.carryWheat.visible=true;
}
function cancelFarmJob(actor){
  actor.farmJob=null;
  if(actor.carryWheat)actor.carryWheat.visible=false;
}
function orderHarvest(actors,garden){
  const assigned=workerOrders.harvest(actors,garden);
  if(assigned){showBanner('RÉCOLTE DU POTAGER');acknowledgePlayerOrder(actors);refreshHUD();}
  return assigned>0;
}
function assignGardenWorkers(dt){
  farmAssignmentElapsed+=dt;
  if(farmAssignmentElapsed<.75)return;
  farmAssignmentElapsed=0;
  for(const garden of buildingInstances.values()){
    if(garden.type!=='garden'||garden.destroyed||farming.firstReady(garden.id)<0)continue;
    if(units.some(u=>!u.dead&&u.farmJob?.gardenId===garden.id))continue;
    const workers=units.filter(u=>u.kind==='witch'&&!u.dead&&roles.isWorker(u)&&
      !u.constructJob&&!u.repairJob&&!u.mineJob&&!u.farmJob&&!u.treeJob&&!u.woodJob&&
      !u.berryJob&&!u.destination&&!u.workerRetryTime);
    workers.sort((a,b)=>targetDistance(a,garden)-targetDistance(b,garden));
    const worker=workers[0];
    if(!worker)continue;
    worker.farmJob={gardenId:garden.id,plotIndex:-1,progress:0,phase:'harvest',amount:0};
    worker.route=null;worker.approachCache=null;
  }
}
function tickGardenWorker(actor,dt){
  const job=actor.farmJob;
  if(!job)return false;
  if(job.retryWait>0){job.retryWait=Math.max(0,job.retryWait-dt);
    animation(actor,'Idle_Loop');return true;}
  const garden=buildingInstances.get(job.gardenId);
  if(!garden||garden.type!=='garden'||garden.destroyed){
    cancelFarmJob(actor);return false;
  }
  if(job.phase==='carry'){
    const homes=liveBuildings().filter(b=>b.type==='witch-house'&&b.clanId==='witch');
    homes.sort((a,b)=>targetDistance(actor,a)-targetDistance(actor,b));
    const home=homes[0];
    if(!home){animation(actor,'Idle_Loop');return true;}
    if(targetDistance(actor,home)>BUILDING_CONTACT){
      const goal=approachBuilding(actor,home);
      if(goal){const status=navigateActor(actor,goal,dt,'engage');
        if(status==='blocked')job.retryWait=5;
        if(status!=='moving')animation(actor,'Idle_Loop');}
      else{job.retryWait=5;animation(actor,'Idle_Loop');}
      return true;
    }
    farming.deliver(job.amount);
    cancelFarmJob(actor);animation(actor,'Idle_Loop');refreshHUD();
    return true;
  }
  if(job.plotIndex<0){
    const reserved=units.filter(u=>u!==actor&&!u.dead&&
      u.farmJob?.gardenId===garden.id&&u.farmJob.plotIndex>=0)
      .map(u=>u.farmJob.plotIndex);
    job.plotIndex=farming.firstReady(garden.id,reserved);
    job.progress=0;job.harvestSounded=false;
  }
  if(job.plotIndex<0){animation(actor,'Idle_Loop');return true;}
  const goal=gardenHarvestGoal(garden,job.plotIndex);
  if(Math.hypot(actor.root.position.x-goal.x,actor.root.position.z-goal.z)>.30){
    const movement=navigateActor(actor,goal,dt,'engage');
    if(movement==='blocked'){markWorkBlocked(actor);cancelFarmJob(actor);animation(actor,'Idle_Loop');return false;}
    if(movement!=='moving')animation(actor,'Idle_Loop');
    return true;
  }
  const plantX=garden.root.position.x+(job.plotIndex%2===0?-.91:.91);
  const plantZ=garden.root.position.z+(Math.floor(job.plotIndex/2)-1)*1.10;
  faceDirection(actor,plantX-actor.root.position.x,plantZ-actor.root.position.z);
  animation(actor,FARM_HARVEST);
  job.progress+=dt;
  if(!job.harvestSounded&&job.progress>=.4){
    job.harvestSounded=true;playEffect('garden',actor.root.position);
  }
  if(job.progress>=window.FightersFarming.HARVEST_SECONDS){
    const yieldAmount=farming.harvest(garden.id,job.plotIndex);
    job.plotIndex=-1;job.progress=0;
    if(yieldAmount){
      job.amount=yieldAmount;job.phase='carry';
      mountCarriedWheat(actor);syncGardenVisual(garden);refreshHUD();
    }
  }
  return true;
}
function assignBerryForagers(dt){
  berryAssignmentElapsed+=dt;
  if(berryAssignmentElapsed<.85)return;
  berryAssignmentElapsed=0;
  // Nearby idle witches (of any role) may eat. They never abandon explicit
  // orders, garden work, mining, construction, tree felling or combat.
  const candidates=units.filter(u=>u.kind==='witch'&&!u.dead&&!u.attack&&
    !u.raiding&&!u.attackOrder&&!u.destination&&!u.constructJob&&!u.mineJob&&
    !u.repairJob&&!u.treeJob&&!u.woodJob&&!u.farmJob&&!u.berryJob&&!u.soulJob&&
    !u.workerRetryTime);
  let jobs=units.filter(u=>u.berryJob&&!u.dead).length;
  for(const bush of wildBerries.bushes){
    if(jobs>=2)break;
    if(bush.stage!==3||units.some(u=>u.berryJob?.index===bush.id&&!u.dead))continue;
    let closest=null,dist=window.FightersBerries.FORAGE_SIGHT;
    for(const actor of candidates){
      if(actor.berryJob)continue;
      const d=Math.hypot(actor.root.position.x-bush.x,actor.root.position.z-bush.z);
      if(d>=dist)continue;
      if(roles.isFighter(actor)&&nearestHostile(actor,actor.profile.sight)?.target)continue;
      dist=d;closest=actor;
    }
    if(!closest)continue;
    closest.berryJob={index:bush.id,progress:0};
    closest.route=null;closest.approachCache=null;jobs++;
  }
}
function tickBerryForager(actor,dt){
  if(!actor.berryJob)return false;
  const bush=wildBerries.bushes[actor.berryJob.index];
  if(!bush||bush.stage!==3||actor.destination||actor.attackOrder||actor.woodJob||
    (roles.isFighter(actor)&&nearestHostile(actor,actor.profile.sight)?.target)){
    actor.berryJob=null;return false;
  }
  if(Math.hypot(actor.root.position.x-bush.x,actor.root.position.z-bush.z)>.67){
    const status=navigateActor(actor,bush,dt,'engage');
    if(status==='blocked'){markWorkBlocked(actor);actor.berryJob=null;}
    if(status!=='moving')animation(actor,'Idle_Loop');
    return true;
  }
  faceDirection(actor,bush.x-actor.root.position.x,bush.z-actor.root.position.z);
  animation(actor,FARM_HARVEST);
  actor.berryJob.progress+=dt;
  if(actor.berryJob.progress>=window.FightersBerries.EAT_SECONDS){
    const amount=wildBerries.eat(bush.id);
    actor.berryJob=null;
    if(amount){farming.forage(amount);syncBerryVisuals();refreshHUD();}
    animation(actor,'Idle_Loop');
  }
  return true;
}
function cancelOrcFoodJob(actor){
  if(actor.orcFoodJob?.kind==='hare')
    hareField.release(actor.orcFoodJob.id,actor.id);
  actor.orcFoodJob=null;
}
function assignOrcForagers(dt){
  if(qaPassiveKind==='orc')return;
  orcForageElapsed+=dt;
  if(orcForageElapsed<.8)return;
  orcForageElapsed=0;
  const orcs=units.filter(u=>u.kind==='orc'&&!u.dead);
  // Corpse meals are opportunistic even with a full stockpile. Hares are
  // hunted before starvation, without pulling soldiers out of a real fight.
  const huntHares=orcFood.food<Math.max(60,orcs.length*12);
  let jobs=orcs.filter(u=>u.orcFoodJob).length;
  if(jobs>=2)return;
  const candidates=orcs.filter(u=>!u.orcFoodJob&&!u.attack&&
    !u.raiding&&!u.attackOrder&&(!u.destination||orcDirector.enabled&&u.scouting)&&
    !u.constructJob&&!u.repairJob&&!u.mineJob&&
    !u.treeJob&&!u.woodJob&&!u.farmJob&&!u.ravenDistraction&&
    !u.workerRetryTime&&!nearestHostile(u,8)?.target);
  // Fallen witches are a substantial, finite meal, preferred over live hares.
  const prey=[...units.filter(u=>u.kind==='witch'&&u.dead&&u.deadTime>2&&
    !orcFood.consumedCorpses.has(u.id)).map(u=>({
    kind:'corpse',id:u.id,x:u.root.position.x,z:u.root.position.z
  }))];
  if(huntHares)prey.push(...hareField.hares.filter(h=>h.active&&h.caughtBy==null).map(h=>({
    kind:'hare',id:h.id,x:h.x,z:h.z
  })));
  // Try the closest reachable meals first, while keeping fallen witches
  // preferable to hares when both are in hunting range.
  const closestHunter=target=>candidates.reduce((distance,orc)=>Math.min(distance,
    Math.hypot(orc.root.position.x-target.x,orc.root.position.z-target.z)),Infinity);
  prey.sort((a,b)=>(a.kind==='corpse'?0:1)-(b.kind==='corpse'?0:1)||
    closestHunter(a)-closestHunter(b));
  for(const target of prey){
    if(jobs>=2)break;
    if(orcs.some(u=>u.orcFoodJob?.kind===target.kind&&u.orcFoodJob?.id===target.id))continue;
    if(!fogOfWar.exploredAt(target.x,target.z,'orc'))continue;
    let nearest=null,minimum=orcFoodRules.HUNT_SIGHT;
    for(const orc of candidates){
      if(orc.orcFoodJob)continue;
      const distance=Math.hypot(orc.root.position.x-target.x,orc.root.position.z-target.z);
      if(distance>=minimum)continue;
      if(!navigatorRTS.segmentClear(orc.root.position,target)&&
        !navigatorRTS.plan(orc.root.position,target))continue;
      minimum=distance;nearest=orc;
    }
    if(!nearest)continue;
    nearest.orcFoodJob={kind:target.kind,id:target.id,progress:0};
    // Autonomous scouting is resumable: the director will issue another
    // frontier waypoint after the nearby food has been consumed.
    if(nearest.scouting&&orcDirector.enabled){
      nearest.scouting=false;nearest.destination=null;
    }
    nearest.route=null;nearest.approachCache=null;jobs++;
  }
}
function tickOrcForager(actor,dt){
  const job=actor.orcFoodJob;
  if(!job)return false;
  if(actor.attackOrder||actor.destination||actor.attack||actor.constructJob||
    actor.repairJob||actor.mineJob||actor.treeJob||actor.woodJob||
    nearestHostile(actor,8)?.target){cancelOrcFoodJob(actor);return false;}
  const target=job.kind==='hare'?hareField.hares[job.id]:
    units.find(u=>u.id===job.id);
  const edible=job.kind==='hare'?(target?.active&&
    (target.caughtBy==null||target.caughtBy===actor.id)):
    target?.kind==='witch'&&target.dead&&target.deadTime>0;
  if(!edible){cancelOrcFoodJob(actor);return false;}
  const position=job.kind==='hare'?target:target.root.position;
  const catchDistance=job.kind==='hare'?orcFoodRules.HARE_CAPTURE_DISTANCE:.8;
  if(Math.hypot(actor.root.position.x-position.x,actor.root.position.z-position.z)>catchDistance){
    job.progress=0;
    const result=navigateActor(actor,position,dt,'engage');
    if(result==='blocked'){markWorkBlocked(actor);cancelOrcFoodJob(actor);}
    if(result!=='moving')animation(actor,'Idle_Loop');
    return true;
  }
  if(job.kind==='hare'&&target.caughtBy==null&&!hareField.catch(job.id,actor.id)){
    cancelOrcFoodJob(actor);return false;
  }
  faceDirection(actor,position.x-actor.root.position.x,position.z-actor.root.position.z);
  animation(actor,FARM_HARVEST);
  job.progress+=dt;
  if(job.progress>=orcFoodRules.EAT_SECONDS){
    if(job.kind==='hare'){
      if(hareField.eat(job.id))orcFood.eatHare();
    }else if(orcFood.eatCorpse(target.id)){
      target.deadTime=0;
      for(const mage of units)if(mage.soulJob===target)cancelSoulJob(mage);
    }
    cancelOrcFoodJob(actor);animation(actor,'Idle_Loop');refreshHUD();
  }
  return true;
}
function stepOrcFood(dt){
  const orcs=units.filter(u=>u.kind==='orc'&&!u.dead);
  hareField.step(dt,orcs.map(u=>u.root.position));
  const result=orcFood.step(dt,orcs.length);
  assignOrcForagers(dt);
  if(orcFood.food>0)orcFamineAlerted=false;
  else if(!orcFamineAlerted){orcFamineAlerted=true;showBanner('FAMINE : LES ORCS PERDENT DES PV');}
  if(result.starvedSeconds>0){
    const damage=result.starvedSeconds*orcFoodRules.STARVATION_DAMAGE;
    for(const orc of orcs){
      if(orc.health<=damage)dealDamage(orc,damage,null);
      else orc.health-=damage;
    }
  }
}
function stepFarming(dt){
  wildBerries.step(dt);syncBerryVisuals();
  const witches=units.filter(u=>u.kind==='witch'&&!u.dead);
  const result=farming.step(dt,witches.length);
  for(const garden of buildingInstances.values())
    if(garden.type==='garden'&&!garden.destroyed)syncGardenVisual(garden);
  assignGardenWorkers(dt);
  assignBerryForagers(dt);
  if(farming.food>0)famineAlerted=false;
  else if(!famineAlerted){famineAlerted=true;showBanner('FAMINE : LES SORCIÈRES PERDENT DES PV');}
  if(result.starvedSeconds>0){
    const damage=result.starvedSeconds*window.FightersFarming.STARVATION_DAMAGE;
    for(const witch of witches){
      if(witch.health<=damage)dealDamage(witch,damage,null);
      else witch.health-=damage;
    }
  }
}
function stepHealing(dt){
  const circles=[...buildingInstances.values()].filter(b=>
    b.type==='stone-circle'&&!b.destroyed);
  const resting=[];
  for(const witch of units){
    if(witch.kind!=='witch'||witch.dead)continue;
    witch.healRetry=Math.max(0,witch.healRetry-dt);
    if(witch.health>=witch.maxHealth)continue;
    const point={x:witch.root.position.x,z:witch.root.position.z};
    if(circles.some(b=>stoneHealing.inside(point,b.root.position)))
      resting.push(witch);
  }
  // One shared magic budget for every circle; scarce magic is split fairly
  // rather than silently healing the first unit in the array for free.
  if(resting.length)magic=stoneHealing.restoreGroup(resting,dt,magic).magic;
  healingAssignmentElapsed+=dt;
  if(healingAssignmentElapsed<.85)return;
  healingAssignmentElapsed=0;
  for(const witch of units){
    if(witch.kind!=='witch'||witch.dead)continue;
    if(witch.healJob){
      const circle=buildingInstances.get(witch.healJob.id);
      if(!circle||circle.destroyed||stoneHealing.recovered(witch)||
        nearestHostile(witch,stoneHealing.HOSTILE_SAFETY_DISTANCE)?.target)
        witch.healJob=null;
      continue;
    }
    // No autonomous retreat can override the player's commands or work.
    if(!stoneHealing.needsRest(witch)||witch.healRetry>0||witch.destination||
      witch.attack||witch.attackOrder||witch.constructJob||witch.farmJob||
      witch.repairJob||witch.mineJob||witch.treeJob||witch.woodJob||
      nearestHostile(witch,stoneHealing.HOSTILE_SAFETY_DISTANCE)?.target)continue;
    const from=witch.root.position;
    const choice=stoneHealing.nearestCircle(from,circles.map(b=>({
      id:b.id,x:b.root.position.x,z:b.root.position.z
    })),b=>{
      const goal={x:b.x,z:b.z};
      return navigatorRTS.segmentClear(from,goal)||!!navigatorRTS.plan(from,goal);
    });
    if(!choice)continue;
    cancelSoulJob(witch);
    witch.berryJob=null;witch.healJob={id:choice.id};
    witch.route=null;witch.approachCache=null;
  }
}
function tickHealingRetreat(actor,dt){
  if(!actor.healJob)return false;
  if(actor.destination||actor.attackOrder||actor.constructJob||actor.farmJob||
    actor.repairJob||actor.mineJob||actor.treeJob||actor.woodJob){actor.healJob=null;return false;}
  const circle=buildingInstances.get(actor.healJob.id);
  if(!circle||circle.destroyed||stoneHealing.recovered(actor)){
    actor.healJob=null;return false;
  }
  const center=circle.root.position;
  if(Math.hypot(actor.root.position.x-center.x,actor.root.position.z-center.z)<.85){
    animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');return true;
  }
  const result=navigateActor(actor,center,dt,'order');
  if(result==='blocked'){
    actor.healJob=null;actor.healRetry=6;return false;
  }
  if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
  return true;
}

// One tiny shared geometry per projectile effect; bounded pool prevents
// ranged attacks from allocating geometry, texture or material per shot.
const boltGeometry=new THREE.SphereGeometry(.115,6,4);
const boltMaterials={witch:new THREE.MeshBasicMaterial({color:0x83b9ff}),
  orc:new THREE.MeshBasicMaterial({color:0xe2a269})};
const activeBolts=[],boltPool=[];
function interceptMagicWithWall(actor,target){
  // The glow is cosmetic but its impact is physical: a hostile stone rampart
  // intercepts bolts instead of letting ranged attacks damage a building or
  // unit behind it. Friendly ramparts do not absorb their own side's spells.
  if(actor.role!=='ranged'||!target)return target;
  const from={x:actor.root.position.x,z:actor.root.position.z};
  const to=isBuilding(target)?{
    x:(target.hitbox.minX+target.hitbox.maxX)/2,
    z:(target.hitbox.minZ+target.hitbox.maxZ)/2}:
    {x:target.root.position.x,z:target.root.position.z};
  const walls=[...buildingInstances.values()].filter(b=>b.type==='wall'&&
    !b.destroyed&&enemyOf(actor,b)&&b!==target);
  const dx=to.x-from.x,dz=to.z-from.z,denom=dx*dx+dz*dz;
  let first=null,order=Infinity;
  for(const wall of walls){
    if(!window.FightersFootprints.segmentBlocked(from,to,wall.hitbox))continue;
    const h=wall.hitbox,cx=(h.minX+h.maxX)/2,cz=(h.minZ+h.maxZ)/2;
    const t=denom>0?((cx-from.x)*dx+(cz-from.z)*dz)/denom:0;
    if(t<order){first=wall;order=t;}
  }
  return first||target;
}
function fireBolt(actor,target,duration){
  target=interceptMagicWithWall(actor,target);
  const mesh=boltPool.pop()||new THREE.Mesh(boltGeometry,boltMaterials[actor.kind]);
  mesh.material=boltMaterials[actor.kind];
  const start=actor.root.position.clone().add(new THREE.Vector3(0,1.3,0));
  const destination=isBuilding(target)?
    new THREE.Vector3((target.hitbox.minX+target.hitbox.maxX)/2,
      Math.min(target.hitbox.maxY,1.5),(target.hitbox.minZ+target.hitbox.maxZ)/2):
    target.root.position.clone().add(new THREE.Vector3(0,1.15,0));
  mesh.position.copy(start);scene.add(mesh);
  playEffect('magic',actor.root.position);
  activeBolts.push({mesh,start,destination,time:0,duration:Math.max(.1,duration)});
}
function tickBolts(dt){
  for(let i=activeBolts.length-1;i>=0;i--){
    const bolt=activeBolts[i];bolt.time+=dt;
    const t=clamp(bolt.time/bolt.duration,0,1);
    bolt.mesh.position.lerpVectors(bolt.start,bolt.destination,t);
    if(t>=1){
      scene.remove(bolt.mesh);activeBolts.splice(i,1);
      if(boltPool.length<24)boltPool.push(bolt.mesh);
    }
  }
}
function clearBolts(){
  for(const bolt of activeBolts)scene.remove(bolt.mesh);
  activeBolts.length=0;boltPool.length=0;
}
function tickRavenDistraction(actor,dt){
  if(!ravenModelLoaded||actor.kind!=='orc'||!roles.isFighter(actor)||!orcDirector.enabled)return false;
  actor.ravenCooldown=Math.max(0,(actor.ravenCooldown||0)-dt);
  if(!actor.ravenDistraction&&actor.ravenCooldown<=0){
    const bird=ravenFlock.nearestDecoy(actor.root.position,
      Math.min(actor.profile.sight,6.7));
    // An orc must actually have sight of the bird: no omniscient chasing.
    if(bird&&fogOfWar.visibleAt(bird.x,bird.z,'orc')){
      actor.ravenDistraction={id:bird.id,remaining:4.3+Math.random()*1.7};
      actor.ravenCooldown=11;
      actor.route=null;
    }
  }
  const distraction=actor.ravenDistraction;
  if(!distraction)return false;
  distraction.remaining-=dt;
  const bird=ravenFlock.ravens.find(raven=>raven.id===distraction.id);
  if(!bird||distraction.remaining<=0||
    Math.hypot(bird.x-actor.root.position.x,bird.z-actor.root.position.z)>11){
    actor.ravenDistraction=null;actor.route=null;return false;
  }
  const position={x:bird.x,z:bird.z};
  if(Math.hypot(position.x-actor.root.position.x,
    position.z-actor.root.position.z)>1.35){
    const result=navigateActor(actor,position,dt,'pursuit');
    if(result==='blocked'){
      actor.ravenDistraction=null;actor.ravenCooldown=11;actor.route=null;
      return false;
    }
    if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
  }else{
    faceDirection(actor,bird.x-actor.root.position.x,bird.z-actor.root.position.z);
    animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
  }
  // Ravens have no combat entity, hit points or damage receiver. Following
  // them consumes an orc's tactical time, but can never kill the familiar.
  return true;
}
function tickUnit(actor,dt){
  if(actor.dead){
    if(actor.orcFoodJob)cancelOrcFoodJob(actor);
    actor.deadTime-=dt;return;
  }
  if(qaPassiveKind===actor.kind)return;
  actor.defenseTime=Math.max(0,(actor.defenseTime||0)-dt);
  actor.workerRetryTime=Math.max(0,actor.workerRetryTime-dt);
  actor.unreachableTime=Math.max(0,actor.unreachableTime-dt);
  if(!actor.unreachableTime)actor.unreachableTarget=null;
  actor.approachAge+=dt;
  actor.stun=Math.max(0,actor.stun-dt);actor.cooldown=Math.max(0,actor.cooldown-dt);
  if(actor.attack){
    // Killing a building invalidates every unit's current attack; keep a local
    // action reference so an in-flight impact never dereferences a cleared slot.
    const action=actor.attack;
    action.elapsed+=dt;
    if(enemyOf(actor,action.target)){
      if(isBuilding(action.target))faceBuildingCenter(actor,action.target);
      else faceTarget(actor,action.target);
    }
    if(!action.landed&&action.elapsed>=action.impact){
      action.landed=true;
      const target=action.target;
      const range=actor.role==='ranged'?actor.profile.range+.3:
        isBuilding(target)?BUILDING_CONTACT+.22:actor.weapon?2.35:1.85;
      if(enemyOf(actor,target)&&targetDistance(actor,target)<range){
        dealDamage(interceptMagicWithWall(actor,target),actor.profile.damage,actor);
        if(actor.weapon&&actor.role!=='ranged')
          playEffect('swordHit',actor.root.position);
      }
    }
    if(actor.attack===action&&action.elapsed>=action.duration){
      actor.attack=null;animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop',true);
    }
    return;
  }
  if(actor.stun>0)return;
  if(!actor.raiding&&tickRavenDistraction(actor,dt))return;
  if(actor.attackOrder&&!enemyOf(actor,actor.attackOrder))actor.attackOrder=null;
  if(!actor.orcFoodJob)updateVillageDefense(actor);
  if(actor.raiding&&!actor.attackOrder&&!actor.orcFoodJob){
    actor.attackOrder=nextRaidBuilding(actor);
    if(actor.attackOrder){
      actor.destination=null;actor.route=null;actor.navWatch=null;
      actor.approachCache=null;
    }else if(!liveBuildings().some(b=>enemyOf(actor,b)))
      window.FightersRaiding.end(actor);
  }
  if(tickHealingRetreat(actor,dt))return;
  if(tickSoulHarvester(actor,dt))return;
  if(tickBerryForager(actor,dt))return;
  if(tickOrcForager(actor,dt))return;
  if(roles.isWorker(actor)){
    if(tickConstructWorker(actor,dt)||tickRepairWorker(actor,dt)||tickMineWorker(actor,dt)||
      tickTreeWorker(actor,dt)||tickWoodWorker(actor,dt)||tickGardenWorker(actor,dt))return;
    if(actor.destination){
      const result=navigateActor(actor,actor.destination,dt,'order');
      if(result==='arrived'){actor.destination=null;actor.route=null;}
      if(result==='blocked'){actor.destination=null;actor.route=null;actor.navWatch=null;}
      if(result!=='moving')animation(actor,'Idle_Loop');
    }else animation(actor,'Idle_Loop');
    return;
  }
  const retaliation=window.FightersRaiding.retaliation(actor,enemyOf);
  const explicit=retaliation||actor.attackOrder;
  // An explicit order already defines the target. Scanning every building's
  // detailed contour 60 times/second for each raider is wasted CPU work.
  const nearby=explicit?null:nearestHostile(actor,actor.profile.sight);
  const target=explicit||(nearby&&(!actor.destination||nearby.distance<2.7)?nearby.target:null);
  // Player-controlled squads hold formation on sight. When a building is
  // actually struck, alertVillageUnderAttack assigns a bounded defense order;
  // merely seeing a scout near the village must not break formation.
  const playerControlled=actor.kind==='witch'?!witchDirector.enabled:!orcDirector.enabled;
  const groupDefense=playerControlled&&
    !explicit&&!actor.destination&&
    nearby&&units.some(ally=>ally!==actor&&ally.kind===actor.kind&&!ally.dead&&
      Math.hypot(ally.root.position.x-actor.root.position.x,
        ally.root.position.z-actor.root.position.z)<=5.5);
  if(target){
    const distance=targetDistance(actor,target),
      range=actor.role==='ranged'?actor.profile.range:
        isBuilding(target)?BUILDING_CONTACT:actor.weapon?2.1:actor.profile.range;
    if(distance<=range){
      // Even while the attack cooldown ticks, stay at the physical wall.
      // Never advance to a stale goal or face another orc beside the target.
      if(isBuilding(target))faceBuildingCenter(actor,target);
      else faceTarget(actor,target);
      if(actor.cooldown>0){
        animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
        return;
      }
      const clipName=actor.weapon&&actor.clipCatalog.has('Sword_Attack')?'Sword_Attack':'Punch_Jab';
      const clip=actor.clipCatalog.get(clipName);
      if(clip){
        const duration=clip.duration;
        actor.attack={target,elapsed:0,impact:duration*.4,duration:duration+.13,landed:false};
        actor.cooldown=duration+rand(.45,.85);animation(actor,clipName,true);
        if(actor.weapon&&actor.role!=='ranged')
          playEffect('swordSwing',actor.root.position);
        if(actor.role==='ranged')fireBolt(actor,target,duration*.4);
      }
      return;
    }
    if(groupDefense){
      if(isBuilding(target))faceBuildingCenter(actor,target);
      else faceTarget(actor,target);
      animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      return;
    }
    const location=isBuilding(target)?approachBuilding(actor,target):target.root.position;
    if(location){
      const result=navigateActor(actor,location,dt,isBuilding(target)?'engage':'pursuit');
      if(result==='blocked'){
        actor.unreachableTarget=target;actor.unreachableTime=6;
        actor.navWatch=null;actor.route=null;actor.approachCache=null;
        if(retaliation===target){
          actor.retaliationTarget=null;actor.retaliationOrigin=null;
        }
        if(actor.attackOrder===target)actor.attackOrder=null;
        if(actor.defenseAnchor)returnFromDefense(actor);
      }
      if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
      return;
    }
  }
  if(actor.destination){
    const result=navigateActor(actor,actor.destination,dt,'order');
    if(result==='arrived'){actor.destination=null;actor.route=null;}
    if(result==='blocked'){actor.destination=null;actor.route=null;actor.navWatch=null;}
    if(result!=='moving')animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
  }else animation(actor,actor.weapon?'Sword_Idle':'Idle_Loop');
}
function stepOrcStrategy(dt){
  if(!orcDirector.enabled||!running||paused)return;
  if(buildingBlueprints.size<5||!witchHouse||witchBuilding.destroyed)return;
  strategyAccumulator+=dt;
  if(strategyAccumulator<.25)return;
  dt=strategyAccumulator;strategyAccumulator=0;
  // There is no passive mine income. Assign visible workers to real mines,
  // then credit gold ONLY after a miner completes a physical work cycle.
  assignMiners();
  assignOrcLumberjack();
  const aliveOrcs=units.filter(a=>a.kind==='orc'&&!a.dead);
  const enemyBaseKnown=knownEnemyBuildings.orc.has(witchBuilding.id);
  const scout=aliveOrcs.find(a=>roles.isFighter(a)&&a.scouting&&!a.raiding&&
    !a.attackOrder&&!a.orcFoodJob)||
    aliveOrcs.find(a=>roles.isFighter(a)&&!a.raiding&&!a.attackOrder&&
      !a.destination&&!a.orcFoodJob);
  const source=scout?.root.position;
  const scoutTarget=!enemyBaseKnown&&source&&!scout.destination?
    fogOfWar.frontier('orc',source,(x,z)=>{
      const goal={x,z};
      return navigatorRTS.pointClear(goal)&&
        (navigatorRTS.segmentClear(source,goal)||!!navigatorRTS.plan(source,goal));
    }):null;
  const context={
    ready:true,running,paused,gold:gold.orc,wood:wood.orc,
    buildings:[...buildingInstances.values()].filter(b=>!b.destroyed&&b.clanId==='orcs').map(b=>({
      id:b.id,type:b.type,level:b.level,queue:b.queue.map(j=>({kind:j.kind})),
      health:b.health,maxHealth:b.maxHealth,hitbox:b.hitbox,destroyed:b.destroyed,
      x:b.root.position.x,z:b.root.position.z,axis:b.wallAxis
    })),
    orcs:aliveOrcs.map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,
      health:u.health,maxHealth:u.maxHealth,dead:u.dead,
      role:u.role,attackOrder:!!u.attackOrder||!!u.raiding,mining:!!u.mineJob,
      scouting:!!u.scouting,destination:!!u.destination,foraging:!!u.orcFoodJob})),
    // Hidden witches cannot trigger omniscient defense orders.
    witches:units.filter(u=>u.kind==='witch'&&!u.dead&&
      fogOfWar.exploredAt(u.root.position.x,u.root.position.z,'orc')).map(u=>({
      id:u.id,x:u.root.position.x,z:u.root.position.z,role:u.role,dead:u.dead
    })),
    enemyBaseKnown,scoutTarget,unitCap:orcHousingCap(),
    populationCommitted:orcPopulationCommitted(),cauldronAvailable:orcMageUnlocked()
  };
  const actions=orcDirector.update(dt,context,validBuildPosition);
  aiCommands.orc(actions,{aliveOrcs,enemyBaseKnown});
}
function stepWitchStrategy(dt){
  if(!witchDirector.enabled||!running||paused||!witchHouse||witchBuilding.destroyed)return;
  witchStrategyAccumulator+=dt;
  if(witchStrategyAccumulator<.25)return;
  dt=witchStrategyAccumulator;witchStrategyAccumulator=0;
  assignMiners('witch');
  assignWitchLumberjack();
  const aliveWitches=units.filter(u=>u.kind==='witch'&&!u.dead);
  const buildings=liveBuildings().filter(b=>b.clanId==='witch');
  const knownOrcs=[...buildingInstances.values()].filter(b=>b.clanId==='orcs'&&
    !b.destroyed&&knownEnemyBuildings.witch.has(b.id));
  const enemyTarget=knownOrcs.sort((a,b)=>
    (a.type==='barrack'?0:1)-(b.type==='barrack'?0:1)||
    targetDistance({root:{position:witchBuilding.root.position}},a)-
      targetDistance({root:{position:witchBuilding.root.position}},b))[0]||null;
  const scout=aliveWitches.find(u=>roles.isFighter(u)&&u.scouting&&!u.raiding&&!u.attackOrder)||
    aliveWitches.find(u=>roles.isFighter(u)&&!u.raiding&&!u.attackOrder&&!u.destination);
  const source=scout?.root.position;
  const scoutTarget=!enemyTarget&&source&&!scout.destination?
    fogOfWar.frontier('witch',source,(x,z)=>{
      const goal={x,z};
      return navigatorRTS.pointClear(goal)&&
        (navigatorRTS.segmentClear(source,goal)||!!navigatorRTS.plan(source,goal));
    }):null;
  const state={ready:true,running,paused,gold:gold.witch,wood:wood.witch,
    food:farming.food,homeId:witchBuilding.id,circleUnlocked:circleUnlocked(),
    arcanistUnlocked:arcanistUnlocked(),
    pendingBuilds:pendingBuilds.filter(job=>buildFaction(job.type)==='witch')
      .map(job=>({type:job.type})),
    buildings:buildings.map(b=>({id:b.id,type:b.type,level:b.level,
      queue:b.queue.map(j=>({kind:j.kind})),health:b.health,
      maxHealth:b.maxHealth,hitbox:b.hitbox,destroyed:b.destroyed})),
    witches:aliveWitches.map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,
      role:u.role,health:u.health,maxHealth:u.maxHealth,scouting:!!u.scouting,
      attackOrder:!!u.attackOrder||!!u.raiding,destination:!!u.destination,
      mining:!!u.mineJob,repairing:!!u.repairJob,healing:!!u.healJob})),
    // No enemy positions or buildings outside the witches' own sight/memory.
    orcs:units.filter(u=>u.kind==='orc'&&!u.dead&&
      fogOfWar.visibleAt(u.root.position.x,u.root.position.z,'witch'))
      .map(u=>({id:u.id,x:u.root.position.x,z:u.root.position.z,role:u.role})),
    enemyTarget:enemyTarget?{id:enemyTarget.id}:null,scoutTarget,unitCap:17};
  const actions=witchDirector.update(dt,state,validBuildPosition);
  aiCommands.witch(actions,{aliveWitches,buildings,enemyTarget});
}
const FIXED_DT=window.FightersSimulation.FIXED_DT;
let accumulator=0,uiElapsed=0;
// Explicit, fixed-order simulation phases: adding a system no longer requires
// editing a monolithic tick loop. This list is compiled once at startup.
const stepGame=window.FightersSimulation.createStepper(
  ()=>ready&&running&&!paused,[
    ['production',stepProduction],
    ['magic regeneration',dt=>{
      magic=soulRules.magicAfterTime(magic,dt);
      orcMagic=soulRules.magicAfterTime(orcMagic,dt);
    }],
    ['witch dome',stepWitchDome],
    ['orc fire rain',stepFireRain],
    ['healing',stepHealing],
    ['soul assignments',assignSoulHarvesters],
    ['farming',stepFarming],
    ['orc food',stepOrcFood],
    ['orc strategy',stepOrcStrategy],
    ['witch strategy',stepWitchStrategy],
    ['defensive spells',stepSpellDefense],
    ['ravens',dt=>{
      if(ravenModelLoaded){
        ravenFlock.update(dt,units.filter(actor=>actor.kind==='orc'&&!actor.dead));
        tickRavenSounds();
      }
    }],
    ['units',dt=>{for(const actor of units)tickUnit(actor,dt);}],
    ['souls',stepSoulEffects],
    ['projectiles',tickBolts],
    ['sound effects',()=>effects.update()],
    ['crowd physics',dt=>window.FightersUnitPhysics.separate(units,navigatorRTS,UNIT_RADIUS,dt)],
    ['corpse cleanup',()=>{
      for(let i=units.length-1;i>=0;i--)if(units[i].dead&&units[i].deadTime<=0){
        releaseActor(units[i]);units.splice(i,1);
      }
      const corpses=units.filter(unit=>unit.dead);
      if(corpses.length>soulRules.MAX_CORPSES){
        corpses.sort((a,b)=>a.deadTime-b.deadTime);
        for(const corpse of corpses.slice(0,corpses.length-soulRules.MAX_CORPSES)){
          releaseActor(corpse);units.splice(units.indexOf(corpse),1);
        }
      }
    }],
    ['fog',dt=>{
      fogElapsed+=dt;
      if(fogElapsed>=.125){fogElapsed=0;updateVision();}
    }],
    ['hud',dt=>{
      uiElapsed+=dt;
      if(uiElapsed>.25){uiElapsed=0;refreshHUD();}
    }]
  ]);
function animateStoneCircles(dt){
  if(paused||!running)return;
  for(const circle of buildingInstances.values()){
    if(circle.type!=='stone-circle'||circle.destroyed)continue;
    const magic=circle.magic;
    magic.phase+=dt;
    const beat=Math.sin(magic.phase*2.4);
    magic.core.material.opacity=.21+.07*beat;
    magic.pulse.material.opacity=.56+.27*beat;
    magic.pulse.scale.setScalar(1+.065*beat);
    magic.glyphs.rotation.z+=dt*.12;
    magic.sparkles.rotation.y+=dt*.26;
    magic.sparkles.position.y=.06*Math.sin(magic.phase*1.7);
  }
}
function positionCamera(){
  cameraFollow=cameraControls.position(cameraFollow);
}
function frame(){
  requestAnimationFrame(frame);
  expireOrderPings();
  const dt=Math.min(clock.getDelta(),.25);
  for(const mixer of orcAnimationMixers)if(!paused&&isSceneDescendant(mixer.getRoot()))mixer.update(dt);
  accumulator=window.FightersSimulation.advanceFrame(accumulator,dt,stepGame);
  if(!paused)for(const actor of units){applyFacing(actor);actor.mixer.update(dt);}
  animateStoneCircles(dt);
  syncRavenVisuals(dt);
  syncHareVisuals();
  positionCamera();
  for(const building of buildingInstances.values())updateHealthBar(building);
  renderer.render(scene,camera);
  if(fogStarted){
    positionFogOverlay();
    renderer.autoClear=false;renderer.render(fogScene,fogCamera);renderer.autoClear=true;
  }
  minimapElapsed+=dt;
  if(minimapElapsed>=.18){minimapElapsed=0;drawMinimap();}
}
frame();
function touchAt(x,y,append=false){
  if(!running||paused||!$('overlay').hidden)return;
  const pos=worldPoint(x,y);
  if(!pos)return;
  if(ravenMoveMode){issueRavenMove(pos);return;}
  if(rallyMode){if(!setRally(selectedBuilding,pos))showBanner('EMPLACEMENT INVALIDE');return;}
  if(buildMode){if(!scheduleBuild(buildMode,pos.x,pos.z))
    showBanner('EMPLACEMENT INVALIDE / OUVRIER INDISPONIBLE');return;}
  // A sanctuary tap is a movement command while witches are selected.
  // Give it priority over flying ravens and silhouettes crossing the ring;
  // our own finished circles remain commandable even during fog refresh.
  if(!attackMode&&activeFaction==='witch'&&selected.size){
    const sanctuary=liveBuildings().find(b=>b.type==='stone-circle'&&
      b.clanId==='witch'&&!b.destroyed&&
      window.FightersFootprints.inside(pos,b.hitbox));
    if(sanctuary&&issueStoneCircleMove(sanctuary))return;
  }
  const raven=pickRaven(x,y);
  if(raven){selectRaven(raven);return;}
  const friend=pickUnit(x,y,false),building=pickBuilding(pos);
  const unit=pickUnit(x,y,true);
  const treeIndex=selected.size?pickTree(x,y):null;
  const logIndex=selected.size?pickLogBundle(x,y):null;
  const faction=activeFaction==='witch'?'witch':'orcs';
  // A selected unit needs only one more tap inside the hostile GLB footprint:
  // no separate target mode, and the polygon wins over nearby unit circles.
  if(selected.size){
    if(building&&orderRepair([...selected],building))return;
    if(building?.type==='mine'&&orderMine([...selected],building))return;
    if(building?.type==='garden'&&orderHarvest([...selected],building))return;
    if(building&&targetFaction(building)!==faction&&targetFaction(building)!=='neutral'&&
      orderAttack([...selected],building))return;
    if(unit&&targetFaction(unit)!==faction){
      orderAttack([...selected],unit);return;
    }
    if(treeIndex!==null&&orderChop([...selected],treeIndex))return;
    if(logIndex!==null&&orderCollectWood([...selected],logIndex))return;
  }
  if(attackMode){
    showBanner('CIBLE ENNEMIE REQUISE');return;
  }
  // The character silhouette wins over an overlapping house, while empty
  // space continues to use the building's exact flat X/Z footprint.
  if(friend){selectUnits([friend],append);return;}
  if(building){selectBuilding(building);return;}
  if(selectedRaven){issueRavenMove(pos);return;}
  if(selected.size){issueMove(pos);return;}
  clearSelection();
}
function selectRectangle(a,b,append=false){
  const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),
    top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
  // Rectangles intersect visible character silhouettes, not only the actor's
  // root pixel. A one-finger box on a small phone screen must not inexplicably
  // ignore a witch whose feet are just outside the rectangle.
  const actors=units.filter(u=>!u.dead&&u.kind===activeFaction).filter(u=>{
    const p=screenPoint(u),radius=viewport.clientWidth<760?11:7;
    return p.x+radius>=left&&p.x-radius<=right&&
      p.y+radius>=top&&p.y-radius<=bottom;
  });
  selectUnits(actors,append);
}
// All touch input uses one Pointer Events chain. No long-press timers and
// no pinch zoom. TWO simultaneous fingertips define a live selection rectangle.
let pointerStart=null;
let twoFingerBox=null;
let twoFingerAwaitRelease=false;
let lastTouchAt=-10000;
const touchGestureCounters={starts:0,boxes:0,selectedUnits:0,cancels:0};
function clearSelectionBox(){
  $('selection-rectangle').hidden=true;
}
function cancelPointerGesture(){
  pointerStart=null;
  clearSelectionBox();
}
function renderSelectionRectangle(start,x,y){
  const box=$('selection-rectangle'),rect=viewport.getBoundingClientRect();
  box.hidden=false;
  box.style.left=Math.min(start.x,x)-rect.left+'px';
  box.style.top=Math.min(start.y,y)-rect.top+'px';
  box.style.width=Math.max(10,Math.abs(x-start.x))+'px';
  box.style.height=Math.max(10,Math.abs(y-start.y))+'px';
}
function startTwoFingerSelection(){
  cancelPointerGesture();
  const fingers=[...activeTouches.entries()];
  if(fingers.length!==2)return;
  const [[aId,a],[bId,b]]=fingers;
  twoFingerBox={ids:[aId,bId],a:{...a},b:{...b}};
  twoFingerAwaitRelease=false;
  renderSelectionRectangle(a,b.x,b.y);
}
function updateTwoFingerSelection(){
  if(!twoFingerBox)return;
  const [aId,bId]=twoFingerBox.ids;
  // Keep the last observed position for each pointer so the box can be
  // completed reliably even if Safari releases the fingers one after another.
  if(activeTouches.has(aId))twoFingerBox.a={...activeTouches.get(aId)};
  if(activeTouches.has(bId))twoFingerBox.b={...activeTouches.get(bId)};
  renderSelectionRectangle(twoFingerBox.a,twoFingerBox.b.x,twoFingerBox.b.y);
}
function finishTwoFingerSelection(){
  if(!twoFingerBox)return;
  const {a,b}=twoFingerBox;
  twoFingerBox=null;
  twoFingerAwaitRelease=true;
  clearSelectionBox();
  if(!running||paused)return;
  selectRectangle(a,b,false);
  touchGestureCounters.boxes++;
  touchGestureCounters.selectedUnits=selected.size;
  showBanner(selected.size?
    selected.size+' UNITÉ'+(selected.size>1?'S':'')+' SÉLECTIONNÉE'+(selected.size>1?'S':''):
    'AUCUNE UNITÉ DANS LA ZONE');
}
function beginTouchPan(event){
  pointerStart={id:event.pointerId,type:'touch',mode:'tap',
    x:event.clientX,y:event.clientY,lastX:event.clientX,
    lastY:event.clientY};
  touchGestureCounters.starts++;
}
function updateTouchPan(event){
  const gesture=pointerStart;
  if(!gesture||gesture.id!==event.pointerId||twoFingerAwaitRelease)return;
  const x=event.clientX,y=event.clientY;
  if(gesture.mode==='tap'&&Math.hypot(x-gesture.x,y-gesture.y)>11)
    gesture.mode='pan';
  if(gesture.mode==='pan')
    panCamera(x-gesture.lastX,y-gesture.lastY);
  gesture.lastX=x;gesture.lastY=y;
}
viewport.addEventListener('pointerdown',event=>{
  if(event.target.closest('.command-panel')||event.target.closest('.hud'))return;
  if(!running||paused||!$('overlay').hidden)return;
  const touch=event.pointerType==='touch'||event.pointerType==='pen';
  if(!touch&&performance.now()-lastTouchAt<750)return;
  if(!touch&&![0,1,2].includes(event.button))return;
  event.preventDefault();
  if(touch){
    lastTouchAt=performance.now();
    activeTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(activeTouches.size===1&&!twoFingerAwaitRelease)
      beginTouchPan(event);
    else if(activeTouches.size===2)
      startTwoFingerSelection();
  }else if(event.button===1||event.button===2){
    cameraDrag={id:event.pointerId,x:event.clientX,y:event.clientY};
  }else{
    // Desktop still uses ordinary mouse-drag rectangle selection.
    pointerStart={id:event.pointerId,type:'mouse',x:event.clientX,
      y:event.clientY,lastX:event.clientX,lastY:event.clientY,
      shift:event.shiftKey,mode:'select'};
  }
  try{viewport.setPointerCapture(event.pointerId);}catch(e){}
});
viewport.addEventListener('pointermove',event=>{
  const id=event.pointerId;
  if(activeTouches.has(id)){
    lastTouchAt=performance.now();
    activeTouches.set(id,{x:event.clientX,y:event.clientY});
    if(twoFingerBox)updateTwoFingerSelection();
    else if(!twoFingerAwaitRelease&&activeTouches.size===1)
      updateTouchPan(event);
    return;
  }
  if(cameraDrag?.id===id){
    panCamera(event.clientX-cameraDrag.x,event.clientY-cameraDrag.y);
    cameraDrag.x=event.clientX;cameraDrag.y=event.clientY;return;
  }
  if(pointerStart?.id!==id||pointerStart.type!=='mouse')return;
  const gesture=pointerStart;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>8)
    renderSelectionRectangle(gesture,event.clientX,event.clientY);
  gesture.lastX=event.clientX;gesture.lastY=event.clientY;
});
function releasePointer(event){
  const id=event.pointerId;
  const isTouch=activeTouches.has(id);
  if(isTouch){
    lastTouchAt=performance.now();
    activeTouches.set(id,{x:event.clientX,y:event.clientY});
    if(twoFingerBox&&twoFingerBox.ids.includes(id)){
      updateTwoFingerSelection();
      finishTwoFingerSelection();
    }
    activeTouches.delete(id);
    // Once a two-finger box has finished, the leftover finger is NOT allowed
    // to issue a tap, an attack order or an accidental camera movement.
    if(!activeTouches.size)twoFingerAwaitRelease=false;
    if(twoFingerAwaitRelease){cancelPointerGesture();return;}
  }
  if(cameraDrag?.id===id){cameraDrag=null;return;}
  const gesture=pointerStart;
  if(!gesture||gesture.id!==id)return;
  cancelPointerGesture();
  if(gesture.type==='touch'){
    if(event.type!=='pointerup')touchGestureCounters.cancels++;
    if(event.type==='pointerup'&&gesture.mode==='tap'&&
      Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<16)
      touchAt(event.clientX,event.clientY);
    return;
  }
  if(event.type!=='pointerup')return;
  const distance=Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y);
  if(distance>15&&!buildMode&&!attackMode&&!ravenMoveMode)
    selectRectangle(gesture,{x:event.clientX,y:event.clientY},gesture.shift);
  else if(distance<16)
    touchAt(event.clientX,event.clientY,gesture.shift);
}
for(const name of ['pointerup','pointercancel','lostpointercapture'])
  viewport.addEventListener(name,releasePointer);
// Wheel input never changes the fixed scale. Prevent the browser from
// zooming the game canvas with Ctrl+wheel / trackpad pinch as well.
viewport.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
viewport.addEventListener('contextmenu',event=>event.preventDefault());

document.addEventListener('keydown',event=>{
  if(event.code==='Escape'){buildMode=null;rallyMode=false;constructionTab=false;
    attackMode=false;ravenMoveMode=false;clearSelection();refreshHUD();}
  if(event.code==='KeyP'&&!event.repeat)pauseGame();
  if(event.code==='KeyA'&&(event.ctrlKey||event.metaKey)){event.preventDefault();selectUnits(units.filter(a=>a.kind===activeFaction&&!a.dead));}
  if(event.code==='KeyW'&&event.altKey&&new URLSearchParams(location.search).has('qa'))changeFaction('witch');
  if(event.code==='KeyO'&&event.altKey&&new URLSearchParams(location.search).has('qa'))changeFaction('orc');
  if(event.code==='KeyF'&&selected.size){attackMode=true;refreshHUD();}
});
// Recover interrupted WebAudio during the next genuine player gesture.
// Browsers (particularly iOS Safari) can suspend audio after tab/app switching.
function resumeAudioFromPlayerGesture(){
  if(!running||paused)return;
  orcSound.resumeFromGesture();witchSound.resumeFromGesture();
}
document.addEventListener('pointerdown',resumeAudioFromPlayerGesture,{capture:true,passive:true});
document.addEventListener('keydown',resumeAudioFromPlayerGesture,{capture:true});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)resumeAudioFromPlayerGesture();
});
window.addEventListener('pageshow',resumeAudioFromPlayerGesture);
function pauseGame(){
  if(!running)return;
  paused=!paused;$('pause').textContent=paused?'▶':'Ⅱ';
  orcSound.setPaused(paused);
  witchSound.setPaused(paused);
  effects.setPaused(paused);
  showBanner(paused?'PAUSE':'REPRISE');refreshHUD();
}
$('pause').onclick=pauseGame;
$('choose-witch').onclick=()=>chooseFaction('witch');
$('choose-orc').onclick=()=>chooseFaction('orc');
$('start').onclick=()=>{
  if(!ready){location.reload();return;}
  if(chosenFaction==='orc'&&!orcVillage)return;
  // Unlock inside the user's click before the simulation begins.
  ravenSoundState.clear();
  orcSound.reset();witchSound.reset();effects.reset();
  orcSound.unlock();witchSound.unlock();effects.unlock();startSession();
};
document.addEventListener('contextmenu',event=>event.preventDefault(),{passive:false});
const loadingProfile={
  startedAt:performance.now(),readyMs:null,characters:{},downloadMs:null,
  compressed:false,steps:[]
};
const {fetchAsset,getBinary}=window.FightersAssets.create({loadingProfile});
async function load(){
  try{
    $('overlay-desc').textContent='Chargement des personnages optimisés…';
    $('load-bar').style.width='8%';
    // Both HTTP transfers run simultaneously, but expensive GLTF parsing stays
    // sequential to avoid a double peak of JS/GPU allocations on mobile.
    const characters=await Promise.all(['female','male'].map(gender=>
      getBinary('human_'+gender+'.rts.glb')));
    loadingProfile.downloadMs=Math.round(performance.now()-loadingProfile.startedAt);
    $('load-bar').style.width='42%';
    for(const [idx,gender] of ['female','male'].entries()){
      const file='human_'+gender+'.rts.glb',started=performance.now();
      const gltf=await loader.parseAsync(characters[idx],'');
      const required=['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Punch_Jab','Hit_Chest','Death01'];
      const gameClips=['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Punch_Jab',
        'Hit_Chest','Death01','Sword_Idle','Sword_Attack',
        'Farm_Harvest','Farm_PlantSeed','TreeChopping_Loop'];
      if(gltf.animations.length!==gameClips.length||
        gameClips.some(name=>!gltf.animations.some(clip=>clip.name===name)))
        throw Error('Clips de combat natifs invalides : '+file);
      const meshes=[];gltf.scene.traverse(node=>{if(node.isSkinnedMesh)meshes.push(node);});
      if(!meshes.length||meshes.some(mesh=>mesh.skeleton.bones.length<20))
        throw Error('Squelette natif invalide : '+file);
      if(gender==='female')female=gltf;else male=gltf;
      sharedClipCatalog.set(gender==='female'?'witch':'orc',new Map(gltf.animations.map(clip=>[clip.name,clip])));
      loadingProfile.characters[file].parseMs=Math.round(performance.now()-started);
      $('load-bar').style.width=(43+(idx+1)*15)+'%';
    }
    const files=['quaternius_outfit_Female_Peasant.glb',
      'quaternius_outfit_Male_Peasant.glb','quaternius_ubc_Hair_Buns.glb',
      'quaternius_ubc_Hair_Buzzed.glb','quaternius_ubc_Hair_SimpleParted.glb',
      'quaternius_ubc_Hair_Long.glb'];
    const garments=await Promise.all(files.map(async file=>
      loader.parseAsync(await getBinary(file),'') ));
    [clothingFemale,clothingMale,hairBuns,hairBuzzed,hairParted,hairLong]=garments;
    $('load-bar').style.width='90%';
    swordModel=await loader.loadAsync('./models/equipment.sword.arming.default.gltf?v=uncompressed-20261101');
    const grip=swordModel.scene.getObjectByName('grip');
    if(!grip||grip.position.length()>1e-5)throw Error('Épée native non calibrée');
    loadingProfile.readyMs=Math.round(performance.now()-loadingProfile.startedAt);
    loadingProfile.steps.push('characters_11_native_clips_parallel','native_rig_verified',
      'costumes_complete','sword_complete');
    ready=true;$('load-bar').style.width='100%';refreshStartButton();
    refreshHUD();
    if(new URLSearchParams(location.search).has('qa'))startSession();
    beginOrcVillageLoad();
  }catch(err){
    console.error(err);
    $('overlay-title').textContent='Erreur de chargement';
    $('overlay-desc').textContent=String(err.message||err)+'. Touchez Recharger pour réessayer.';
    $('start').disabled=false;$('start').textContent='↻ Recharger la page';
  }
}
function forestVisibleInViewport(){
  camera.updateMatrixWorld();
  let visible=0;
  for(const tree of forestLayout){
    if(tree.felled)continue;
    // Check the trunk, not the canopy. Its actual ground pixel must be within
    // the explored fog mask and the viewport, including on portrait phones.
    if(fogOfWar.sample(tree.x,tree.z,activeFaction).explored<.85)continue;
    const projected=new THREE.Vector3(tree.x,.15,tree.z).project(camera);
    if(Math.abs(projected.x)<.9&&Math.abs(projected.y)<.9&&
       projected.z>-1&&projected.z<1)visible++;
  }
  return visible;
}
// The browser-test control surface must not be reachable in a real match.
// Keeping its closures inside this guard also avoids building the harness
// object (and retaining its references) for regular players.
if(qaMode)window.__fightersQA={
  snapshot:()=>({
    loading:{...loadingProfile,characters:{...loadingProfile.characters}},
    forest:{instances:forestLayout.filter(tree=>!tree.felled).length,
      felled:forestLayout.filter(tree=>tree.felled).length,
      loadedSpecies:forestLoadedSpecies,woodBundleLoaded:!!woodBundleTemplate,
      logBundles:fallenLogBundles.size,
      trees:forestLayout.map((tree,index)=>({index,x:tree.x,z:tree.z,felled:!!tree.felled})),
      obstacleCount:forestObstacles.length,visibleInViewport:forestVisibleInViewport()},
    ravens:{loaded:ravenModelLoaded,animated:ravenVisuals.length,
      selectedId:selectedRaven?.id||null,orderMode:ravenMoveMode,
      scoutSight:window.FightersRavens.SCOUT_SIGHT,
      birds:ravenFlock.ravens.map(bird=>({id:bird.id,x:bird.x,y:bird.y,z:bird.z,
        mode:bird.mode,treeIndex:bird.treeIndex,scouting:!!bird.scoutCenter})),
      distractedOrcs:units.filter(unit=>unit.kind==='orc'&&!!unit.ravenDistraction).length},
    hares:{loaded:hareModelLoaded,models:hareVisuals.length,
      animals:hareField.hares.map((h,i)=>({id:h.id,x:h.x,z:h.z,active:h.active,
        moving:h.moving,hopPhase:h.hopPhase,hopHeight:orcFoodRules.hareAnimationPose(h,hareField.elapsed).height,
        renderedHeight:hareVisuals[i]?.position.y??null,
        respawnIn:h.respawnIn})),
      foragers:units.filter(u=>u.kind==='orc'&&u.orcFoodJob&&!u.dead).map(u=>({
        unitId:u.id,...u.orcFoodJob}))},
    orcFood:{...orcFood.snapshot(),housingCap:orcHousingCap(),
      populationCommitted:orcPopulationCommitted(),mageUnlocked:orcMageUnlocked()},
    ready,running,paused,activeFaction,cameraZoom,cameraCenter:{...cameraFollow},
    fog:{activeFaction,...fogOfWar.stats(activeFaction),
      exploredBrightness:fogShader.uniforms.exploredBrightness.value,
      enemyBaseKnownToOrcs:knownEnemyBuildings.orc.has(witchBuilding.id),
      orcExploredCells:fogOfWar.stats('orc').exploredCells},
    selectionRingStyle:{depthTest:sharedSelectionMaterials[activeFaction].depthTest,
      renderOrder:units.find(u=>u.kind===activeFaction)?.selectionRing.renderOrder??null},
    orcAI:orcDirector.snapshot(),witchAI:witchDirector.snapshot(),
    chosenFaction,qaPassiveKind,
    twoFingerSelection:twoFingerBox?{a:{...twoFingerBox.a},b:{...twoFingerBox.b}}:null,
    crops:{loaded:!!cropCatalog,loading:!!cropLoadPromise&&!cropCatalog&&!cropLoadError,
      transport:cropTransport,wireBytes:cropWireBytes,
      error:cropLoadError,templates:cropCatalog?[...cropCatalog.values()].flat().length:0,
      plots:[...buildingInstances.values()].filter(b=>b.type==='garden'&&!b.destroyed)
        .flatMap(b=>b.cropVisuals.map(v=>({stage:v.stage,
          real:!!v.variants,visible:v.variants?v.variants.filter(n=>n.visible).length:0,
          model:v.variants?v.variants.find(n=>n.visible)?.children[0]?.name:null})))},
    berries:{...wildBerries.snapshot(),real:!!cropCatalog?.get(1),batches:berryBatches.length,
      forageSight:window.FightersBerries.FORAGE_SIGHT,
      bushes:wildBerries.bushes.map(b=>({id:b.id,x:b.x,z:b.z,scale:b.scale,stage:b.stage,
        rendered:berryVisualStages[b.id]===b.stage})),
      foragers:units.filter(u=>u.berryJob&&!u.dead).map(u=>({id:u.id,
        index:u.berryJob.index,progress:u.berryJob.progress}))},
    healing:{modelLoaded:!!standingStoneModel,healPerSecond:stoneHealing.HEAL_PER_SECOND,
      healthPerMagic:stoneHealing.HEALTH_PER_MAGIC,
      circles:[...buildingInstances.values()].filter(b=>b.type==='stone-circle'&&!b.destroyed)
        .map(b=>({id:b.id,x:b.root.position.x,z:b.root.position.z,
          stones:b.root.children.filter(n=>n.name.startsWith('standing-stone-')).length,
          navigableCenter:navigatorRTS.pointClear(b.root.position)})),
      retreating:units.filter(u=>!!u.healJob&&!u.dead).map(u=>({id:u.id,circleId:u.healJob.id}))},
    souls:{magic,orcMagic,maxMagic:soulRules.MAX_MAGIC,perCorpse:soulRules.SOUL_VALUE,
      passiveMagicPer30Seconds:soulRules.PASSIVE_MAGIC_PER_30_SECONDS,
      corpseLifetime:soulRules.CORPSE_SECONDS,buildUnlocked:circleUnlocked(),
      arcanistUnlocked:arcanistUnlocked(),activeSpirits:soulEffects.length,
      spirits:soulEffects.map(e=>({sameGeometry:e.sameGeometry,samePose:e.samePose,
        sameTransform:e.sameTransform,meshCount:e.meshCount,
        skinnedCount:e.skinnedCount,scale:e.root.scale.x,
        x:e.root.position.x,y:e.root.position.y,z:e.root.position.z})),
      corpses:units.filter(u=>u.dead).map(u=>({id:u.id,clan:u.kind,
        x:u.root.position.x,z:u.root.position.z,remaining:u.deadTime,
        claimed:u.soulClaimed,reservedBy:u.soulReservedBy})),
      collecting:units.filter(u=>!!u.soulJob&&!u.dead).map(u=>({id:u.id,corpseId:u.soulJob.id}))},
    dome:{active:!!domeEffect,cost:domeRules.COST,maxRadius:domeRules.RADIUS,
      radius:domeEffect?.radius||0,elapsed:domeEffect?.elapsed||0,
      origin:domeEffect?{x:domeEffect.x,z:domeEffect.z}:null},
    fireRain:{active:!!fireEffect,cost:fireRules.COST,maxRadius:fireRules.RADIUS,
      radius:fireEffect?.radius||0,elapsed:fireEffect?.elapsed||0,
      origin:fireEffect?{x:fireEffect.x,z:fireEffect.z}:null},
    farming:{...farming.snapshot(),workers:units.filter(u=>u.farmJob&&!u.dead).map(u=>({
      id:u.id,gardenId:u.farmJob.gardenId,plotIndex:u.farmJob.plotIndex,
      phase:u.farmJob.phase,amount:u.farmJob.amount,carrying:!!u.carryWheat?.visible,
      progress:u.farmJob.progress,x:u.root.position.x,z:u.root.position.z}))},
    mining:{completedMiningCycles,totalMinedGold,workers:units.filter(u=>u.mineJob&&!u.dead).map(u=>({
      id:u.id,clan:u.kind,role:u.role,mineId:u.mineJob.mineId,phase:u.mineJob.phase,
      progress:u.mineJob.progress,amount:u.mineJob.amount,carrying:!!u.carryGold?.visible,
      x:u.root.position.x,z:u.root.position.z}))},
    forestry:{workers:units.filter(u=>u.treeJob&&!u.dead).map(u=>({
      id:u.id,clan:u.kind,index:u.treeJob.index,progress:u.treeJob.progress,
      x:u.root.position.x,z:u.root.position.z})),
      piles:[...woodDeposits].map(([index,deposit])=>({index,amount:deposit.amount,
        reservedBy:deposit.reservedBy,visible:fallenLogBundles.has(index)})),
      haulers:units.filter(u=>u.woodJob&&!u.dead).map(u=>({
        id:u.id,clan:u.kind,index:u.woodJob.index,phase:u.woodJob.phase,
        amount:u.woodJob.amount,carrying:!!u.carryBundle?.visible,
        x:u.root.position.x,z:u.root.position.z}))},
    construction:pendingBuilds.map(job=>({type:job.type,x:job.x,z:job.z,
      progress:job.progress,cost:job.cost,woodCost:job.woodCost,
      previewVisible:!!job.preview?.root.parent,
      previewPlantMeshes:job.type==='garden'&&job.preview?
        job.preview.root.children.filter(child=>child.isGroup).reduce((count,group)=>
          count+group.children.filter(child=>child.isMesh).length,0):null,
      revealFraction:job.preview?(job.preview.plane.constant-job.preview.bottom)/job.preview.height:0,
      workerId:units.find(u=>u.constructJob===job)?.id||null})),
    constructionPreviewCount:scene.children.filter(node=>node.userData.constructionPreview).length,
    repairs:units.filter(u=>u.repairJob&&!u.dead).map(u=>({
      workerId:u.id,clan:u.kind,buildingId:u.repairJob.buildingId,
      x:u.root.position.x,z:u.root.position.z})),
    gpu:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
      drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles},
    assets:{sourceRigs:sharedClipCatalog.size,sharedMaterials:sharedCostumeMaterials.size,
      sharedProjectiles:boltPool.length+activeBolts.length,activeProjectiles:activeBolts.length,
      roleModelsLoaded:0},
    activeTouches:activeTouches.size,
    mixers:orcAnimationMixers.length,
    worldHealthBars:scene.children.filter(node=>node.name?.startsWith('healthbar-world-')).length,
    touchGesture:twoFingerBox?'two-finger-select':pointerStart?.mode||null,
    touchGestureCounters:{...touchGestureCounters},
    selectionRectangleVisible:!$('selection-rectangle').hidden,
    visibleSelectionRings:units.filter(u=>u.kind===activeFaction&&!u.dead&&u.selectionRing.visible).length,
    ui:{...uiStats,activePings:activeOrderPings.size,
      commandButtonCount:$('command-buttons').children.length,
      persistentButtons:[],
      queueButtons:$('training-progress').querySelectorAll('button').length,
      orderPrompt:$('order-prompt').hidden?'':$('order-prompt').textContent},
    gold:{...gold},wood:{...wood},projection:camera.isOrthographicCamera?'orthographic':'perspective',
    cameraQuaternion:camera.quaternion.toArray(),
    witches:units.filter(a=>a.kind==='witch'&&!a.dead).map(a=>({
      id:a.id,role:a.role,hairStyle:a.outfitInfo.hairStyle,hairColor:a.outfitInfo.hairColor,
      x:a.root.position.x,z:a.root.position.z,radius:a.radius,health:a.health,animation:a.current,
      workTool:a.workTool?.name||null,workToolVisible:!!a.workTool?.visible,
      hammerTool:a.hammerTool?.name||null,hammerToolVisible:!!a.hammerTool?.visible,
      pickTool:a.pickTool?.name||null,pickToolVisible:!!a.pickTool?.visible,
      chopTool:a.chopTool?.name||null,chopToolVisible:!!a.chopTool?.visible,
      visible:a.root.visible,berryTarget:a.berryJob?.index??null,
      repairTargetId:a.repairJob?.buildingId||null,
      healingTarget:a.healJob?.id||null,
      heading:{...a.heading},combatTargetId:a.attack?.target?.id||null,
      destination:a.destination?{...a.destination}:null,pathLength:a.route?.waypoints.length??0,
      approachPoint:a.approachCache?.point||null,attackDistance:a.attackOrder?targetDistance(a,a.attackOrder):null,
      routeGoal:a.routeGoal||null,attackCooldown:a.cooldown,
      attackTargetId:a.attackOrder?.id||null,raiding:!!a.raiding,
      retaliationTargetId:a.retaliationTarget?.id||null,
      defenseAnchor:a.defenseAnchor?{x:a.defenseAnchor.x,z:a.defenseAnchor.z}:null,
      navStalls:a.navWatch?.stalls||0
    })),
    orcs:units.filter(a=>a.kind==='orc'&&!a.dead).map(a=>({
      id:a.id,role:a.role,x:a.root.position.x,z:a.root.position.z,health:a.health,animation:a.current,
      workTool:a.workTool?.name||null,workToolVisible:!!a.workTool?.visible,
      hammerTool:a.hammerTool?.name||null,hammerToolVisible:!!a.hammerTool?.visible,
      pickTool:a.pickTool?.name||null,pickToolVisible:!!a.pickTool?.visible,
      chopTool:a.chopTool?.name||null,chopToolVisible:!!a.chopTool?.visible,
      visible:a.root.visible,
      repairTargetId:a.repairJob?.buildingId||null,
      foodTarget:a.orcFoodJob?{...a.orcFoodJob}:null,
      heading:{...a.heading},combatTargetId:a.attack?.target?.id||null,
      attackTargetId:a.attackOrder?.id||null,raiding:!!a.raiding,
      retaliationTargetId:a.retaliationTarget?.id||null,
      miningTargetId:a.mineJob?.mineId||null,
      destination:a.destination?{...a.destination}:null,pathLength:a.route?.waypoints.length??0,
      scouting:!!a.scouting,
      defenseAnchor:a.defenseAnchor?{x:a.defenseAnchor.x,z:a.defenseAnchor.z}:null,
      navStalls:a.navWatch?.stalls||0
    })),
    selectedIds:[...selected].map(a=>a.id),selectedBuilding:selectedBuilding?.kind||selectedBuilding?.type||null,
    selectedBuildingId:selectedBuilding?.id||null,
    trainingCount:witchBuilding.queue.filter(j=>j.kind==='witch').length,
    trainElapsed:witchBuilding.progress,house:{id:witchBuilding.id,level:witchBuilding.level,
      health:witchBuilding.health,maxHealth:witchBuilding.maxHealth,
      hitbox:{...witchBuilding.hitbox},queue:witchBuilding.queue.map(j=>({...j})),destroyed:witchBuilding.destroyed},
    buildMode,rallyMode,constructionTab,navVersion:navigatorRTS.version,
    buildings:[...buildingInstances.values()].map(b=>({
      id:b.id,type:b.type,clanId:b.clanId,level:b.level,visualLevel:b.visualLevel,
      x:b.root.position.x,z:b.root.position.z,hitbox:{...b.hitbox},
      queue:b.queue.map(j=>({...j})),initial:b.initial,destroyed:b.destroyed,
      destructible:b.type!=='mine'&&b.clanId!=='neutral',
      health:b.health,maxHealth:b.maxHealth,
      healthbarParent:b.healthBar?(b.healthBar.root.parent===scene?'scene':'incorrect'):null,
      healthbarQuaternion:b.healthBar?b.healthBar.root.quaternion.toArray():null,
      healthbarPosition:b.healthBar?b.healthBar.root.position.toArray():null,
      healthbarVisible:b.healthBar?.root.visible??false,
      healthbarFillScale:b.healthBar?.fill.scale.x??null,
      healthbarFillOffset:b.healthBar?.fill.position.x??null
    })),
    blueprints:[...buildingBlueprints.keys()],witchHouseLoaded:!!witchHouse
  }),
  train:issueTrain,trainOrc:(role='melee')=>issueOrcTrain(selectedBuilding,role),
  trainRole:(clan,role)=>{
    const building=clan==='witch'?witchBuilding:
      [...buildingInstances.values()].find(b=>b.type==='barrack'&&!b.destroyed);
    return building?queueOrder(building,clan,role):false;
  },
  orderHarvest:(index,gardenId)=>{
    const worker=units.filter(u=>u.kind==='witch'&&!u.dead)[index];
    return worker?orderHarvest([worker],buildingInstances.get(gardenId)):false;
  },
  orderMine:(kind,index,mineId)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const mine=buildingInstances.get(mineId);
    return actor?orderMine([actor],mine):false;
  },
  orderRepair:(kind,index,buildingId)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const building=buildingId===witchBuilding.id?witchBuilding:buildingInstances.get(buildingId);
    return actor?orderRepair([actor],building):false;
  },
  orderChop:(kind,index,treeIndex)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    return actor?orderChop([actor],treeIndex):false;
  },
  orderCollectWood:(kind,index,treeIndex)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    return actor?orderCollectWood([actor],treeIndex):false;
  },
  treeScreenPoint:index=>{
    const tree=forestLayout[index];
    if(!tree||tree.felled)return null;
    const rect=viewport.getBoundingClientRect();
    const p=new THREE.Vector3(tree.x,tree.height*.35,tree.z).project(camera);
    return {x:rect.left+(p.x+1)*rect.width/2,
      y:rect.top+(1-p.y)*rect.height/2};
  },
  orderBuild:(type,x,z)=>scheduleBuild(type,x,z),
  buildGarden:(x,z)=>buildGarden(x,z),
  buildStoneCircle:(x,z)=>buildStoneCircle(x,z),
  setFood:value=>{farming.food=Math.max(0,Number(value)||0);refreshHUD();},
  setOrcFood:value=>{orcFood.food=Math.max(0,Number(value)||0);refreshHUD();},
  placeHareNearOrc:(hareIndex=0,orcIndex=0)=>{
    const hare=hareField.hares[hareIndex],orc=units.filter(u=>u.kind==='orc'&&!u.dead)[orcIndex];
    if(!hare||!orc)return false;
    const p=navigatorRTS.findSafeGoal({x:orc.root.position.x-.5,z:orc.root.position.z-.5});
    if(!p)return false;
    hare.x=p.x;hare.z=p.z;hare.active=true;hare.turnIn=3;hare.respawnIn=0;
    syncHareVisuals();return true;
  },
  spawnWitchCorpseNearOrc:(orcIndex=0,byOrc=false)=>{
    const orc=units.filter(u=>u.kind==='orc'&&!u.dead)[orcIndex];
    if(!orc)return null;
    const position=orc.root.position;
    const witch=spawnUnit('witch',position.x+.4,position.z+.4,0,'melee');
    dealDamage(witch,witch.health,byOrc?orc:null);
    return witch.id;
  },
  setWood:(clan,value)=>{if(clan==='witch'||clan==='orc'){
    wood[clan]=Math.max(0,Math.floor(Number(value)||0));refreshHUD();}},
  setBerryStage:(index,stage)=>{
    const bush=wildBerries.bushes[index];
    if(!bush||![1,2,3].includes(stage))return false;
    bush.stage=stage;bush.elapsed=0;syncBerryVisuals();return true;
  },
  auditRigSharing:(kind)=>{
    const actors=units.filter(u=>u.kind===kind&&!u.dead);
    const meshes=actors.map(a=>{
      let body=null,garment=null;
      a.visual.traverse(o=>{
        if(o.isSkinnedMesh&&o.name===(kind==='witch'?'Superhero_Female':'SuperHero_Male'))body=o;
        if(o.userData.costumeLayer==='garment'&&!garment)garment=o;
      });
      return {body,garment};
    });
    return {units:actors.length,roles:[...new Set(actors.map(a=>a.role))],
      bodyGeometryShared:meshes.every(m=>m.body?.geometry===meshes[0]?.body?.geometry),
      outfitGeometryShared:meshes.every(m=>m.garment?.geometry===meshes[0]?.garment?.geometry),
      uniqueOutfitMaterials:new Set(meshes.map(m=>m.garment?.material)).size};
  },
  auditOrcAppearance:()=>units.filter(a=>a.kind==='orc'&&!a.dead).map(actor=>{
    let body=null;const garments=[];
    actor.visual.traverse(o=>{
      if(o.isSkinnedMesh&&o.name==='SuperHero_Male')body=o;
      if(o.userData.costumeLayer==='garment')garments.push(o);
    });
    const skin=Array.isArray(body?.material)?body.material[0]:body?.material;
    const socket=actor.weapon?.socket||actor.workTool?.parent;
    return {role:actor.role,skinColor:skin?.color?.getHex(),
      glow:skin?.emissive?.getHex(),glowIntensity:skin?.emissiveIntensity,
      bones:body?.skeleton.bones.length,
      garmentMeshes:garments.length,
      bulkyMeshes:garments.filter(m=>m.geometry.userData.orcBulky).length,
      changedVertices:garments.reduce((n,m)=>n+(m.geometry.userData.orcChangedVertices||0),0),
      socketOnOriginalHand:socket?socket.parent?.name==='hand_r':null,
      skeletonScaleUnchanged:body?.skeleton.bones.every(b=>b.scale.distanceTo(new THREE.Vector3(1,1,1))<1e-6)};
  }),
  spawnWitches:(targetCount=20)=>{
    let total=units.filter(u=>u.kind==='witch'&&!u.dead).length;
    while(total<Math.min(35,targetCount)){
      const place=safeSpawnNear(witchBuilding);
      if(!place)break;
      spawnUnit('witch',place.x,place.z,total);total++;
    }
    return total;
  },
  skeletonResources:()=>{
    // Native rigged costumes share an actor's skeleton, but different actors
    // must own independent Skeleton/DataTexture instances. Inspect the real
    // render resources rather than inferring them from all scene textures.
    const skeletons=new Set();
    for(const actor of units)actor.visual.traverse(node=>{
      if(node.isSkinnedMesh&&node.skeleton)skeletons.add(node.skeleton);
    });
    const boneTextures=[...skeletons].map(skeleton=>skeleton.boneTexture).filter(Boolean);
    return {actors:units.length,skeletons:skeletons.size,
      boneTextures:boneTextures.length,
      uniqueBoneTextures:new Set(boneTextures).size};
  },
  minimapGroundVisibilityAt:(x,z)=>{
    drawMinimap();
    return minimapGroundFog.sample(x,z,activeFaction).visible;
  },
  prewarmSkeletonTextures:()=>{
    // Test-only: force a real WebGL upload for every actor's bone texture.
    // The live renderer allocates these lazily only for visible SkinnedMeshes;
    // a camera-dependent leak test would miss off-screen characters.
    const skeletons=new Set();
    for(const actor of units)actor.visual.traverse(node=>{
      if(node.isSkinnedMesh&&node.skeleton)skeletons.add(node.skeleton);
    });
    let allocated=0;
    for(const skeleton of skeletons){
      if(!skeleton.boneTexture){skeleton.computeBoneTexture();allocated++;}
      renderer.initTexture(skeleton.boneTexture);
    }
    return {skeletons:skeletons.size,allocated};
  },
  spawnOrcSiege:()=>{
    // Multi-ranged raid from clear positions around the witch headquarters.
    // Unlike a one-unit near-wall test, this exercises concurrent navigation.
    const spots=[[-7,-14],[-8,-18],[-9,-10],[-12,-23],
      [-4,-12],[-6,-20],[-7,-8],[-10,-25]];
    const squad=[];
    for(const [x,z] of spots){
      if(!navigatorRTS.pointClear({x,z}))continue;
      squad.push(spawnUnit('orc',x,z,units.length+1,'ranged'));
    }
    if(squad.length)orderAttack(squad,witchBuilding);
    return squad.length;
  },
  auditUnreachableSiege:(kind,index,id)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const building=[witchBuilding,...buildingInstances.values()].find(b=>b.id===id);
    if(!actor||!building||building.destroyed)throw Error('QA siege target missing');
    const previous={approachCache:actor.approachCache,approachAge:actor.approachAge,
      route:actor.route,routeGoal:actor.routeGoal,routeVersion:actor.routeVersion,
      routeAge:actor.routeAge};
    const originalPlan=navigatorRTS.plan,originalSegment=navigatorRTS.segmentClear;
    let attempts=0;
    try{
      navigatorRTS.segmentClear=()=>false;
      navigatorRTS.plan=()=>{attempts++;return null;};
      actor.approachCache=null;actor.approachAge=Infinity;
      for(let i=0;i<120;i++){actor.approachAge+=FIXED_DT;approachBuilding(actor,building);}
      const approachPlans=attempts;attempts=0;
      actor.route=null;actor.routeGoal=null;actor.routeVersion=-1;actor.routeAge=0;
      const goal={x:actor.root.position.x+10,z:actor.root.position.z+10};
      for(let i=0;i<120;i++)navigateActor(actor,goal,FIXED_DT,'order');
      return {approachPlans,routePlans:attempts,seconds:2};
    }finally{
      navigatorRTS.plan=originalPlan;navigatorRTS.segmentClear=originalSegment;
      Object.assign(actor,previous);
    }
  },
  auditBuildingApproach:(kind,index,id,iterations=12)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const building=[witchBuilding,...buildingInstances.values()].find(b=>b.id===id);
    if(!actor||!building||building.destroyed)throw Error('QA approach target missing');
    const sites=buildingPerimeterSites(building,UNIT_RADIUS+.14);
    const before=sites.length,originalCache=actor.approachCache,originalAge=actor.approachAge;
    let available=0;
    try{
      for(let i=0;i<Math.min(40,iterations);i++){
        actor.approachCache=null;actor.approachAge=Infinity;
        if(approachBuilding(actor,building))available++;
      }
    }finally{actor.approachCache=originalCache;actor.approachAge=originalAge;}
    return {before,after:sites.length,available};
  },
  attackBuilding:id=>orderAttack([...selected],[witchBuilding,...buildingInstances.values()].find(b=>b.id===id)),
  attackUnit:id=>orderAttack([...selected],units.find(u=>u.id===id)),
  strikeBuilding:(attackerKind,attackerIndex,id,amount=5)=>{
    const attacker=units.filter(u=>u.kind===attackerKind&&!u.dead)[attackerIndex];
    const building=[witchBuilding,...buildingInstances.values()].find(b=>b.id===id);
    if(!attacker||!building||!enemyOf(attacker,building))return false;
    damageBuilding(building,amount,attacker);return true;
  },
  placeUnit:(kind,index,x,z)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    if(!actor||!navigatorRTS.pointClear({x,z}))return false;
    actor.root.position.set(x,0,z);actor.route=null;actor.routeAge=0;
    actor.destination=null;return true;
  },
  placeUnitBesideBuilding:(kind,index,id)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const building=[witchBuilding,...buildingInstances.values()].find(b=>b.id===id&&!b.destroyed);
    const point=building&&buildingPerimeterSites(building,UNIT_RADIUS+.14)[0];
    if(!actor||!point)return false;
    actor.root.position.set(point.x,0,point.z);
    actor.route=null;actor.routeAge=0;actor.destination=null;
    updateVision();return true;
  },
  strikeUnit:(attackerKind,attackerIndex,victimKind,victimIndex,amount=5)=>{
    const attacker=units.filter(u=>u.kind===attackerKind&&!u.dead)[attackerIndex];
    const victim=units.filter(u=>u.kind===victimKind&&!u.dead)[victimIndex];
    if(!attacker||!victim||!enemyOf(attacker,victim))return false;
    dealDamage(victim,amount,attacker);return true;
  },
  damageBuilding:(id,amount)=>{
    const b=[witchBuilding,...buildingInstances.values()].find(v=>v.id===id);
    if(b)damageBuilding(b,amount,null);
  },
  setBuildingHealth:(id,value)=>{
    const b=[witchBuilding,...buildingInstances.values()].find(v=>v.id===id);
    if(b&&!b.destroyed&&b.clanId!=='neutral'&&b.type!=='mine'){
      b.health=Math.max(1,Math.min(b.maxHealth,value));updateHealthBar(b);
    }
  },
  setUnitHealth:(kind,index,value)=>{
    const witch=units.filter(u=>u.kind===kind&&!u.dead)[index];
    if(!witch)return false;
    witch.health=Math.max(1,Math.min(witch.maxHealth,Number(value)));
    return true;
  },
  spawnTestCorpseNearArcanist:()=>{
    const arcanist=units.find(u=>u.kind==='witch'&&u.role==='ranged'&&!u.dead);
    if(!arcanist)return null;
    arcanist.destination=null;arcanist.attackOrder=null;arcanist.healJob=null;
    arcanist.berryJob=null;cancelSoulJob(arcanist);
    const origin=arcanist.root.position;
    // The test fixture must not land inside a menhir or a house collider.
    const place=Array.from({length:16},(_,i)=>({
      x:origin.x+1.1*Math.cos(i*Math.PI/8),
      z:origin.z+1.1*Math.sin(i*Math.PI/8)
    })).find(point=>navigatorRTS.pointClear(point)&&
      navigatorRTS.segmentClear(origin,point))||{x:origin.x,z:origin.z};
    const actor=spawnUnit('orc',place.x,place.z,units.length,'worker');
    dealDamage(actor,actor.maxHealth,null);
    return actor.id;
  },
  passive:kind=>{qaPassiveKind=kind||null;},
  enableOrcAI:value=>{orcDirector.enabled=!!value;orcDirector.reset();orcIncomeFraction=0;refreshHUD();},
  enableWitchAI:value=>{witchDirector.enabled=!!value;witchDirector.reset();refreshHUD();},
  upgradeHouse:()=>issueUpgrade(witchBuilding),
  castDome:id=>castWitchDome(id?[witchBuilding,...buildingInstances.values()]
    .find(b=>b.id===id):selectedBuilding),
  castFireRain:id=>castFireRain(id?[...buildingInstances.values()]
    .find(b=>b.id===id):selectedBuilding),
  setMagic:value=>{if(!Number.isFinite(value))return false;
    magic=Math.max(0,Math.min(soulRules.MAX_MAGIC,value));refreshHUD();return true;},
  setOrcMagic:value=>{if(!Number.isFinite(value))return false;
    orcMagic=Math.max(0,Math.min(soulRules.MAX_MAGIC,value));refreshHUD();return true;},
  upgradeSelected:()=>issueUpgrade(selectedBuilding),
  upgradeBuilding:id=>issueUpgrade([witchBuilding,...buildingInstances.values()]
    .find(b=>b.id===id)),
  cancel:(index=0)=>cancelOrder(selectedBuilding,index),
  selectHouse:()=>selectBuilding(witchBuilding),
  selectBuildingById:id=>{
    const building=[witchBuilding,...buildingInstances.values()].find(b=>b.id===id);
    if(building&&!building.destroyed)selectBuilding(building);
  },
  selectWitches:()=>selectUnits(units.filter(a=>a.kind==='witch'&&!a.dead)),
  selectOrcs:()=>selectUnits(units.filter(a=>a.kind==='orc'&&!a.dead)),
  selectOrcBarrack:()=>{
    const building=[...buildingInstances.values()].find(b=>b.type==='barrack');
    if(building)selectBuilding(building);
  },
  move:(x,z)=>issueMove({x,z}),
  selectUnit:(kind,index)=>{
    const a=units.filter(u=>u.kind===kind&&!u.dead)[index];
    if(a)selectUnits([a]);
  },
  tap:(x,y)=>touchAt(x,y),
  unitScreenPoint:(kind,index)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    return actor?screenPoint(actor):null;
  },
  centerCamera:(x,z)=>{cameraFollow.x=x;cameraFollow.z=z;positionCamera();},
  mapToWorld:arena.toWorld,
  mapCorners:()=>arena.corners().map(point=>screenGroundPoint(point.x,point.z)),
  clearPings:clearOrderPings,
  auditTravel:(kind,index,seconds)=>{
    const a=units.filter(u=>u.kind===kind&&!u.dead)[index];
    if(!a)throw Error('Missing audit actor');
    const first={x:a.root.position.x,z:a.root.position.z};
    let blocked=0,steps=0;
    for(let i=0;i<Math.ceil(seconds/FIXED_DT);i++){
      stepGame(FIXED_DT);steps++;
      if(!navigatorRTS.pointClear(a.root.position))blocked++;
    }
    return {start:first,end:{x:a.root.position.x,z:a.root.position.z},blocked,steps};
  },
  fogAt:(x,z,clan=activeFaction)=>fogOfWar.sample(x,z,clan),
  sendRaven:(x,z)=>ravenFlock.orderMove(ravenFlock.ravens[0]?.id,{x,z}),
  selectRaven:index=>selectRaven(ravenFlock.ravens[index]),
  moveUnitTo:(kind,index,x,z)=>{
    const u=units.filter(a=>a.kind===kind&&!a.dead)[index];
    if(!u)throw Error('QA unit not found');
    const point={x,z};
    if(!navigatorRTS.pointClear(point))throw Error('QA position blocked');
    u.root.position.set(x,0,z);u.destination=null;u.route=null;
    updateVision();return u.id;
  },
  isClear:(x,z)=>navigatorRTS.pointClear({x,z}),
  route:(from,to)=>navigatorRTS.plan(from,to),
  setFaction:changeFaction,beginBuild,build:(type,x,z)=>type==='garden'?buildGarden(x,z):
    type==='stone-circle'?buildStoneCircle(x,z):buildOrc(type,x,z),
  buildWall:(x,z,axis)=>buildWall(x,z,{axis}),
  scheduleConstruction:(type,x,z,axis)=>scheduleBuild(type,x,z,{axis}),
  magicIntercept:(kind,index,targetId)=>{
    const actor=units.filter(u=>u.kind===kind&&!u.dead)[index];
    const target=liveBuildings().find(b=>b.id===targetId);
    return actor&&target?interceptMagicWithWall(actor,target)?.id:null;
  },
  canBuild:(x,z,type)=>validBuildPosition(x,z,type),
  canBuildAxis:(x,z,type,axis)=>validBuildPosition(x,z,type,axis),
  setRally:(x,z)=>setRally(selectedBuilding,{x,z}),
  sound:()=>orcSound.snapshot(),
  witchSound:()=>witchSound.snapshot(),
  effects:()=>effects.snapshot(),
  pan:(x,y)=>panCamera(x,y),
  groundScreenPoint:screenGroundPoint,
  buildingScreenPoint:(id)=>{
    const building=liveBuildings().find(v=>v.id===id);
    if(!building)return null;
    const h=building.hitbox,geometry=window.FightersFootprints;
    const midX=(h.minX+h.maxX)/2,midZ=(h.minZ+h.maxZ)/2;
    let target=geometry.inside({x:midX,z:midZ},h)?{x:midX,z:midZ}:null;
    if(!target){
      let closest=Infinity;
      for(let i=1;i<40;i++)for(let j=1;j<40;j++){
        const x=h.minX+(h.maxX-h.minX)*i/40;
        const z=h.minZ+(h.maxZ-h.minZ)*j/40;
        if(!geometry.inside({x,z},h))continue;
        const d=Math.hypot(x-midX,z-midZ);
        if(d<closest){closest=d;target={x,z};}
      }
    }
    return target?screenGroundPoint(target.x,target.z):null;
  },
  advance:(seconds)=>{
    const n=Math.ceil(seconds/FIXED_DT);
    for(let i=0;i<n;i++){
      stepGame(FIXED_DT);
      for(const actor of units)actor.mixer.update(FIXED_DT);
    }
    syncHareVisuals();
  },
  pause:pauseGame,reset:startSession
};
load();
