import "./beat-em-up.css";
import { createBeatWorld, stepBeatWorld, type BeatWorldState } from "./engine/beat-em-up-world.ts";
import { BeatControls } from "./input/beat-input.ts";
import { demoEnemyInputs } from "./game/beat-enemy-ai.ts";
import { BEAT_PROJECTION, DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE,
  diagnosticScrollBounds } from "./game/beat-stage.ts";
import { BeatEmUpScene } from "./render/beat-em-up-scene.ts";

declare global {
  interface Window {
    __fightersBeatReady?: boolean;
    __fightersBeatTick?: number;
    __fightersBeatCamera?: { x: number; vertical: number; pinned: string[] };
  }
}

const get = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error("Missing beat'em up element: " + id);
  return element as T;
};

const canvas = get<HTMLCanvasElement>("beat-canvas");
const viewport = get<HTMLElement>("beat-viewport");
const diagnostics = get<HTMLElement>("beat-diagnostics");
const status = get<HTMLElement>("beat-status");
const toggle = get<HTMLButtonElement>("beat-debug-toggle");
const landscapeButton = get<HTMLButtonElement>("beat-landscape-lock");
const orientationGate = get<HTMLElement>("beat-orientation-gate");

// Mobile browsers, especially iOS Safari, may refuse to lock orientation.
// The fullscreen request is best-effort, while the portrait gate is mandatory.
landscapeButton.addEventListener("click", () => {
  void (async () => {
    try {
      const viewport = get<HTMLElement>("beat-viewport");
      if (viewport.requestFullscreen && !document.fullscreenElement) {
        await viewport.requestFullscreen();
      }
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (orientation: "landscape") => Promise<void>;
      };
      await orientation?.lock?.("landscape");
    } catch {
      get<HTMLElement>("beat-status").textContent =
        "Tourne le téléphone horizontalement ; le verrouillage automatique n'est pas offert ici.";
    }
  })();
});

orientationGate.addEventListener("contextmenu", event => event.preventDefault());
viewport.addEventListener("contextmenu", event => event.preventDefault());

async function startBeatScene(): Promise<void> {
  const scene = new BeatEmUpScene(canvas, DIAGNOSTIC_STAGE, BEAT_PROJECTION,
    diagnosticScrollBounds(DIAGNOSTIC_STAGE, BEAT_PROJECTION), DIAGNOSTIC_ACTORS, "hero");
  status.textContent = "Chargement des vrais personnages 3D riggés…";
  try {
    await scene.loadActorModels({ hero: "claudia", enemy: "realistic-man" });
  } catch (error) {
    scene.dispose();
    throw error;
  }
  const controls = new BeatControls(document.body);
  const resize = new ResizeObserver(() => scene.resize(viewport.clientWidth, viewport.clientHeight));
  resize.observe(viewport);
  let previous: BeatWorldState = createBeatWorld(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
  let current = previous;
  let accumulator = 0;
  let lastTime = performance.now();
  let frameCount = 0;
  let frameWindow = lastTime;
  let framesPerSecond = 0;
  let active = true;
  const tickDuration = 1000 / 60;
  toggle.addEventListener("click", () => {
    diagnostics.hidden = !diagnostics.hidden;
    toggle.setAttribute("aria-pressed", String(!diagnostics.hidden));
  });

  function frame(now: number): void {
    if (!active) return;
    if (window.matchMedia("(orientation: portrait)").matches) {
      controls.reset();
      lastTime = now;
      accumulator = 0;
      window.__fightersBeatReady = false;
      status.textContent = "Mode paysage requis : tourne ton téléphone pour continuer.";
      requestAnimationFrame(frame);
      return;
    }
    const elapsedMs = Math.min(250, Math.max(0, now - lastTime));
    accumulator += elapsedMs;
    lastTime = now;
    while (accumulator >= tickDuration) {
      previous = current;
      current = stepBeatWorld(current, {
        ...demoEnemyInputs(current, DIAGNOSTIC_STAGE),
        hero: controls.snapshot(),
      }, DIAGNOSTIC_STAGE);
      accumulator -= tickDuration;
    }
    scene.updateAnimations(elapsedMs / 1000, previous, current);
    const camera = scene.render(previous, current, accumulator / tickDuration);
    window.__fightersBeatReady = true;
    window.__fightersBeatTick = current.tick;
    window.__fightersBeatCamera = {
      x: camera.center.xMm, vertical: camera.center.verticalMm,
      pinned: Object.entries(camera.pinned).filter(([, pinned]) => pinned).map(([side]) => side),
    };
    frameCount++;
    if (now - frameWindow >= 400) {
      framesPerSecond = Math.round(frameCount * 1000 / (now - frameWindow));
      frameWindow = now;
      frameCount = 0;
      const hero = current.actors.find(actor => actor.id === "hero")!;
      const pinned = Object.entries(camera.pinned).filter(([, value]) => value)
        .map(([key]) => key).join(", ") || "aucun";
      diagnostics.textContent = `Tick ${current.tick} · ${framesPerSecond} FPS · ` +
        `X ${hero.xMm} · Z ${hero.depthMm} · Y ${hero.heightMm} mm\n` +
        `Vitesse Y ${hero.verticalVelocityMmPerTick} mm/tick · Appui ${hero.supportingPlatformId ?? "air"}\n` +
        `Cible ${hero.targetId ?? "aucune"} · Regard ${hero.facing > 0 ? "droite" : "gauche"}\n` +
        `Caméra : bords ${pinned} · ${scene.metrics.drawCalls} draws · ${scene.metrics.triangles} triangles`;
      status.textContent = `Vrais rigs · ${scene.animationMode} · ${framesPerSecond} FPS · ` +
        (hero.targetId ? `menace : ${hero.targetId}` : "aucune menace proche");
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener("pagehide", () => {
    active = false;
    resize.disconnect();
    controls.dispose();
    scene.dispose();
  }, { once: true });

  window.__fightersBeatReady = false;
  requestAnimationFrame(frame);
}

void startBeatScene().catch(error => {
  window.__fightersBeatReady = false;
  status.textContent = "Impossible de charger les vrais rigs 3D ou d'initialiser WebGL.";
  diagnostics.textContent = String(error);
  diagnostics.hidden = false;
  toggle.setAttribute("aria-pressed", "true");
});
