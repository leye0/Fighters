import {
  AgXToneMapping, AmbientLight, AnimationAction, AnimationMixer, Color, LoopOnce, LoopRepeat,
  DirectionalLight, FogExp2, Group, HemisphereLight, Mesh,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene,
  SRGBColorSpace, WebGLRenderer, PCFSoftShadowMap, Texture,
  type Material, type Object3D, type AnimationClip,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { TICKS_PER_SECOND, type FighterDefinition, type FighterState, type MatchDefinition, type MatchState, type StageDefinition } from "../engine/simulation.ts";
import type { RuntimeFighterAsset } from "../assets/eligibility.ts";
import { qualityProfile, renderPixelRatio, type QualityPreset } from "./quality.ts";
import { animationClipName } from "./animation-map.ts";
import { missingAnimationClipNames } from "./clip-coverage.ts";
import { maskClip, type BodyLayer } from "./animation-layers.ts";

interface FighterVisual {
  readonly root: Group;
  readonly mixer: AnimationMixer;
  readonly clips: ReadonlyMap<string, AnimationClip>;
  readonly configuration: RuntimeFighterAsset;
  readonly maskedClips: Map<string, AnimationClip>;
  baseAction: AnimationAction | null;
  baseKey: string | null;
  overlayAction: AnimationAction | null;
  overlayKey: string | null;
}

function disposeMaterial(material: Material): void {
  // A glTF's material texture maps are owned by the loaded scene.
  for (const candidate of Object.values(material)) {
    if (candidate instanceof Texture) candidate.dispose();
  }
  material.dispose();
}

/**
 * Purely visual world. None of its animation states or raycasts may modify
 * the authoritative combat rules. One world unit is one meter.
 */
export class ThreeWorld {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(43, 16 / 9, 0.05, 250);
  readonly renderer: WebGLRenderer;
  private readonly loader = new GLTFLoader();
  private readonly fighterVisuals = new Map<string, FighterVisual>();
  private readonly stageRoot = new Group();
  private readonly stage: StageDefinition;
  private readonly maxAnisotropy: number;
  private cameraX = 0;
  private cameraDistance = 13;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, stage: StageDefinition, preset: QualityPreset = "ultra") {
    this.stage = stage;
    const quality = qualityProfile(preset);
    this.maxAnisotropy = quality.maxAnisotropy;
    this.renderer = new WebGLRenderer({
      canvas, antialias: true, alpha: false, powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(renderPixelRatio(preset, window.devicePixelRatio));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = AgXToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.scene.background = new Color("#111924");
    this.scene.fog = new FogExp2("#111924", 0.013);

    const sky = new HemisphereLight(0xc9e5ff, 0x443627, 1.7);
    const fill = new AmbientLight(0x8ea8cb, 0.24);
    const key = new DirectionalLight(0xffe5c3, 3.2);
    key.position.set(-4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 10;
    key.shadow.camera.bottom = -10;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.00012;
    key.shadow.normalBias = 0.025;
    this.scene.add(sky, fill, key);
    this.scene.add(this.stageRoot);
    this.createReferenceGround();
    this.camera.position.set(0, 3.3, this.cameraDistance);
    this.camera.lookAt(0, 1.25, 0);
    this.resize(canvas.clientWidth, canvas.clientHeight);
  }

  /**
   * Collision-plane reference, not final arena art. It remains separate from
   * asset-loaded environment meshes and never affects combat physics.
   */
  private createReferenceGround(): void {
    const width = (this.stage.rightMm - this.stage.leftMm) / 1000;
    const geometry = new PlaneGeometry(width + 4, 8);
    const material = new MeshStandardMaterial({
      color: 0x373c43, metalness: 0.14, roughness: 0.82,
    });
    const floor = new Mesh(geometry, material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    floor.receiveShadow = true;
    this.stageRoot.add(floor);
  }

  resize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  async loadFighter(asset: RuntimeFighterAsset): Promise<void> {
    if (this.disposed) throw new Error("World has been disposed");
    if (this.fighterVisuals.has(asset.id)) return;
    const gltf = await this.loader.loadAsync(asset.runtimeUrl);
    if (this.disposed) {
      gltf.scene.traverse(object => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(disposeMaterial);
        }
      });
      return;
    }
    const root = new Group();
    const scale = asset.visual?.metersPerUnit ?? 1;
    gltf.scene.scale.setScalar(scale);
    root.add(gltf.scene);
    gltf.scene.traverse(object => {
      if (object instanceof Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          for (const candidate of Object.values(material)) {
            if (candidate instanceof Texture) {
              candidate.anisotropy = Math.min(
                this.maxAnisotropy, this.renderer.capabilities.getMaxAnisotropy(),
              );
              candidate.needsUpdate = true;
            }
          }
        }
      }
    });
    const mixer = new AnimationMixer(gltf.scene);
    const clips = new Map(gltf.animations.map(clip => [clip.name, clip]));
    this.scene.add(root);
    this.fighterVisuals.set(asset.id, {
      root, mixer, clips, configuration: asset,
      maskedClips: new Map(), baseAction: null, baseKey: null,
      overlayAction: null, overlayKey: null,
    });
  }

  /** Refuse a match whose certified attacks or essential reactions lack real GLB clips. */
  assertFighterAnimationCoverage(definition: FighterDefinition): void {
    const visual = this.fighterVisuals.get(definition.id);
    if (!visual) throw new Error("Missing fighter visual: " + definition.id);
    const missing = missingAnimationClipNames(
      definition, new Set(visual.clips.keys()), visual.configuration.visual?.animationMap,
    );
    if (missing.length) {
      throw new Error("Missing real animation clips for " + definition.id + ": " + [...new Set(missing)].join(", "));
    }
    const mapping = visual.configuration.visual?.animationMap;
    for (const move of definition.moves.filter(candidate => candidate.animationLayer === "upperBody")) {
      const name = mapping?.[move.id] ?? (move.animationRole ? mapping?.[move.animationRole] : undefined) ??
        move.animationRole ?? move.id;
      const attack = visual.clips.get(name);
      if (!attack) throw new Error("Missing real layered attack: " + name);
      this.maskedClip(visual, attack, "upperBody");
    }
    if (definition.moves.some(move => move.animationLayer === "upperBody")) {
      const needsBackstep = definition.moves.some(move =>
        move.animationLayer === "upperBody" && (move.groundMovementPercent ?? 0) > 0);
      for (const name of ["idle", "walk", "jump", ...(needsBackstep ? ["walkBack"] : [])]) {
        const clipName = mapping?.[name] ?? name;
        const locomotion = visual.clips.get(clipName);
        if (!locomotion) throw new Error("Missing layered locomotion: " + clipName);
        this.maskedClip(visual, locomotion, "lowerBody");
      }
    }
  }

  private maskedClip(visual: FighterVisual, clip: AnimationClip, layer: BodyLayer): AnimationClip {
    const key = clip.name + "@" + layer;
    let masked = visual.maskedClips.get(key);
    if (!masked) {
      masked = maskClip(clip, layer);
      visual.maskedClips.set(key, masked);
    }
    return masked;
  }

  private playLayer(
    visual: FighterVisual, layer: "base" | "overlay", key: string | null,
    clip: AnimationClip | null, looping: boolean, duration: number | null = null,
  ): void {
    const keyField = layer === "base" ? "baseKey" : "overlayKey";
    const actionField = layer === "base" ? "baseAction" : "overlayAction";
    if (visual[keyField] === key) return;
    const prior = visual[actionField];
    visual[keyField] = key;
    if (!clip) {
      prior?.fadeOut(0.12);
      visual[actionField] = null;
      return;
    }
    const next = visual.mixer.clipAction(clip);
    next.setLoop(looping ? LoopRepeat : LoopOnce, looping ? Infinity : 1);
    next.clampWhenFinished = !looping;
    next.setEffectiveTimeScale(duration && duration > 0 && clip.duration > 0
      ? clip.duration / duration : 1);
    next.reset().fadeIn(0.12).play();
    if (prior && prior !== next) prior.fadeOut(0.12);
    visual[actionField] = next;
  }

  private updateAnimation(
    visual: FighterVisual, fighter: FighterState, previous: FighterState,
    definition?: FighterDefinition,
  ): void {
    const move = fighter.action === "attack"
      ? definition?.moves.find(candidate => candidate.id === fighter.moveId) : undefined;
    const mapped = animationClipName(fighter, definition, visual.configuration.visual?.animationMap);
    const clip = mapped ? visual.clips.get(mapped) : undefined;
    if (fighter.action === "attack" && move?.animationLayer === "upperBody") {
      if (!clip) {
        // Never manufacture a strike from locomotion when its certified clip is absent.
        this.playLayer(visual, "base", null, null, false);
        this.playLayer(visual, "overlay", null, null, false);
        return;
      }
      const horizontal = fighter.xMm - previous.xMm;
      const locomotion = fighter.yMm > 0 ? "jump" : horizontal === 0 ? "idle" :
        horizontal * fighter.facing < 0 ? "walkBack" : "walk";
      const mapping = visual.configuration.visual?.animationMap;
      const mappedLocomotion = mapping?.[locomotion] ?? locomotion;
      const baseClip = visual.clips.get(mappedLocomotion);
      if (!baseClip) {
        this.playLayer(visual, "base", null, null, false);
        this.playLayer(visual, "overlay", null, null, false);
        return;
      }
      const duration = (move.startupTicks + move.activeTicks + move.recoveryTicks) / TICKS_PER_SECOND;
      this.playLayer(visual, "base", "locomotion:" + locomotion + ":" + mappedLocomotion,
        this.maskedClip(visual, baseClip, "lowerBody"), locomotion !== "jump");
      this.playLayer(visual, "overlay", "attack:" + fighter.moveId + ":" + mapped,
        this.maskedClip(visual, clip, "upperBody"), false, duration);
      return;
    }
    this.playLayer(visual, "overlay", null, null, false);
    const key = fighter.action === "attack" ? fighter.moveId : fighter.action;
    const looping = fighter.action === "idle" || fighter.action === "walk" || fighter.action === "crouch";
    const duration = move ? (move.startupTicks + move.activeTicks + move.recoveryTicks) / TICKS_PER_SECOND : null;
    // A full-body clip remains exclusive unless an approved move opts into layering.
    this.playLayer(visual, "base", key, clip ?? null, looping, duration);
  }

  sync(previous: MatchState, current: MatchState, alpha: number, deltaSeconds: number, definition?: MatchDefinition): void {
    const blend = Math.max(0, Math.min(1, alpha));
    for (let index = 0; index < current.fighters.length; index++) {
      const fighter = current.fighters[index];
      const old = previous.fighters[index];
      const visual = this.fighterVisuals.get(fighter.id);
      if (!visual) continue;
      visual.root.position.set(
        (old.xMm + (fighter.xMm - old.xMm) * blend) / 1000,
        (old.yMm + (fighter.yMm - old.yMm) * blend) / 1000, 0,
      );
      const axis = visual.configuration.visual?.modelForwardAxis ?? "+Z";
      const adjustment = axis === "+Z" ? 0 : axis === "-Z" ? Math.PI : axis === "+X" ? -Math.PI / 2 : Math.PI / 2;
      visual.root.rotation.y = (fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2) + adjustment;
      this.updateAnimation(visual, fighter, old, definition?.fighters[index]);
      visual.mixer.update(Math.min(0.05, deltaSeconds));
    }
    const [a, b] = current.fighters;
    const targetX = (a.xMm + b.xMm) / 2000;
    const separationMeters = Math.abs(a.xMm - b.xMm) / 1000;
    const targetDistance = Math.max(12, Math.min(24, 10.5 + separationMeters * 0.85));
    this.cameraX += (targetX - this.cameraX) * Math.min(1, deltaSeconds * 5);
    this.cameraDistance += (targetDistance - this.cameraDistance) * Math.min(1, deltaSeconds * 4);
    this.camera.position.set(this.cameraX, 3.3, this.cameraDistance);
    this.camera.lookAt(this.cameraX, 1.3, 0);
  }

  render(): void {
    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  metrics(): { calls: number; triangles: number; textures: number } {
    return {
      calls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      textures: this.renderer.info.memory.textures,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const visual of this.fighterVisuals.values()) {
      visual.mixer.stopAllAction();
      visual.root.traverse((object: Object3D) => {
        if (!(object instanceof Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(disposeMaterial);
      });
      this.scene.remove(visual.root);
    }
    this.fighterVisuals.clear();
    this.stageRoot.traverse((object: Object3D) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(disposeMaterial);
    });
    this.renderer.dispose();
  }
}
