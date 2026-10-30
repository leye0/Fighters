import {
  AmbientLight, AnimationClip, AnimationMixer, BoxGeometry, Color, DirectionalLight, Fog, Group,
  HemisphereLight, Material, Mesh, MeshStandardMaterial, PCFSoftShadowMap, Scene,
  SRGBColorSpace, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { BeatActor, BeatStage, BeatWorldState } from "../engine/beat-em-up-world.ts";
import type { ScrollBounds, ScrollCameraFrame, WorldToScreenProjection } from "./beat-scroll-camera.ts";
import { makeBeatCamera, placeBeatCamera } from "./beat-camera-three.ts";
import { CHARACTER_MODEL_FILES, fitRigToActor, requireSkinnedRig,
  type AcquiredCharacterKey } from "./rigged-character.ts";
import { playEmbeddedMotion, retargetEmbeddedMotion } from "./character-motion.ts";
import { BeatCharacterAnimator, canAnimateRealGameMotions } from "./beat-character-animator.ts";

const meters = (mm: number): number => mm / 1000;

/** Diagnostic navigation scene: real rigs, but no certified combat clips yet. */
export class BeatEmUpScene {
  readonly scene = new Scene();
  readonly camera = makeBeatCamera();
  readonly renderer: WebGLRenderer;
  private readonly visuals = new Map<string, Group>();
  private readonly mixers = new Map<string, AnimationMixer>();
  private readonly gameAnimators = new Map<string, BeatCharacterAnimator>();
  private readonly stage: BeatStage;
  private readonly projection: WorldToScreenProjection;
  private readonly bounds: ScrollBounds;
  private readonly heroId: string;
  private readonly actorIds: readonly string[];
  private readonly initialActors: readonly BeatActor[];
  private readonly viewportCanvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, stage: BeatStage, projection: WorldToScreenProjection,
    bounds: ScrollBounds, actors: readonly BeatActor[], heroId: string) {
    this.stage = stage;
    this.projection = projection;
    this.bounds = bounds;
    this.heroId = heroId;
    this.actorIds = actors.map(actor => actor.id);
    this.initialActors = actors;
    this.viewportCanvas = canvas;
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.scene.background = new Color(0x141c2b);
    this.scene.fog = new Fog(0x141c2b, 22, 65);
    this.scene.add(new HemisphereLight(0xd8e9ff, 0x394253, 2.5));
    this.scene.add(new AmbientLight(0xb5c3dc, 0.5));
    const sun = new DirectionalLight(0xffedd1, 3);
    sun.position.set(-5, 13, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    this.addStageVolumes();
    for (const actor of actors) {
      const visual = new Group();
      this.visuals.set(actor.id, visual);
      this.scene.add(visual);
    }
    this.resize(canvas.clientWidth || 960, canvas.clientHeight || 540);
  }

  /**
   * Load actual skinned GLB humans for every actor. There are no capsule
   * fallbacks: a missing/invalid asset fails the preview visibly.
   * Repeated enemies clone the same cached skeleton, not a static mesh clone.
   */
  async loadActorModels(
    roleModels: Readonly<{ hero: AcquiredCharacterKey; enemy: AcquiredCharacterKey }>,
  ): Promise<void> {
    const loader = new GLTFLoader();
    const keys = new Set<AcquiredCharacterKey>([roleModels.hero, roleModels.enemy]);
    const sources = new Map<AcquiredCharacterKey, Group>();
    const animations = new Map<AcquiredCharacterKey, AnimationClip[]>();
    await Promise.all([...keys].map(async key => {
      const url = new URL(CHARACTER_MODEL_FILES[key], document.baseURI).href;
      const gltf = await loader.loadAsync(url);
      requireSkinnedRig(gltf.scene);
      sources.set(key, gltf.scene);
      animations.set(key, gltf.animations);
    }));
    const enemySource = sources.get(roleModels.enemy);
    const sourceAnimation = animations.get(roleModels.enemy)?.[0];
    if (!enemySource || !sourceAnimation) {
      throw new Error("The acquired enemy model has no real animation to test");
    }
    for (const actorId of this.actorIds) {
      const isHero = actorId === this.heroId;
      const key = isHero ? roleModels.hero : roleModels.enemy;
      const source = sources.get(key);
      const visual = this.visuals.get(actorId);
      if (!source || !visual) throw new Error("Character asset mapping is incomplete");
      const clone = cloneSkeleton(source) as Group;
      const holder = new Group();
      holder.add(clone);
      fitRigToActor(holder, isHero ? 1.73 : 1.80);
      clone.traverse(object => {
        if (object instanceof Mesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      visual.add(holder);
      const ownClips = animations.get(key) ?? [];
      if (canAnimateRealGameMotions(ownClips)) {
        const actor = this.actorIds.indexOf(actorId);
        const initial = this.initialActors[actor];
        this.gameAnimators.set(actorId,
          new BeatCharacterAnimator(visual, clone, ownClips, initial.facing, isHero,
            this.stage.gravityMmPerTick2));
      } else {
        // Compatibility while the agent-driven Mixamo packaging action runs.
        const mixer = isHero
          ? retargetEmbeddedMotion(clone, enemySource, sourceAnimation).mixer
          : playEmbeddedMotion(clone, sourceAnimation);
        this.mixers.set(actorId, mixer);
      }
    }
  }

  updateAnimations(elapsedSeconds: number, previous: BeatWorldState, current: BeatWorldState): void {
    for (const mixer of this.mixers.values()) mixer.update(Math.max(0, Math.min(0.05, elapsedSeconds)));
    const preceding = new Map(previous.actors.map(actor => [actor.id, actor]));
    for (const actor of current.actors) {
      const animator = this.gameAnimators.get(actor.id);
      if (animator) animator.update(preceding.get(actor.id) ?? actor, actor, elapsedSeconds);
    }
  }

  private addStageVolumes(): void {
    for (const [index, p] of this.stage.platforms.entries()) {
      const width = meters(p.rightMm - p.leftMm);
      const depth = meters(p.farMm - p.nearMm);
      // A one-way walkway is a visible thin ledge; ordinary roofs and bins
      // are solid volumes and cannot be dropped through.
      const height = p.dropThrough ? 0.20 : Math.max(0.16, meters(p.topMm) + 0.16);
      const mesh = new Mesh(new BoxGeometry(width, height, depth),
        new MeshStandardMaterial({
          color: [0x343e50, 0x9e7a56, 0x566e76][index % 3],
          roughness: 0.9, metalness: 0.02,
        }));
      mesh.position.set(meters((p.leftMm + p.rightMm) / 2), meters(p.topMm) - height / 2,
        meters((p.nearMm + p.farMm) / 2));
      mesh.receiveShadow = true;
      mesh.castShadow = p.topMm > 0;
      this.scene.add(mesh);
    }
    // Sparse depth and progress marks make scrolling observable, not final art.
    const lineMaterial = new MeshStandardMaterial({ color: 0x71839c, roughness: 1 });
    for (let x = this.stage.leftMm + 2000; x < this.stage.rightMm; x += 3000) {
      const dash = new Mesh(new BoxGeometry(0.8, 0.025, 0.045), lineMaterial);
      dash.position.set(meters(x), 0.014, 3.3);
      this.scene.add(dash);
    }
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render(previous: BeatWorldState, current: BeatWorldState, alpha: number): ScrollCameraFrame {
    const previousById = new Map(previous.actors.map(a => [a.id, a]));
    const interp = (a: number, b: number) => Math.round(a + (b - a) * alpha);
    let heroFocus: { xMm: number; depthMm: number; heightMm: number } | null = null;
    for (const actor of current.actors) {
      const prior = previousById.get(actor.id) ?? actor;
      const focus = {
        xMm: interp(prior.xMm, actor.xMm),
        depthMm: interp(prior.depthMm, actor.depthMm),
        heightMm: interp(prior.heightMm, actor.heightMm),
      };
      const visual = this.visuals.get(actor.id);
      if (visual) {
        visual.position.set(meters(focus.xMm), meters(focus.heightMm), meters(focus.depthMm));
        if (!this.gameAnimators.has(actor.id)) {
          visual.rotation.y = actor.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
        }
        visual.visible = actor.alive;
      }
      if (actor.id === this.heroId) heroFocus = focus;
    }
    if (!heroFocus) throw new Error("Diagnostic hero missing");
    const frame = placeBeatCamera(this.camera, heroFocus, this.projection, this.bounds);
    this.renderer.render(this.scene, this.camera);
    return frame;
  }

  get metrics(): Readonly<{ drawCalls: number; triangles: number }> {
    return { drawCalls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
  }

  get animationMode(): string {
    return this.gameAnimators.size === this.actorIds.length
      ? "Mixamo : garde + vraie marche + recul + demi-tour + saut/chute"
      : "clip source de diagnostic (pack Mixamo non déployé)";
  }

  dispose(): void {
    const geometries = new Set<Mesh["geometry"]>();
    const materials = new Set<Material>();
    this.scene.traverse(object => {
      if (object instanceof Mesh) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.visuals.clear();
    for (const mixer of this.mixers.values()) mixer.stopAllAction();
    this.mixers.clear();
    for (const animator of this.gameAnimators.values()) animator.dispose();
    this.gameAnimators.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.viewportCanvas.width = 0;
  }
}
