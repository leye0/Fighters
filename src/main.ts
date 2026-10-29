import "./style.css";
import manifest from "../assets/manifest.json";
import {
  createMatch, stepMatch, TICKS_PER_SECOND, type MatchState,
} from "./engine/simulation.ts";
import { runtimeRoster, type AssetRecord } from "./assets/eligibility.ts";
import { fighterDefinition, DEFAULT_STAGE } from "./game/roster-config.ts";
import { KeyboardInput } from "./input/keyboard.ts";
import { ThreeWorld } from "./render/three-world.ts";
import { type QualityPreset } from "./render/quality.ts";

declare global {
  interface Window {
    __fightersVisualReady?: boolean;
    __fightersAssetsReady?: boolean;
    __fightersTick?: number;
  }
}

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing UI node #" + id);
  return node as T;
}
const canvas = required<HTMLCanvasElement>("game-canvas");
const status = required<HTMLElement>("load-status");
const metrics = required<HTMLElement>("metrics");
const selector = required<HTMLSelectElement>("quality-select");
const hud = required<HTMLElement>("match-hud");
const stageTitle = required<HTMLElement>("stage-title");
const playerNames: readonly [HTMLElement, HTMLElement] = [
  required("name-left"), required("name-right"),
];
const healthBars: readonly [HTMLElement, HTMLElement] = [
  required("health-left"), required("health-right"),
];
const roots = ["ultra", "high", "medium", "low"] as const;
const requestedQuality = new URLSearchParams(location.search).get("quality");
const preset: QualityPreset = roots.find(item => item === requestedQuality) ?? "ultra";
selector.value = preset;
selector.addEventListener("change", () => {
  const next = new URL(location.href);
  next.searchParams.set("quality", selector.value);
  location.assign(next.href);
});

const roster = runtimeRoster(manifest.assets as AssetRecord[]);
const keyboard = new KeyboardInput();
const stageContainer = required<HTMLElement>("stage-container");
let world: ThreeWorld;
try {
  world = new ThreeWorld(canvas, DEFAULT_STAGE, preset);
} catch (error) {
  keyboard.dispose();
  status.textContent = "WebGL 2 indisponible : " + String(error);
  throw error;
}

const resize = new ResizeObserver(() => {
  world.resize(stageContainer.clientWidth, stageContainer.clientHeight);
});
resize.observe(stageContainer);

let current: MatchState | null = null;
let previous: MatchState | null = null;
let matchDefinition: Parameters<typeof createMatch>[0] | null = null;
let lastTime = performance.now();
let accumulator = 0;
let displayTime = 0;
let frameCount = 0;
const tickMs = 1000 / TICKS_PER_SECOND;

async function loadApprovedFighters(): Promise<void> {
  if (roster.length < 2) {
    status.textContent =
      "Le rendu WebGL est prêt. Aucun duo de modèles humains photoréalistes n'a encore " +
      "terminé la validation de licence, de rigging et d'intégration. " +
      "Aucun personnage provisoire n'est simulé à sa place.";
    return;
  }
  const selected = [roster[0], roster[1]] as const;
  status.textContent = "Chargement des combattants et de leurs animations 3D…";
  try {
    await Promise.all(selected.map(asset => world.loadFighter(asset)));
    matchDefinition = {
      stage: DEFAULT_STAGE,
      fighters: [
        fighterDefinition(selected[0].id),
        fighterDefinition(selected[1].id),
      ],
    };
    current = createMatch(matchDefinition);
    previous = current;
    for (const index of [0, 1] as const) playerNames[index].textContent = selected[index].title;
    hud.hidden = false;
    stageTitle.hidden = true;
    window.__fightersAssetsReady = true;
    status.textContent = "Deux personnages autorisés chargés. Combat local en cours.";
  } catch (error) {
    status.textContent = "Chargement d'asset impossible : " + String(error);
  }
}

function updateHud(state: MatchState): void {
  for (const index of [0, 1] as const) {
    const fighter = state.fighters[index];
    healthBars[index].style.width = Math.max(0, Math.min(100, fighter.health)) + "%";
  }
  if (state.phase === "ko") status.textContent = "KO — simulation arrêtée.";
}

function frame(now: number): void {
  const elapsedMs = Math.min(100, Math.max(0, now - lastTime));
  lastTime = now;
  accumulator += elapsedMs;
  if (current && previous && matchDefinition) {
    let steps = 0;
    while (accumulator >= tickMs && steps < 6 && current.phase === "fight") {
      previous = current;
      const result = stepMatch(
        current, [keyboard.snapshot(0), keyboard.snapshot(1)], matchDefinition,
      );
      current = result.state;
      accumulator -= tickMs;
      steps++;
      window.__fightersTick = current.tick;
      updateHud(current);
    }
    if (steps === 6 || current.phase === "ko") accumulator = 0; // Bound catch-up and stop on KO.
    world.sync(previous, current, accumulator / tickMs, elapsedMs / 1000);
  } else accumulator = 0;

  world.render();
  window.__fightersVisualReady = true;
  frameCount++;
  displayTime += elapsedMs;
  if (displayTime >= 500) {
    const info = world.metrics();
    const fps = Math.round(frameCount * 1000 / displayTime);
    metrics.textContent =
      fps + " FPS affichage · " + info.calls + " draw calls · " +
      info.triangles.toLocaleString("fr-CA") + " triangles · " +
      info.textures + " textures GPU · " + preset.toUpperCase();
    displayTime = 0;
    frameCount = 0;
  }
  requestAnimationFrame(frame);
}

window.addEventListener("pagehide", () => {
  resize.disconnect();
  keyboard.dispose();
  world.dispose();
}, { once: true });

window.__fightersVisualReady = false;
window.__fightersAssetsReady = false;
status.textContent = "Initialisation du rendu 3D…";
void loadApprovedFighters();
requestAnimationFrame(frame);
