import shortlist from "../assets/mixamo-shortlist.json" with { type: "json" };
import catalog from "../assets/mixamo-available-clips.json" with { type: "json" };
import screening from "../assets/mixamo-screening.json" with { type: "json" };
import "./animation-review.css";

type Choice = "unreviewed" | "keep" | "reject" | "uncertain";
type Selection = { choice: Choice; note: string };
type SelectionMap = Record<string, Selection>;
const STORAGE_KEY = "fighters-animation-review-v1";
const BASE = "https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/resolve/main/animation_motion_render";
const FOLDER = "https://huggingface.co/datasets/Linzhan/Mixamo-Animations-Characters/tree/main/animation_motion_render";
const choices = new Set<Choice>(["unreviewed", "keep", "reject", "uncertain"]);
const clips = shortlist.groups.flatMap(group => group.filenames.map(filename => ({ filename, group: group.purpose })));
const clipMetadata = new Map(catalog.clips.map(clip => [clip.filename, clip]));
const preliminary = new Map(screening.clips.map(clip => [clip.filename, clip]));

function normalizeSelection(candidate: unknown): SelectionMap {
  const result: SelectionMap = {};
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return result;
  const known = new Set(clips.map(clip => clip.filename));
  for (const [name, value] of Object.entries(candidate)) {
    if (!known.has(name) || !value || typeof value !== "object") continue;
    const parsed = value as Partial<Selection>;
    if (parsed.choice && choices.has(parsed.choice)) {
      result[name] = { choice: parsed.choice, note: typeof parsed.note === "string" ? parsed.note.slice(0, 1000) : "" };
    }
  }
  return result;
}

let selections: SelectionMap = {};
try { selections = normalizeSelection(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")); }
catch { /* A fresh review should still work if local storage contains invalid JSON. */ }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(selections)); }

function previewURL(filename: string, view: number) {
  return `${BASE}/${encodeURIComponent(filename.replace(/\.fbx$/, ""))}/v${String(view).padStart(3, "0")}.mp4`;
}

const root = document.getElementById("animation-review");
if (!root) throw new Error("Missing animation review element");
root.className = "review-shell";
root.innerHTML = `
  <a href="/">← Fighters</a>
  <a href="/animation-composite.html" style="margin-left: 20px">Tester la superposition des GLB en 3D →</a>
  <h1>Choisir les animations de Fighters</h1>
  <p>63 mouvements Mixamo candidats (60 premiers choix et 3 pas arrière de boxe), avec <strong>4 angles vidéo chacun</strong>. Visionne-les, choisis « Garder » ou « Écarter » et exporte ton résultat en JSON. Le navigateur conserve également tes choix sur cet appareil.</p>
  <p class="review-warning">Les notes de présélection sont seulement indicatives. Ce lecteur montre les prévisualisations YBot du dataset, pas les GLB retargetés sur les vrais combattants. Les droits des fichiers sources et la superposition des mouvements restent à vérifier.</p>
  <section class="review-toolbar" aria-label="Recherche et actions">
    <label>Recherche<input id="review-search" type="search" placeholder="jab, kick, garde…" /></label>
    <label>Famille<select id="review-family"></select></label>
    <label>Mon choix<select id="review-choice-filter"><option value="all">Tous</option><option value="unreviewed">Non évalués</option><option value="keep">À garder</option><option value="reject">À écarter</option><option value="uncertain">À revoir</option></select></label>
    <button id="review-export" type="button">Exporter ma sélection (.json)</button>
    <button id="review-import" type="button">Importer une sélection</button>
    <input id="review-import-file" type="file" accept="application/json,.json" hidden />
  </section>
  <p class="review-stats" id="review-stats" aria-live="polite"></p>
  <p class="review-alert" id="review-error" role="alert"></p>
  <section class="review-grid" id="review-grid" aria-label="Vidéos des animations"></section>
`;

const family = root.querySelector<HTMLSelectElement>("#review-family")!;
const groupNames: Record<string, string> = { stance: "Postures", locomotion: "Déplacements", airborne: "Sauts", punch: "Poings et coudes", kick: "Pieds", defense: "Défense", reaction: "Réactions", combo: "Combos", grapple: "Projections", special: "Spéciaux", backstep_alternatives: "Pas arrière alternatifs" };
family.add(new Option("Toutes les familles", "all"));
for (const group of shortlist.groups) family.add(new Option(groupNames[group.purpose] ?? group.purpose, group.purpose));
const search = root.querySelector<HTMLInputElement>("#review-search")!;
const choiceFilter = root.querySelector<HTMLSelectElement>("#review-choice-filter")!;
const grid = root.querySelector<HTMLElement>("#review-grid")!;
const stats = root.querySelector<HTMLElement>("#review-stats")!;
const error = root.querySelector<HTMLElement>("#review-error")!;

function card(filename: string, group: string): HTMLElement {
  const choice = selections[filename] ?? { choice: "unreviewed", note: "" };
  const candidate = preliminary.get(filename);
  const article = document.createElement("article");
  article.className = "review-card";
  article.dataset.choice = choice.choice;
  article.innerHTML = `<div class="review-card-header"><h2></h2><span class="review-tag"></span></div>
    <video controls loop muted playsinline preload="none" aria-label="Prévisualisation de l'animation"></video>
    <div class="review-angles" aria-label="Choix de l'angle"></div>
    <div class="review-card-body"><p class="review-description"></p><p class="review-meta"></p><p class="review-prelim"></p><p class="review-note"></p>
    <label>Ma décision<select class="review-decision"><option value="unreviewed">Non évalué</option><option value="keep">✓ Garder</option><option value="reject">✕ Écarter</option><option value="uncertain">? À revoir</option></select></label>
    <label>Mon commentaire<textarea maxlength="1000" placeholder="Ex. bonne frappe, mauvaise transition…"></textarea></label><a target="_blank" rel="noopener noreferrer">Voir la source et les autres angles</a></div>`;
  article.querySelector("h2")!.textContent = filename.replace(/\.fbx$/, "").replaceAll("_", " ");
  article.querySelector(".review-tag")!.textContent = groupNames[group] ?? group;
  const metadata = clipMetadata.get(filename);
  article.querySelector(".review-description")!.textContent = `Description : ${metadata?.sourceDescription ?? "Non documentée"}`;
  if (metadata) article.querySelector(".review-meta")!.textContent = `Source : ${metadata.originalFrames} frames à ${metadata.sourceFps} i/s (≈ ${(metadata.originalFrames / metadata.sourceFps).toFixed(2)} s)`;
  const triageLabel: Record<string, string> = { promising: "Prometteur", compare: "À comparer", deprioritize: "Priorité basse" };
  article.querySelector(".review-prelim")!.textContent = `Première impression : ${triageLabel[candidate?.triage ?? ""] ?? "non établie"} (non définitif)`;
  article.querySelector(".review-note")!.textContent = candidate ? `Examen initial : ${candidate.observation}` : "Examen initial non disponible";
  const video = article.querySelector("video")!;
  const angles = article.querySelector<HTMLElement>(".review-angles")!;
  function setAngle(view: number, initial = false) {
    const wasPlaying = !video.paused;
    video.src = previewURL(filename, view);
    for (const button of angles.querySelectorAll("button")) button.setAttribute("aria-pressed", String(button.dataset.view === String(view)));
    // Do not call load() for every card at first render: the host serves many
    // previews, and 63 simultaneous media requests could trigger HTTP 429.
    if (!initial) {
      video.load();
      if (wasPlaying) void video.play().catch(() => {});
    }
  }
  for (let view = 0; view < 4; view++) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = String(view);
    button.textContent = `Angle ${view + 1}`;
    button.setAttribute("aria-label", `Voir ${filename} sous l'angle ${view + 1}`);
    button.addEventListener("click", () => setAngle(view));
    angles.append(button);
  }
  setAngle(0, true);
  const select = article.querySelector<HTMLSelectElement>(".review-decision")!;
  select.value = choice.choice;
  const note = article.querySelector<HTMLTextAreaElement>("textarea")!;
  note.value = choice.note;
  function record() {
    selections[filename] = { choice: select.value as Choice, note: note.value };
    article.dataset.choice = select.value;
    save();
    updateStats();
  }
  select.addEventListener("change", () => {
    record();
    if (choiceFilter.value !== "all") render();
  });
  note.addEventListener("input", record);
  article.querySelector("a")!.setAttribute("href", `${FOLDER}/${encodeURIComponent(filename.replace(/\.fbx$/, ""))}`);
  return article;
}

function updateStats() {
  const counts = { keep: 0, reject: 0, uncertain: 0, unreviewed: 0 };
  for (const clip of clips) counts[selections[clip.filename]?.choice ?? "unreviewed"]++;
  stats.textContent = `${clips.length} animations · ${counts.keep} à garder · ${counts.reject} à écarter · ${counts.uncertain} à revoir · ${counts.unreviewed} non évaluées`;
}

function render() {
  const term = search.value.toLowerCase().trim();
  const group = family.value;
  const ownChoice = choiceFilter.value;
  const shown = clips.filter(clip =>
    (group === "all" || clip.group === group) &&
    (ownChoice === "all" || (selections[clip.filename]?.choice ?? "unreviewed") === ownChoice) &&
    `${clip.filename} ${clipMetadata.get(clip.filename)?.sourceDescription ?? ""} ${preliminary.get(clip.filename)?.observation ?? ""}`.toLowerCase().includes(term)
  );
  grid.replaceChildren(...shown.map(clip => card(clip.filename, clip.group)));
  if (!shown.length) { const empty = document.createElement("p"); empty.className = "review-empty"; empty.textContent = "Aucune animation ne correspond aux filtres."; grid.append(empty); }
  updateStats();
}

for (const element of [search, family, choiceFilter]) element.addEventListener("input", render);
root.querySelector("#review-export")!.addEventListener("click", () => {
  const candidates = clips.map(clip => {
    const metadata = clipMetadata.get(clip.filename);
    return {
      filename: clip.filename,
      sourceMotionId: metadata?.motionId ?? null,
      sourceFbxSha256: metadata?.sha256 ?? null,
      researchGlbSha256: metadata?.researchGlb?.sha256 ?? null,
      group: clip.group,
      ...(selections[clip.filename] ?? { choice: "unreviewed", note: "" }),
    };
  });
  const output = { schemaVersion: 1, project: "Fighters", origin: "owner_review", generatedAt: new Date().toISOString(), selections, candidates };
  const blob = new Blob([JSON.stringify(output, null, 2) + "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = "fighters-animation-selection.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const fileInput = root.querySelector<HTMLInputElement>("#review-import-file")!;
root.querySelector("#review-import")!.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", async () => {
  if (!fileInput.files?.[0]) return;
  try {
    const payload: unknown = JSON.parse(await fileInput.files[0].text());
    if (!payload || typeof payload !== "object" || (payload as { project?: string }).project !== "Fighters") throw new Error("Ce fichier n'est pas une sélection Fighters.");
    selections = normalizeSelection((payload as { selections?: unknown }).selections);
    save();
    error.textContent = "";
    render();
  } catch (cause) { error.textContent = `Import impossible : ${cause instanceof Error ? cause.message : String(cause)}`; }
  fileInput.value = "";
});

render();
