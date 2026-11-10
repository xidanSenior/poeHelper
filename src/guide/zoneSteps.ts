// Превращает плоский список шагов exile-leveling в шаги «по зонам»:
// всё, что нужно сделать в зоне X, — один шаг оверлея, который показывается, пока игрок в X.

import type { Fragment, FragmentStep, GemStep, Section } from "./exportFormat";

export interface Area {
  name: string;
  act: number;
  town: boolean;
  townId: string | null;
}

export interface GameData {
  areas: Record<string, Area>;
  quests: Record<string, string>;
  gems: Record<string, { name: string; support: boolean }>;
}

export type SegmentKind = "text" | "kill" | "area" | "quest" | "trial" | "gem" | "dir" | "reward" | "waypoint";

export interface Segment {
  text: string;
  kind: SegmentKind;
}

export interface RouteItem {
  line: Segment[];
  sub: Segment[][];
}

export interface ZoneStep {
  areaId: string;
  zone: string;
  act: number;
  town: boolean;
  section: string;
  items: RouteItem[];
}

/** Игра начинается на The Twilight Strand. */
export const START_AREA_ID = "1_1_1";

const ARROWS = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];

const LAB_NAMES: Record<string, string> = {
  normal: "Normal",
  cruel: "Cruel",
  merciless: "Merciless",
  eternal: "Eternal (Uber)",
};

function areaName(data: GameData, id: string): string {
  return data.areas[id]?.name ?? id;
}

function renderFragment(f: Fragment, data: GameData): Segment {
  if (typeof f === "string") return { text: f, kind: "text" };
  switch (f.type) {
    case "kill":
      return { text: f.value, kind: "kill" };
    case "arena":
      return { text: f.value, kind: "area" };
    case "quest_text":
    case "generic":
      return { text: f.value, kind: "text" };
    case "area":
    case "enter":
      return { text: areaName(data, f.areaId), kind: "area" };
    case "logout":
      return { text: `Logout → ${areaName(data, f.areaId)}`, kind: "waypoint" };
    case "waypoint":
      return { text: "вейпоинт", kind: "waypoint" };
    case "waypoint_get":
      return { text: "вейпоинт", kind: "waypoint" };
    case "waypoint_use":
      return { text: `вейпоинт → ${areaName(data, f.dstAreaId)}`, kind: "waypoint" };
    case "portal_set":
      return { text: "портал", kind: "waypoint" };
    case "portal_use":
      return { text: `портал → ${areaName(data, f.dstAreaId)}`, kind: "waypoint" };
    case "quest":
      return { text: data.quests[f.questId] ?? f.questId, kind: "quest" };
    case "reward_quest":
      return { text: f.item, kind: "reward" };
    case "reward_vendor":
      return { text: f.cost ? `${f.item} (${f.cost})` : f.item, kind: "reward" };
    case "trial":
      return { text: "🔺 Trial of Ascendancy", kind: "trial" };
    case "ascend":
      return { text: `🔺 Лабиринт ${LAB_NAMES[f.version] ?? f.version}`, kind: "trial" };
    case "crafting":
      return {
        text: f.crafting_recipes.length ? `рецепт крафта (${f.crafting_recipes.join(", ")})` : "рецепт крафта",
        kind: "reward",
      };
    case "dir":
      return { text: ARROWS[((f.dirIndex % 8) + 8) % 8], kind: "dir" };
    case "copy":
      return { text: f.text, kind: "text" };
  }
}

function renderLine(parts: Fragment[], data: GameData): Segment[] {
  return parts.map((p) => renderFragment(p, data));
}

function renderGem(step: GemStep, data: GameData): RouteItem {
  const name = data.gems[step.requiredGem.id]?.name ?? step.requiredGem.id;
  const verb = step.rewardType === "quest" ? "Награда за квест:" : "Купи у торговца:";
  const count = step.count > 1 ? ` ×${step.count}` : "";
  const line: Segment[] = [
    { text: `💎 ${verb} `, kind: "text" },
    { text: name + count, kind: "gem" },
  ];
  const note = step.requiredGem.note?.trim();
  return { line, sub: note ? [[{ text: note, kind: "text" }]] : [] };
}

/** Куда попадёт игрок после выполнения шага (null — остаётся в текущей зоне). */
function destination(step: FragmentStep): string | null {
  let dst: string | null = null;
  for (const p of step.parts) {
    if (typeof p === "string") continue;
    if (p.type === "enter" || p.type === "logout") dst = p.areaId;
    else if (p.type === "waypoint_use" || p.type === "portal_use") dst = p.dstAreaId;
  }
  return dst;
}

export function buildZoneSteps(sections: Section[], data: GameData): ZoneStep[] {
  const result: ZoneStep[] = [];
  let currentArea = START_AREA_ID;
  let current: ZoneStep | null = null;

  const ensureStep = (section: string): ZoneStep => {
    if (current && current.areaId === currentArea) return current;
    const area = data.areas[currentArea];
    current = {
      areaId: currentArea,
      zone: area?.name ?? currentArea,
      act: area?.act ?? 0,
      town: area?.town ?? false,
      section,
      items: [],
    };
    result.push(current);
    return current;
  };

  for (const section of sections) {
    for (const step of section.steps) {
      const zoneStep = ensureStep(section.name);
      if (step.type === "gem_step") {
        zoneStep.items.push(renderGem(step, data));
        continue;
      }
      zoneStep.items.push({
        line: renderLine(step.parts, data),
        sub: step.subSteps.map((s) => renderLine(s.parts, data)),
      });
      // Переход выполняется в конце шага: инструкция «как дойти» остаётся в старой зоне.
      const dst = destination(step);
      if (dst) currentArea = dst;
    }
  }
  return result;
}
