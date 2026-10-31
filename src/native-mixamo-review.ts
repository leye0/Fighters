import {
  AnimationAction, AnimationMixer, Box3, Color, DirectionalLight,
  GridHelper, Group, HemisphereLight, PerspectiveCamera, Scene,
  SkeletonHelper, SkinnedMesh, Vector3, WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "./native-mixamo-review.css";

function element<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error("Missing native rig review element: " + id);
  return node as T;
}
const picker = element<HTMLInputElement>("native-file");
const status = element<HTMLParagraphElement>("native-status");
const stage = element<HTMLDivElement>("native-stage");
const animationSelect = element<HTMLSelectElement>("native-animation");
const timeSlider = element<HTMLInputElement>("native-time");
const playButton = element<HTMLButtonElement>("native-play");
const skeletonToggle = element<HTMLInputElement>("native-skeleton");
const evidence = element<HTMLParagraphElement>("native-evidence");

const required = new Set([
  "Fighters_Mixamo_Fighting_Idle",
  "Fighters_Mixamo_Walk_Standard",
  "Fighters_Mixamo_Walk_Feminine",
  "Fighters_Mixamo_Walk_Backward",
  "Fighters_Mixamo_Left_Turn_180",
  "Fighters_Mixamo_Jump",
  "Fighters_Mixamo_Fall",
]);

const scene = new Scene();
scene.background = new Color(0x171b24);
scene.add(new HemisphereLight(0xe5edff, 0x34343d, 2.1));
const keyLight = new DirectionalLight(0xffffff, 2.2);
keyLight.position.set(2, 5, 4);
scene.add(keyLight);
const fillLight = new DirectionalLight(0xc6d8ff, 1.1);
fillLight.position.set(-3, 2, -3);
scene.add(fillLight);
const grid = new GridHelper(8, 16, 0x5b6474, 0x353b47);
scene.add(grid);

const camera = new PerspectiveCamera(32, 16 / 9, 0.05, 200);
const renderer = new WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
stage.append(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.85, 0);
camera.position.set(0, 1, 4);
controls.update();

const modelHolder = new Group();
scene.add(modelHolder);
let mixer: AnimationMixer | undefined;
let action: AnimationAction | undefined;
let activeClipNames: string[] = [];
let helper: SkeletonHelper | undefined;
let playing = true;
let lastFrame = performance.now();
let preparedForScreenshot = false;

function moveView(view: string): void {
  const distance = Math.max(3, camera.position.distanceTo(controls.target));
  const vectors: Record<string, Vector3> = {
    front: new Vector3(0, 1.1, distance),
    back: new Vector3(0, 1.1, -distance),
    left: new Vector3(-distance, 1.1, 0),
    right: new Vector3(distance, 1.1, 0),
    three: new Vector3(distance * 0.65, 1.3, distance * 0.76),
  };
  camera.position.copy(vectors[view] ?? vectors.front).add(new Vector3(0, 0.8, 0));
  controls.update();
}
function resize(): void {
  const width = Math.max(260, stage.clientWidth);
  const height = Math.max(240, stage.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
window.addEventListener("resize", resize);
resize();
function setSkeletonVisible(visible: boolean): void {
  if (helper) helper.visible = visible;
}

function selectAnimation(name: string): void {
  if (!mixer) return;
  // Action clips are resolved by the imported map, not by generated motion.
  const selected = clipsByName.get(name);
  if (!selected) return;
  mixer.stopAllAction();
  action = mixer.clipAction(selected).reset().play();
  mixer.setTime(0);
  playing = true;
  playButton.textContent = "Pause";
  timeSlider.value = "0";
}
const clipsByName = new Map<string, import("three").AnimationClip>();

async function loadFile(file: File): Promise<void> {
  if (file.size > 120 * 1024 * 1024) throw new Error("GLB trop volumineux (limite 120 Mo)");
  if (!file.name.toLowerCase().endsWith(".glb")) throw new Error("Choisis un fichier GLB");
  const buffer = await file.arrayBuffer();
  const loaded = await new GLTFLoader().parseAsync(buffer, "");
  const rigs: SkinnedMesh[] = [];
  loaded.scene.traverse(node => {
    if (node instanceof SkinnedMesh && node.skeleton?.bones.length) rigs.push(node);
  });
  if (!rigs.length) throw new Error("Fichier sans squelette ni maillage skinné");
  mixer?.stopAllAction();
  modelHolder.clear();
  clipsByName.clear();
  for (const clip of loaded.animations) clipsByName.set(clip.name, clip);
  modelHolder.add(loaded.scene);
  const bounds = new Box3().setFromObject(loaded.scene, true);
  const size = bounds.getSize(new Vector3());
  if (!Number.isFinite(size.y) || size.y < 0.001) throw new Error("Dimensions du corps invalides");
  // Independent framing, never alter the loaded skeleton's local bone poses.
  const centre = bounds.getCenter(new Vector3());
  const factor = 1.75 / size.y;
  modelHolder.scale.setScalar(factor);
  modelHolder.position.set(-centre.x * factor, -bounds.min.y * factor, -centre.z * factor);
  mixer = new AnimationMixer(loaded.scene);
  helper?.dispose();
  helper = new SkeletonHelper(loaded.scene);
  helper.visible = skeletonToggle.checked;
  modelHolder.add(helper);

  animationSelect.replaceChildren();
  for (const clip of loaded.animations) {
    const option = new Option(clip.name, clip.name);
    animationSelect.add(option);
  }
  activeClipNames = loaded.animations.map(clip => clip.name);
  const missing = [...required].filter(name => !clipsByName.has(name));
  const tags = (loaded.parser.json.animations ?? []).map(
    (entry: {extras?: {retargeting?: string}}) => entry.extras?.retargeting ?? "sans marqueur");
  const skinCount = rigs[0]?.skeleton.bones.length ?? 0;
  evidence.textContent =
    "Os : " + skinCount + ". Clips : " + activeClipNames.length +
    ". Source : " + [...new Set(tags)].join(", ") + ". " +
    (missing.length ? "Animations attendues manquantes : " + missing.join(", ") :
      "Les 7 animations attendues sont présentes.");
  animationSelect.disabled = loaded.animations.length === 0;
  timeSlider.disabled = loaded.animations.length === 0;
  playButton.disabled = loaded.animations.length === 0;
  if (loaded.animations.length) selectAnimation(loaded.animations[0].name);
  status.textContent = "Fichier local chargé : " + file.name +
    ". Vérifie visuellement les épaules, coudes, poignets et genoux.";
  moveView("three");
  preparedForScreenshot = true;
}
picker.addEventListener("change", async () => {
  const file = picker.files?.[0];
  if (!file) return;
  status.textContent = "Chargement local en cours…";
  try { await loadFile(file); }
  catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
  }
});
animationSelect.addEventListener("change", () => selectAnimation(animationSelect.value));
timeSlider.addEventListener("input", () => {
  if (!mixer || !action) return;
  playing = false;
  playButton.textContent = "Lecture";
  const clip = action.getClip();
  mixer.setTime(clip.duration * Number(timeSlider.value) / 1000);
});
playButton.addEventListener("click", () => {
  playing = !playing;
  playButton.textContent = playing ? "Pause" : "Lecture";
});
skeletonToggle.addEventListener("change", () => setSkeletonVisible(skeletonToggle.checked));
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => {
  button.addEventListener("click", () => moveView(button.dataset.view ?? "front"));
});
function loop(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  if (mixer && action && playing) {
    mixer.update(dt);
    const time = (action.time % action.getClip().duration) / action.getClip().duration;
    timeSlider.value = String(Math.round(time * 1000));
  }
  controls.update();
  renderer.render(scene, camera);
  if (preparedForScreenshot) {
    (window as Window & {__fightersNativePreviewReady?: boolean}).__fightersNativePreviewReady = true;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
