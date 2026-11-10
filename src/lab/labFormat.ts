// Раскладка лабиринта в JSON-формате poelab.com (тот же файл, что импортирует LabCompass).
// poelab запрещает автоматическое скачивание — файл пользователь загружает сам.

export type Difficulty = "Normal" | "Cruel" | "Merciless" | "Uber";
export const DIFFICULTIES: Difficulty[] = ["Normal", "Cruel", "Merciless", "Uber"];

export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "C";

export interface LabRoom {
  id: string;
  name: string;
  areaCode: string;
  x: number;
  y: number;
  contents: string[];
  exits: Partial<Record<Direction, string>>;
  secretPassage?: string;
}

export interface LabLayout {
  difficulty: Difficulty;
  date: string;
  rooms: LabRoom[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** "estate path" → "Estate Path" (так комната пишется в логе). */
export function titleCase(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export function parseLabLayout(text: string): LabLayout {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Это не JSON. Нужен JSON-файл раскладки лабиринта с poelab.com.");
  }
  if (!isObject(data) || !Array.isArray(data.rooms)) throw new Error("В файле нет списка комнат (rooms).");

  const difficulty = DIFFICULTIES.find((d) => d.toLowerCase() === String(data.difficulty).toLowerCase());
  if (!difficulty) throw new Error(`Неизвестная сложность лабиринта: ${String(data.difficulty)}`);

  const rooms: LabRoom[] = data.rooms.map((r: unknown, i: number) => {
    if (!isObject(r) || r.id === undefined || typeof r.name !== "string") {
      throw new Error(`Комната №${i + 1}: нет id или name.`);
    }
    const exits: Partial<Record<Direction, string>> = {};
    if (isObject(r.exits)) {
      for (const [dir, target] of Object.entries(r.exits)) exits[dir as Direction] = String(target);
    }
    return {
      id: String(r.id),
      name: titleCase(r.name),
      areaCode: typeof r.areacode === "string" ? r.areacode : "",
      x: Number(r.x) || 0,
      y: Number(r.y) || 0,
      contents: Array.isArray(r.contents) ? r.contents.map(String) : [],
      exits,
      secretPassage: r.secretPassage !== undefined && r.secretPassage !== "" ? String(r.secretPassage) : undefined,
    };
  });
  if (rooms.length === 0) throw new Error("Список комнат пуст.");

  return { difficulty, date: typeof data.date === "string" ? data.date : "", rooms };
}

/** Комнаты лабы в логе: "1_Labyrinth_…" (1 — Normal, 2 — Cruel, 3 — Merciless, 4 — Uber). */
export function difficultyFromAreaId(areaId: string): Difficulty | null {
  const m = /^(\d)_labyrinth_/i.exec(areaId);
  return m ? (DIFFICULTIES[Number(m[1]) - 1] ?? null) : null;
}

/** Aspirants' Plaza. */
export function isPlazaAreaId(areaId: string): boolean {
  return /labyrinth_airlock/i.test(areaId);
}

/** Раскладка обновляется в полночь UTC. */
export function isLayoutForToday(layout: LabLayout, now = new Date()): boolean {
  return layout.date === now.toISOString().slice(0, 10);
}
