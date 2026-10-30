import {
  AgXToneMapping, AmbientLight, AnimationMixer, Box3, Color, DirectionalLight,
  GridHelper, Group, HemisphereLight, LoopOnce, LoopRepeat, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SkeletonHelper, SRGBColorSpace, Vector3, WebGLRenderer,
  type AnimationAction, type AnimationClip, type Object3D,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import research from "../assets/mixamo-layering-research.json" with { type: "json" };
import { maskClip } from "./render/animation-layers.ts";
import {
  assertMatchingResearchRig, researchGlbStem, researchWorldOffset,
  RESEARCH_ATTACK, RESEARCH_COMPOSITES, type ResearchComposite,
} from "./render/research-composite.ts";
import "./animation-composite.css";

type LoadedClip = { clip: AnimationClip; scene: Object3D; bones: readonly string[]; hasMesh: boolean };
type Decision = "pending" | "keep" | "reject" | "review";
type Review = { choice: Decision; note: string };

const expected = new Map(research.sourceIdentities.map(source => [source.filename.replace(/\.fbx$/, ""), source]));
const loaded = new Map<string, LoadedClip>();
const reviews = new Map<string, Review>();
const STORAGE = "fighters-composite-review-v1";
const title = "Test des vraies animations GLB superposées";
try {
  const saved: unknown = JSON.parse(localStorage.getItem(STORAGE) ?? "{}");
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    for (const [key, value] of Object.entries(saved)) {
      if (!RESEARCH_COMPOSITES.some(combo => combo.id === key) || !value || typeof value !== "object") continue;
      const candidate = value as Partial<Review>;
      if (["pending", "keep", "reject", "review"].includes(candidate.choice ?? "")) {
        reviews.set(key, { choice: candidate.choice!, note: typeof candidate.note === "string" ? candidate.note.slice(0, 1000) : "" });
      }
    }
  }
} catch { /* Local storage may be disabled or malformed. */ }

const root = document.getElementById("composite-review");
if (!root) throw new Error("Composite review root missing");
root.className = "composite-review";
root.innerHTML = `
  <header class="composite-heading">
    <nav><a href="/animation-review.html">← Choix des 63 animations</a><a href="/">Fighters</a></nav>
    <span class="composite-eyebrow">RECHERCHE · 0 COMBINAISON APPROUVÉE</span>
    <h1>${title}</h1>
    <p>Observe sur un YBot 3D le même mélange d'os que le moteur : <strong>jambes et bassin</strong> depuis la locomotion, <strong>haut du corps</strong> depuis le jab. Les cinq GLB sont lus sur ton appareil, jamais envoyés à un serveur.</p>
  </header>
  <div class="composite-layout">
    <section class="composite-stage" aria-label="Personnage animé en trois dimensions">
      <canvas id="composite-canvas" aria-label="Rendu Three.js du personnage"></canvas>
      <div class="composite-stage-label">YBot de recherche · caméra libre au doigt / à la souris</div>
      <div id="composite-overlay" class="composite-overlay">Charge les cinq GLB privés pour commencer.</div>
      <div class="composite-angles">
        <button type="button" data-camera="side">Profil</button>
        <button type="button" data-camera="threequarter">¾</button>
        <button type="button" data-camera="front">Face</button>
      </div>
    </section>
    <aside class="composite-panel">
      <section>
        <h2>1. Charger les GLB</h2>
        <label for="composite-files" class="composite-file-picker">Choisir les 5 fichiers .glb</label>
        <input id="composite-files" type="file" multiple accept=".glb,model/gltf-binary" />
        <div id="composite-drop" class="composite-drop">Tu peux aussi glisser-déposer les fichiers ici.</div>
        <ol id="composite-sources" class="composite-sources"></ol>
        <p id="composite-status" class="composite-status" role="status" aria-live="polite"></p>
      </section>
      <fieldset id="composite-controls" disabled>
        <legend>2. Observer les mouvements</legend>
        <label>Combinaison<select id="composite-mode"></select></label>
        <label>Durée du jab : <output id="composite-punch-output">0,80 s</output>
          <input id="composite-punch-duration" type="range" min="0.45" max="1.8" step="0.05" value="0.8" />
        </label>
        <label>Vitesse de lecture : <output id="composite-speed-output">1,00×</output>
          <input id="composite-speed" type="range" min="0.25" max="1.5" step="0.25" value="1" />
        </label>
        <label>Temps : <output id="composite-time-output">0,00 s</output>
          <input id="composite-time" type="range" min="0" max="2.2" step="0.01" value="0" />
        </label>
        <div class="composite-buttons">
          <button id="composite-play" type="button">Pause</button>
          <button id="composite-restart" type="button">Reprendre à 0</button>
        </div>
      </fieldset>
      <section class="composite-judgment">
        <h2>3. Ton observation</h2>
        <label>Ce mélange est-il convaincant ?
          <select id="composite-judgment" disabled>
            <option value="pending">Non évalué</option>
            <option value="keep">À conserver</option>
            <option value="review">À retoucher / revoir</option>
            <option value="reject">À écarter</option>
          </select>
        </label>
        <label>Ce que tu vois<textarea id="composite-note" rows="2" maxlength="1000" disabled placeholder="Mauvais raccord du bassin, pieds qui glissent, frappe crédible…"></textarea></label>
        <button id="composite-export" type="button">Exporter mes observations (JSON)</button>
      </section>
    </aside>
  </div>
  <p class="composite-warning">Ce lecteur est un <strong>outil de recherche YBot</strong>, pas un combattant final : déplacement horizontal illustratif, saut vertical simplifié, pas de hitbox, de retargeting ni d'IK de pied. Une superposition visuellement acceptable ici ne sera approuvée dans le jeu qu'après essai sur son personnage définitif.</p>
`;

const query = <T extends Element>(selector: string) => {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing composite control: ${selector}`);
  return element;
};
const files = query<HTMLInputElement>("#composite-files");
const drop = query<HTMLElement>("#composite-drop");
const sourceList = query<HTMLOListElement>("#composite-sources");
const status = query<HTMLElement>("#composite-status");
const overlay = query<HTMLElement>("#composite-overlay");
const controls = query<HTMLFieldSetElement>("#composite-controls");
const mode = query<HTMLSelectElement>("#composite-mode");
const punchDuration = query<HTMLInputElement>("#composite-punch-duration");
const punchOutput = query<HTMLOutputElement>("#composite-punch-output");
const speed = query<HTMLInputElement>("#composite-speed");
const speedOutput = query<HTMLOutputElement>("#composite-speed-output");
const timeSlider = query<HTMLInputElement>("#composite-time");
const timeOutput = query<HTMLOutputElement>("#composite-time-output");
const play = query<HTMLButtonElement>("#composite-play");
const decision = query<HTMLSelectElement>("#composite-judgment");
const note = query<HTMLTextAreaElement>("#composite-note");
const canvas = query<HTMLCanvasElement>("#composite-canvas");
for (const composite of RESEARCH_COMPOSITES) mode.add(new Option(composite.label, composite.id));

const scene = new Scene();
scene.background = new Color("#101827");
const camera = new PerspectiveCamera(38, 1, .05, 100);
camera.position.set(0, 1.9, 5.8);
const sky = new HemisphereLight(0xcce5ff, 0x33333a, 2);
const ambient = new AmbientLight(0x6887ab, .2);
const key = new DirectionalLight(0xffe6c8, 3.7);
key.position.set(-3, 8, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
scene.add(sky, ambient, key);
const floor = new Mesh(new PlaneGeometry(8, 8), new MeshStandardMaterial({ color: 0x323c47, roughness: .87 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new GridHelper(8, 16, 0x7f95ab, 0x465263);
grid.position.y = .005;
scene.add(grid);
const actor = new Group();
scene.add(actor);
let renderer: WebGLRenderer | null = null;
let orbit: OrbitControls | null = null;
let mixer: AnimationMixer | null = null;
let actualRig: Object3D | null = null;
let skeletonHelper: SkeletonHelper | null = null;
let lowerAction: AnimationAction | null = null;
let upperAction: AnimationAction | null = null;
let currentTime = 0;
let playing = false;
let lastFrame = performance.now();
let timelineDuration = 2;
let baseDuration = 1;

function cameraAt(view: string) {
  const position = view === "front" ? [5.8, 1.9, 0] : view === "threequarter" ? [3.4, 2, 4.2] : [0, 1.9, 5.8];
  camera.position.set(position[0], position[1], position[2]);
  orbit?.target.set(0, 1.0, 0);
  orbit?.update();
}
root.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach(button => {
  button.addEventListener("click", () => cameraAt(button.dataset.camera ?? "side"));
});

function resize() {
  if (!renderer) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
try {
  renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = AgXToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.shadowMap.enabled = true;
  orbit = new OrbitControls(camera, canvas);
  orbit.enableDamping = true;
  orbit.minDistance = 2.3;
  orbit.maxDistance = 12;
  orbit.target.set(0, 1, 0);
  orbit.update();
  new ResizeObserver(resize).observe(canvas);
  resize();
} catch (error) {
  overlay.textContent = `WebGL est indisponible sur ce navigateur : ${String(error)}`;
  status.textContent = "Ce lecteur demande un navigateur avec WebGL activé.";
}

function currentComposite(): ResearchComposite {
  return RESEARCH_COMPOSITES.find(candidate => candidate.id === mode.value) ?? RESEARCH_COMPOSITES[0];
}

function showReview() {
  const saved = reviews.get(mode.value) ?? { choice: "pending", note: "" };
  decision.value = saved.choice;
  note.value = saved.note;
}

function saveReview() {
  reviews.set(mode.value, { choice: decision.value as Decision, note: note.value.slice(0, 1000) });
  try { localStorage.setItem(STORAGE, JSON.stringify(Object.fromEntries(reviews))); }
  catch { status.textContent = "Stockage local indisponible : exporte tes observations avant de quitter."; }
}
decision.addEventListener("change", saveReview);
note.addEventListener("input", saveReview);

function showSources() {
  sourceList.replaceChildren();
  for (const identity of research.sourceIdentities) {
    const name = identity.filename.replace(/\.fbx$/, "");
    const item = document.createElement("li");
    item.textContent = `${loaded.has(name) ? "✓" : "○"} ${name}.glb`;
    item.className = loaded.has(name) ? "loaded" : "missing";
    sourceList.append(item);
  }
  const ready = loaded.size === expected.size && !!renderer;
  controls.disabled = !ready;
  decision.disabled = !ready;
  note.disabled = !ready;
  if (ready) overlay.hidden = true;
}

function ensureSameRig() {
  const base = loaded.get("Fighting_Idle")!;
  for (const [name, candidate] of loaded) {
    try { assertMatchingResearchRig(base.bones, candidate.bones); }
    catch (error) { throw new Error(`${name} : ${error instanceof Error ? error.message : error}`); }
  }
}

function setupActor() {
  if (!renderer || loaded.size !== expected.size) return;
  ensureSameRig();
  if (actualRig) actor.remove(actualRig);
  if (skeletonHelper) actor.remove(skeletonHelper);
  skeletonHelper = null;
  actualRig = loaded.get("Fighting_Idle")!.scene;
  actor.add(actualRig);
  actualRig.rotation.y = Math.PI / 2; // Original Mixamo forward (+Z) -> right (+X) in a side-on fight.
  const bounds = new Box3().setFromObject(actualRig);
  if (!bounds.isEmpty()) {
    const dimensions = bounds.getSize(new Vector3());
    const scale = dimensions.y > .1 ? 1.8 / dimensions.y : 1;
    actualRig.scale.setScalar(scale);
    actualRig.position.y = -bounds.min.y * scale;
  }
  let meshCount = 0;
  actualRig.traverse(object => {
    if (object instanceof Mesh) { meshCount++; object.castShadow = true; object.receiveShadow = true; }
  });
  if (!meshCount) {
    skeletonHelper = new SkeletonHelper(actualRig);
    actor.add(skeletonHelper);
    status.textContent = "Attention : ces GLB contiennent un squelette sans surface ; visualisation des os seulement.";
  }
  resetMixer();
}

function resetMixer() {
  if (!actualRig || !renderer || loaded.size !== expected.size) return;
  mixer?.stopAllAction();
  if (mixer) mixer.uncacheRoot(actualRig);
  mixer = new AnimationMixer(actualRig);
  const composite = currentComposite();
  const locomotion = loaded.get(composite.source)!.clip;
  const jab = loaded.get(RESEARCH_ATTACK)!.clip;
  baseDuration = locomotion.duration;
  timelineDuration = composite.motion === "jump" ? baseDuration : Math.max(baseDuration, 1.8);
  lowerAction = mixer.clipAction(maskClip(locomotion, "lowerBody"));
  lowerAction.setLoop(composite.motion === "jump" ? LoopOnce : LoopRepeat, composite.motion === "jump" ? 1 : Infinity);
  lowerAction.clampWhenFinished = composite.motion === "jump";
  lowerAction.play();
  upperAction = mixer.clipAction(maskClip(jab, "upperBody"));
  upperAction.setLoop(LoopOnce, 1);
  upperAction.clampWhenFinished = true;
  upperAction.setEffectiveTimeScale(jab.duration / Number(punchDuration.value));
  upperAction.play();
  currentTime = 0;
  playing = true;
  play.textContent = "Pause";
  timeSlider.max = String(timelineDuration);
  timeSlider.value = "0";
  punchOutput.value = `${Number(punchDuration.value).toFixed(2).replace(".", ",")} s`;
  showReview();
  displayTime();
}

function displayTime() {
  timeSlider.value = String(currentTime);
  timeOutput.value = `${currentTime.toFixed(2).replace(".", ",")} s`;
  const composite = currentComposite();
  const position = researchWorldOffset(composite, currentTime, baseDuration);
  actor.position.set(position.x, position.y, 0);
}

async function readGLBs(filesToLoad: FileList | File[]) {
  if (!renderer) return;
  status.textContent = "Vérification des empreintes SHA-256 et lecture des animations…";
  const failures: string[] = [];
  const decoder = new GLTFLoader();
  for (const file of Array.from(filesToLoad)) {
    const stem = researchGlbStem(file.name);
    const identity = stem ? expected.get(stem) : undefined;
    if (!identity) { failures.push(`${file.name} : pas dans les cinq sources certifiées.`); continue; }
    try {
      const bytes = await file.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
        .map(byte => byte.toString(16).padStart(2, "0")).join("");
      if (hash !== identity.researchGlbSha256) throw new Error("empreinte différente de celle du dépôt");
      const gltf = await decoder.parseAsync(bytes, "");
      if (gltf.animations.length !== 1) throw new Error("une seule animation est attendue");
      const bones: string[] = [];
      let hasMesh = false;
      gltf.scene.traverse(object => {
        if ("isBone" in object && object.isBone) bones.push(object.name);
        if (object instanceof Mesh) hasMesh = true;
      });
      if (!bones.length) throw new Error("aucun os reconnu");
      loaded.set(stem!, { clip: gltf.animations[0], scene: gltf.scene, bones, hasMesh });
    } catch (error) {
      failures.push(`${file.name} : ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  showSources();
  if (loaded.size === expected.size) {
    try { setupActor(); }
    catch (error) {
      controls.disabled = true;
      decision.disabled = true;
      note.disabled = true;
      overlay.hidden = false;
      overlay.textContent = "Squelettes incompatibles : le rendu a été bloqué.";
      failures.push(String(error));
    }
  }
  status.textContent = [
    `${loaded.size}/${expected.size} GLB vérifiés.`,
    ...failures,
    ...(loaded.size === expected.size && failures.length === 0 ? ["Les clips sont prêts à être observés."] : []),
  ].join(" ");
}
files.addEventListener("change", () => {
  if (files.files) void readGLBs(files.files);
  files.value = "";
});
for (const eventName of ["dragenter", "dragover"]) {
  drop.addEventListener(eventName, event => { event.preventDefault(); drop.classList.add("dragging"); });
}
drop.addEventListener("dragleave", () => drop.classList.remove("dragging"));
drop.addEventListener("drop", event => {
  event.preventDefault();
  drop.classList.remove("dragging");
  if (event.dataTransfer?.files) void readGLBs(event.dataTransfer.files);
});

mode.addEventListener("change", resetMixer);
punchDuration.addEventListener("input", resetMixer);
speed.addEventListener("input", () => { speedOutput.value = `${Number(speed.value).toFixed(2).replace(".", ",")}×`; });
timeSlider.addEventListener("input", () => {
  currentTime = Number(timeSlider.value);
  // setTime() resets elapsed time but not actions paused by LoopOnce completion.
  lowerAction?.reset().play();
  upperAction?.reset().play();
  mixer?.setTime(currentTime);
  playing = false;
  play.textContent = "Lire";
  displayTime();
});
play.addEventListener("click", () => {
  if (currentTime >= timelineDuration) {
    resetMixer();
    return;
  }
  playing = !playing;
  play.textContent = playing ? "Pause" : "Lire";
});
query<HTMLButtonElement>("#composite-restart").addEventListener("click", resetMixer);
query<HTMLButtonElement>("#composite-export").addEventListener("click", () => {
  const payload = {
    schemaVersion: 1, project: "Fighters", purpose: "owner_composite_visual_review",
    generatedAt: new Date().toISOString(),
    sourceRig: research.referenceRig,
    sourceIdentities: research.sourceIdentities,
    combinations: RESEARCH_COMPOSITES.map(composite => ({
      locomotion: composite.source, attack: RESEARCH_ATTACK,
      ...(reviews.get(composite.id) ?? { choice: "pending", note: "" }),
      approvedForProduction: false,
    })),
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2) + "\n"], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "fighters-glb-composite-review.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function animate(now: number) {
  const delta = Math.min((now - lastFrame) / 1000, .08);
  lastFrame = now;
  if (playing && mixer) {
    const next = Math.min(timelineDuration, currentTime + delta * Number(speed.value));
    mixer.update(next - currentTime);
    currentTime = next;
    displayTime();
    if (currentTime >= timelineDuration) {
      playing = false;
      play.textContent = "Recommencer";
    }
  }
  orbit?.update();
  renderer?.render(scene, camera);
  requestAnimationFrame(animate);
}

showSources();
showReview();
requestAnimationFrame(animate);
