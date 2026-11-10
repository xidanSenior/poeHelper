// Формат "3rd-Party Export" сайта exile-leveling (https://heartofphos.github.io/exile-leveling/).
// Это JSON-массив: обработанные секции маршрута, последним элементом строка "pob-code:<код|none>".
// Типы повторяют RouteData/Fragments из common/src/types.d.ts проекта exile-leveling (MIT).

export type Fragment =
  | string
  | { type: "kill" | "arena" | "quest_text" | "generic"; value: string }
  | { type: "area" | "enter" | "logout"; areaId: string }
  | { type: "waypoint" | "waypoint_get" | "portal_set" | "trial" }
  | { type: "waypoint_use"; dstAreaId: string; srcAreaId: string }
  | { type: "portal_use"; dstAreaId: string }
  | { type: "quest"; questId: string; rewardOffers: string[] }
  | { type: "reward_quest"; item: string }
  | { type: "reward_vendor"; item: string; cost?: string }
  | { type: "ascend"; version: "normal" | "cruel" | "merciless" | "eternal" }
  | { type: "crafting"; crafting_recipes: string[] }
  | { type: "dir"; dirIndex: number }
  | { type: "copy"; text: string; side: "head" | "tail" };

export interface FragmentStep {
  type: "fragment_step";
  parts: Fragment[];
  subSteps: FragmentStep[];
}

export interface GemStep {
  type: "gem_step";
  requiredGem: { id: string; note: string; count: number };
  rewardType: "quest" | "vendor";
  count: number;
}

export interface Section {
  name: string;
  steps: (FragmentStep | GemStep)[];
}

export interface RouteExport {
  sections: Section[];
  pobCode: string | null;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

function isSection(v: unknown): v is Section {
  return isObject(v) && typeof v.name === "string" && Array.isArray(v.steps);
}

/** Разбирает текст, скопированный кнопкой "3rd-Party Export". Бросает Error с понятным сообщением. */
export function parseExport(text: string): RouteExport {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Это не JSON. Скопируй маршрут кнопкой «3rd-Party Export» на сайте exile-leveling.");
  }
  if (!Array.isArray(data)) throw new Error("Ожидался JSON-массив из «3rd-Party Export».");

  const sections = data.filter(isSection);
  if (sections.length === 0) throw new Error("В экспорте нет секций маршрута.");

  const pobEntry = data.find((x): x is string => typeof x === "string" && x.startsWith("pob-code:"));
  const pob = pobEntry?.slice("pob-code:".length) ?? "none";

  return { sections, pobCode: pob === "none" || pob === "" ? null : pob };
}
