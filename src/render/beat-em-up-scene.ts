import {
  AmbientLight, BoxGeometry, CapsuleGeometry, Color, DirectionalLight, Fog, Group,
  HemisphereLight, Mesh, MeshStandardMaterial, PCFSoftShadowMap, Scene,
  SphereGeometry, SRGBColorSpace, WebGLRenderer,
} from "three";
import type { BeatActor, BeatStage, BeatWorldState } from "../engine/beat-em-up-world.ts";
import type { ScrollBounds, ScrollCameraFrame, WorldToScreenProjection } from "./beat-scroll-camera.ts";
import { makeBeatCamera, placeBeatCamera } from "./beat-camera-three.ts";

const meters = (mm: number): number => mm / 1000;

function diagnosticActor(color: number): Group {
  const root = new Group();
  const body = new Mesh(new CapsuleGeometry(0.31, 1.08, 6, 12),
    new MeshStandardMaterial({ color, roughness: 0.67 }));
  body.position.y = 0.85;
  body.castShadow = true;
  const front = new Mesh(new SphereGeometry(0.12, 10, 8),
    new MeshStandardMaterial({ color: 0x101620, emissive: 0x202530 }));
  front.position.set(0.32, 1.27, 0);
  const marker = new Mesh(new BoxGeometry(0.4, 0.12, 0.12),
    new MeshStandardMaterial({ color: 0xf7d46d, emissive: 0x614500 }));
  marker.position.set(0.42, 1, 0);
  root.add(body, front, marker);
  return root;
}

/** Diagnostic scene only: no model, combat, or visual quality is represented as final. */
export class BeatEmUpScene {
  readonly scene = new Scene();
  readonly camera = makeBeatCamera();
  readonly renderer: WebGLRenderer;
  private readonly visuals = new Map<string, Group>();
  private readonly stage: BeatStage;
  private readonly projection: WorldToScreenProjection;
  private readonly bounds: ScrollBounds;
  private readonly heroId: string;
  private readonly viewportCanvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, stage: BeatStage, projection: WorldToScreenProjection,
    bounds: ScrollBounds, actors: readonly BeatActor[], heroId: string) {
    this.stage = stage;
    this.projection = projection;
    this.bounds = bounds;
    this.heroId = heroId;
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
      const visual = diagnosticActor(actor.id === heroId ? 0x62c6ee : 0xec8076);
      this.visuals.set(actor.id, visual);
      this.scene.add(visual);
    }
    this.resize(canvas.clientWidth || 960, canvas.clientHeight || 540);
  }

  private addStageVolumes(): void {
    for (const [index, p] of this.stage.platforms.entries()) {
      const width = meters(p.rightMm - p.leftMm);
      const depth = meters(p.farMm - p.nearMm);
      const height = Math.max(0.16, meters(p.topMm) + 0.16);
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
        visual.scale.x = actor.facing;
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

  dispose(): void {
    this.scene.traverse(object => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach(material => material.dispose());
      }
    });
    this.visuals.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.viewportCanvas.width = 0;
  }
}
