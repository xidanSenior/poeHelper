import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { initialZoneState, parseLine, reduceZone, type ZoneState } from "./logParser";
import { advanceOnArea, clampStep } from "./guide/engine";
import { parseExport } from "./guide/exportFormat";
import { buildZoneSteps, type GameData, type Segment, type ZoneStep } from "./guide/zoneSteps";
import gameDataJson from "./guide/data/game-data.json";
import { DIFFICULTIES, isLayoutForToday, parseLabLayout } from "./lab/labFormat";
import { initialLabState, reduceLab, type LabState, type Layouts } from "./lab/labTracker";
import { buildLabView } from "./lab/labView";

interface LogBatch {
  lines: string[];
  backlog: boolean;
}

const gameData = gameDataJson as unknown as GameData;

const KEY_LOG_PATH = "poe-overlay.logPath";
const KEY_STEP = "poe-overlay.step";
const KEY_ROUTE = "poe-overlay.routeExport";
const KEY_LAB = (d: string) => `poe-overlay.lab.${d}`;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const zoneEl = $("zone");
const actEl = $("act");
const levelEl = $("level");
const statusEl = $("status");
const stepZoneEl = $("step-zone");
const stepCounterEl = $("step-counter");
const stepItemsEl = $("step-items");
const stepNextEl = $("step-next");
const pathInput = $<HTMLInputElement>("log-path");
const routeInput = $<HTMLTextAreaElement>("route-export");
const routeInfoEl = $("route-info");
const guideEl = $("guide");
const labEl = $("lab");
const labTitleEl = $("lab-title");
const labWarningEl = $("lab-warning");
const labMapEl = $("lab-map");
const labLinesEl = $("lab-lines");
const labInput = $<HTMLTextAreaElement>("lab-export");
const labFileInput = $<HTMLInputElement>("lab-file");
const labInfoEl = $("lab-info");

const DEFAULT_STATUS = statusEl.textContent ?? "";
let zone: ZoneState = initialZoneState;
let route: ZoneStep[] = [];
let step = 0;
let lab: LabState = initialLabState;
const labLayouts: Layouts = {};

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* не критично — просто не запомнится между запусками */
  }
}

function renderSegments(segments: Segment[]): Node[] {
  return segments.map((seg) => {
    if (seg.kind === "text") return document.createTextNode(seg.text);
    const span = document.createElement("span");
    span.className = `seg-${seg.kind}`;
    span.textContent = seg.text;
    return span;
  });
}

function renderLab() {
  const view = buildLabView(lab.difficulty ? labLayouts[lab.difficulty] : undefined, lab);
  labTitleEl.textContent = view.title;
  labWarningEl.hidden = view.warning === null;
  labWarningEl.textContent = view.warning ?? "";
  labMapEl.replaceChildren(...(view.map ? [view.map] : []));
  labLinesEl.replaceChildren(
    ...view.lines.map((l) => {
      const li = document.createElement("li");
      li.textContent = l.text;
      if (l.cls) li.className = l.cls;
      return li;
    }),
  );
}

function render() {
  zoneEl.textContent = zone.name ?? (zone.areaId ? "Загрузка зоны…" : "Ожидание лога…");
  actEl.textContent = zone.act ? `Акт ${zone.act}` : zone.areaId ? "Вне актов" : "—";
  levelEl.textContent = zone.level ? `Ур. зоны ${zone.level}` : "";

  // В лабиринте вместо гайда показываем панель лабы.
  labEl.hidden = !lab.inLab;
  guideEl.hidden = lab.inLab;
  if (lab.inLab) {
    renderLab();
    return;
  }

  const current = route[step];
  if (!current) {
    stepZoneEl.textContent = "Маршрут не загружен";
    stepCounterEl.textContent = "";
    stepItemsEl.replaceChildren();
    stepNextEl.textContent = "Alt+Shift+O → вставь «3rd-Party Export» с exile-leveling";
    return;
  }

  const here = zone.areaId === current.areaId;
  stepZoneEl.textContent = here ? `${current.section} · здесь` : `${current.section} · иди в ${current.zone}`;
  stepZoneEl.classList.toggle("away", !here);
  stepCounterEl.textContent = `${step + 1}/${route.length}`;
  stepItemsEl.replaceChildren(
    ...current.items.map((item) => {
      const li = document.createElement("li");
      li.append(...renderSegments(item.line));
      for (const sub of item.sub) {
        const div = document.createElement("div");
        div.className = "sub";
        div.append(...renderSegments(sub));
        li.append(div);
      }
      return li;
    }),
  );
  const next = route[step + 1];
  stepNextEl.textContent = next ? `Далее: ${next.zone}` : "Конец маршрута";
}

function setStep(index: number) {
  step = clampStep(route.length, index);
  writeStorage(KEY_STEP, String(step));
  render();
}

function loadRoute(text: string, resetStep: boolean): boolean {
  try {
    const parsed = parseExport(text);
    route = buildZoneSteps(parsed.sections, gameData);
    routeInfoEl.textContent = `${route.length} шагов${parsed.pobCode ? " · с билдом PoB" : ""}`;
    writeStorage(KEY_ROUTE, text);
    setStep(resetStep ? 0 : Number(readStorage(KEY_STEP) ?? 0) || 0);
    setStatus(DEFAULT_STATUS);
    return true;
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
    return false;
  }
}

function renderLabInfo() {
  const loaded = DIFFICULTIES.filter((d) => labLayouts[d]).map((d) => {
    const l = labLayouts[d]!;
    return `${d} ${l.date}${isLayoutForToday(l) ? "" : " (старая)"}`;
  });
  labInfoEl.textContent = loaded.length ? `Загружено: ${loaded.join(" · ")}` : "Раскладки не загружены";
}

function loadLab(text: string, save: boolean): boolean {
  try {
    const layout = parseLabLayout(text);
    labLayouts[layout.difficulty] = layout;
    if (save) writeStorage(KEY_LAB(layout.difficulty), text);
    renderLabInfo();
    render();
    if (save) setStatus(`Лабиринт ${layout.difficulty} (${layout.date}) загружен`);
    return true;
  } catch (err) {
    setStatus(err instanceof Error ? err.message : String(err), true);
    return false;
  }
}

function applyLines(lines: string[]) {
  let nextStep = step;
  for (const line of lines) {
    const event = parseLine(line);
    if (!event) continue;
    zone = reduceZone(zone, event);
    lab = reduceLab(lab, event, labLayouts);
    if (event.type === "area-generated") nextStep = advanceOnArea(route, nextStep, event.areaId);
  }
  if (nextStep !== step) setStep(nextStep);
  else render();
}

function setStatus(text: string, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

async function startWatch(path: string) {
  try {
    zone = initialZoneState;
    render();
    await invoke("start_watch", { path });
    writeStorage(KEY_LOG_PATH, path);
    setStatus(DEFAULT_STATUS);
  } catch (err) {
    setStatus(String(err), true);
  }
}

async function init() {
  const savedRoute = readStorage(KEY_ROUTE);
  if (savedRoute) loadRoute(savedRoute, false);
  for (const d of DIFFICULTIES) {
    const saved = readStorage(KEY_LAB(d));
    if (saved) loadLab(saved, false);
  }
  renderLabInfo();
  render();

  await listen<LogBatch>("log-lines", ({ payload }) => applyLines(payload.lines));
  await listen<boolean>("interactive-changed", ({ payload }) => {
    document.body.classList.toggle("interactive", payload);
  });
  await listen<number>("guide-nav", ({ payload }) => setStep(step + payload));

  $("save-path").addEventListener("click", () => startWatch(pathInput.value.trim()));
  pathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") startWatch(pathInput.value.trim());
  });
  $("load-route").addEventListener("click", () => {
    if (loadRoute(routeInput.value.trim(), true)) routeInput.value = "";
  });
  $("load-lab").addEventListener("click", () => {
    if (loadLab(labInput.value.trim(), true)) labInput.value = "";
  });
  // Ctrl+V в поле сразу загружает — кнопку нажимать не нужно.
  labInput.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text")?.trim();
    if (!text) return;
    e.preventDefault();
    if (!loadLab(text, true)) labInput.value = text;
  });
  routeInput.addEventListener("paste", (e) => {
    const text = e.clipboardData?.getData("text")?.trim();
    if (!text) return;
    e.preventDefault();
    if (!loadRoute(text, true)) routeInput.value = text;
  });
  labFileInput.addEventListener("change", async () => {
    for (const file of labFileInput.files ?? []) loadLab(await file.text(), true);
    labFileInput.value = "";
  });
  $("step-prev").addEventListener("click", () => setStep(step - 1));
  $("step-next-btn").addEventListener("click", () => setStep(step + 1));
  $("step-reset").addEventListener("click", () => setStep(0));

  const path = readStorage(KEY_LOG_PATH) ?? (await invoke<string | null>("detect_log_path"));
  if (path) {
    pathInput.value = path;
    await startWatch(path);
  } else {
    setStatus("Client.txt не найден — Alt+Shift+O и укажи путь", true);
  }
}

init();
