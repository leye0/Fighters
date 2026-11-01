import "./beat-em-up.css";
import { type BeatWorldState } from "./engine/beat-em-up-world.ts";
import { ATTACK_ORDER, createBeatCombat, stepBeatCombat,
  type BeatCombatInput, type BeatCombatState } from "./engine/beat-combat.ts";
import { BeatControls } from "./input/beat-input.ts";
import { demoEnemyCombatInputs, demoEnemyInputs } from "./game/beat-enemy-ai.ts";
import { BEAT_PROJECTION, DIAGNOSTIC_ACTORS, DIAGNOSTIC_STAGE,
  diagnosticScrollBounds } from "./game/beat-stage.ts";
import { BeatEmUpScene } from "./render/beat-em-up-scene.ts";

declare global {
  interface Window {
    __fightersBeatReady?: boolean;
    __fightersBeatTick?: number;
    /** Freeze simulation/animation for repeatable screenshots, only with ?qa. */
    __fightersBeatFreeze?: boolean;
    /** Capture the exact authored strike pose at this 60 Hz attack age in QA. */
    __fightersBeatFreezeAtAttackAge?: number;
    /** Read-only browser QA snapshot of the actual authoritative hero state. */
    __fightersBeatActorBounds?: ReadonlyArray<{ id: string; width: number;
      height: number; centerNdcX: number; centerNdcY: number;
      skinnedMeshes: number; visible: boolean }>;
    __fightersBeatHero?: { xMm: number; depthMm: number; heightMm: number;
      facing: -1 | 1; verticalVelocityMmPerTick: number;
      supportingPlatformId: string | null };
    __fightersBeatCamera?: { x: number; vertical: number; pinned: string[] };
    __fightersBeatHeroMotion?: string;
    /** Last accepted authored combat gesture; survives very short clip playback. */
    __fightersBeatLastCombatGesture?: string;
    __fightersBeatCombat?: { heroHealth: number; enemiesAlive: number;
      enemyHealth: number[]; outcome: string; hits: number };
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
const heroSelect = get<HTMLSelectElement>("beat-hero-select");
const heroHealthFill = get<HTMLElement>("beat-hero-health");
const heroHealthLabel = get<HTMLElement>("beat-hero-hp-label");
const enemiesLeft = get<HTMLElement>("beat-enemies-left");
const enemyHealthFills = [get<HTMLElement>("beat-enemy-a-health"), get<HTMLElement>("beat-enemy-b-health")];
const impact = get<HTMLElement>("beat-impact");
const endOverlay = get<HTMLElement>("beat-end");
const endTitle = get<HTMLElement>("beat-end-title");
const endMessage = get<HTMLElement>("beat-end-message");
const qaMode = new URLSearchParams(location.search).has("qa");
const heroName = new URLSearchParams(location.search).get("hero") === "carla" ? "carla" : "claudia";
heroSelect.value = heroName;
get<HTMLElement>("beat-hero-name").textContent = heroName.toUpperCase();
get<HTMLButtonElement>("beat-restart").addEventListener("click", () => location.reload());
heroSelect.addEventListener("change", () => {
  const next = new URL(location.href);
  next.searchParams.set("hero", heroSelect.value === "carla" ? "carla" : "claudia");
  location.assign(next.href);
});

// Diagnostics must never obscure the game on first load, including when
// Safari restores a prior page session or the application is hot-reloaded.
diagnostics.hidden = true;
toggle.textContent = "Stats";
toggle.setAttribute("aria-expanded", "false");

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
    await scene.loadActorModels({ hero: heroName, enemy: "realistic-man" });
  } catch (error) {
    scene.dispose();
    throw error;
  }
  const controls = new BeatControls(document.body);
  const resize = new ResizeObserver(() => scene.resize(viewport.clientWidth, viewport.clientHeight));
  resize.observe(viewport);
  let combat: BeatCombatState = createBeatCombat(DIAGNOSTIC_STAGE, DIAGNOSTIC_ACTORS);
  let previous: BeatWorldState = combat.world;
  let current = previous;
  let accumulator = 0;
  let lastTime = performance.now();
  let frameCount = 0;
  let frameWindow = lastTime;
  let framesPerSecond = 0;
  let active = true;
  let hitCount = 0;
  let lastImpactTick = -1000;
  const tickDuration = 1000 / 60;
  function updateHud(): void {
    const hero = combat.fighters.hero;
    heroHealthFill.style.width = `${100 * hero.health / hero.maxHealth}%`;
    heroHealthLabel.textContent = `${hero.health} / ${hero.maxHealth}`;
    const enemies = combat.world.actors.filter(a => a.team === "hostiles");
    const left = enemies.filter(a => a.alive).length;
    enemiesLeft.textContent = `${left} / ${enemies.length}`;
    enemies.forEach((enemy, index) => {
      const fighter = combat.fighters[enemy.id];
      if (enemyHealthFills[index])
        enemyHealthFills[index].style.width = `${100 * fighter.health / fighter.maxHealth}%`;
    });
    if (combat.outcome !== "playing" && endOverlay.hidden) {
      endOverlay.hidden = false;
      endTitle.textContent = combat.outcome === "victory" ? "VICTOIRE !" : "K.O. !";
      endMessage.textContent = combat.outcome === "victory"
        ? `${heroName === "carla" ? "Carla" : "Claudia"} a vaincu les deux adversaires.`
        : "Les adversaires ont gagné cette manche. Reprends le combat !";
    }
  }
  updateHud();
  toggle.addEventListener("click", () => {
    const expanded = diagnostics.hidden;
    diagnostics.hidden = !expanded;
    toggle.setAttribute("aria-expanded", String(expanded));
    toggle.textContent = expanded ? "Masquer les stats" : "Stats";
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
    if (qaMode && window.__fightersBeatFreeze) {
      // The GPU/software renderer can take several seconds per capture.
      // Freeze game time so snapshots show the exact tested pose and controls
      // do not keep moving under a long screenshot operation.
      lastTime = now;
      accumulator = 0;
      scene.render(current, current, 0);
      requestAnimationFrame(frame);
      return;
    }
    const elapsedMs = Math.min(250, Math.max(0, now - lastTime));
    accumulator += elapsedMs;
    lastTime = now;
    while (accumulator >= tickDuration) {
      previous = current;
      const enemyCommands: Readonly<Record<string, BeatCombatInput>> = qaMode
        ? Object.fromEntries(Object.entries(demoEnemyInputs(current, DIAGNOSTIC_STAGE))
          .map(([id, movement]) => [id, { movement }]))
        : demoEnemyCombatInputs(combat, DIAGNOSTIC_STAGE);
      const heroMovement = controls.snapshot();
      const heroActor = current.actors.find(actor => actor.id === "hero")!;
      const heroCombat = combat.fighters.hero;
      const canStrike = combat.outcome === "playing" && heroActor.alive &&
        heroActor.supportingPlatformId !== null && heroCombat.stunTicks === 0 &&
        heroCombat.attack === null && !heroMovement.jump;
      const chosenGesture = controls.consumeCombatGesture(canStrike);
      combat = stepBeatCombat(combat, {
        ...enemyCommands,
        hero: { movement: heroMovement,
          attack: chosenGesture === null ? null : ATTACK_ORDER[chosenGesture] },
      }, DIAGNOSTIC_STAGE);
      current = combat.world;
      scene.applyCombatEvents(combat.events);
      for (const event of combat.events) {
        if (event.kind === "attack" && event.actorId === "hero" && qaMode)
          window.__fightersBeatLastCombatGesture = scene.heroMotion;
        if (event.kind === "hit") {
          hitCount++;
          lastImpactTick = current.tick;
          impact.textContent = event.actorId === "hero"
            ? `-${event.damage} PV !` : `COUP ! -${event.damage} PV`;
        }
      }
      if (current.tick % 6 === 0 || combat.events.length) updateHud();
      // Animation and authored movement are advanced on EACH simulation tick.
      // A 30 FPS display must not halve authored gait speed by applying only the
      // last of two physics ticks to a full render-frame elapsed time.
      scene.updateAnimations(1 / 60, previous, current);
      accumulator -= tickDuration;
      // Software WebGL takes much longer than a gameplay frame. Pause at the
      // requested simulation tick BEFORE consuming the rest of this RAF's
      // catch-up ticks so screenshots inspect the actual strike/contact pose.
      if (qaMode && combat.fighters.hero.attack &&
          combat.fighters.hero.attack.ageTicks === window.__fightersBeatFreezeAtAttackAge) {
        window.__fightersBeatFreeze = true;
        window.__fightersBeatFreezeAtAttackAge = undefined;
        accumulator = 0;
        break;
      }
    }
    const camera = scene.render(previous, current, accumulator / tickDuration);
    // Only explicit, local screenshot QA needs the expensive skinned bounds.
    if (qaMode &&
        (!window.__fightersBeatActorBounds || current.tick % 30 === 0)) {
      window.__fightersBeatActorBounds = scene.actorVisualDiagnostics;
    }
    window.__fightersBeatReady = true;
    window.__fightersBeatTick = current.tick;
    if (qaMode) window.__fightersBeatHeroMotion = scene.heroMotion;
    window.__fightersBeatCombat = {
      heroHealth: combat.fighters.hero.health,
      enemiesAlive: current.actors.filter(a => a.team === "hostiles" && a.alive).length,
      enemyHealth: current.actors.filter(a => a.team === "hostiles")
        .map(a => combat.fighters[a.id].health),
      outcome: combat.outcome, hits: hitCount,
    };
    if (current.tick - lastImpactTick > 40) impact.textContent = "";
    const liveHero = current.actors.find(actor => actor.id === "hero")!;
    window.__fightersBeatHero = {
      xMm: liveHero.xMm, depthMm: liveHero.depthMm, heightMm: liveHero.heightMm,
      facing: liveHero.facing, verticalVelocityMmPerTick: liveHero.verticalVelocityMmPerTick,
      supportingPlatformId: liveHero.supportingPlatformId,
    };
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
      status.textContent = `${combat.outcome === "playing" ? "Combat en cours" : "Manche terminée"}` +
        ` · ${scene.animationMode} · ${framesPerSecond} FPS · ${hitCount} impacts`;
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
  toggle.setAttribute("aria-expanded", "true");
  toggle.textContent = "Masquer les stats";
});
