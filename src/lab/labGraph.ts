// Граф комнат: соседи, кратчайший путь до Izaro, направление выхода.

import type { Direction, LabLayout, LabRoom } from "./labFormat";

export const PLAZA_ID = "plaza";

export function roomById(layout: LabLayout, id: string): LabRoom | undefined {
  return layout.rooms.find((r) => r.id === id);
}

/** Первая комната лабы — куда ведёт дверь из Aspirants' Plaza. */
export function startRoom(layout: LabLayout): LabRoom {
  return layout.rooms[0];
}

/** Комната финального Izaro: последний Aspirant's Trial. */
export function finalRoom(layout: LabLayout): LabRoom {
  const byCode = layout.rooms.find((r) => /boss_3$/i.test(r.areaCode));
  if (byCode) return byCode;
  const trials = layout.rooms.filter((r) => r.name === "Aspirant's Trial");
  return trials.at(-1) ?? layout.rooms[layout.rooms.length - 1];
}

/** Соседи в обе стороны: по дверям можно ходить и назад. */
export function neighbors(layout: LabLayout, id: string): string[] {
  if (id === PLAZA_ID) return [startRoom(layout).id];
  const result = new Set<string>();
  for (const room of layout.rooms) {
    if (room.id === id) Object.values(room.exits).forEach((t) => t && result.add(t));
    else if (Object.values(room.exits).includes(id)) result.add(room.id);
  }
  if (startRoom(layout).id === id) result.add(PLAZA_ID);
  return [...result];
}

function bfs(from: string, to: string, next: (id: string) => string[]): string[] | null {
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift()!;
    if (id === to) {
      const path: string[] = [];
      for (let cur: string | null = id; cur !== null; cur = prev.get(cur) ?? null) path.unshift(cur);
      return path;
    }
    for (const n of next(id)) {
      if (!prev.has(n)) {
        prev.set(n, id);
        queue.push(n);
      }
    }
  }
  return null;
}

/** Кратчайший путь от комнаты до Izaro (включая обе крайние комнаты). */
export function planRoute(layout: LabLayout, from: string): string[] {
  const to = finalRoom(layout).id;
  const forward = (id: string) =>
    id === PLAZA_ID ? [startRoom(layout).id] : Object.values(roomById(layout, id)?.exits ?? {}).filter(Boolean) as string[];
  // Сначала только вперёд по дверям; если игрок «потерялся» — по любым связям.
  return bfs(from, to, forward) ?? bfs(from, to, (id) => neighbors(layout, id)) ?? [from];
}

export function exitDirection(layout: LabLayout, from: string, to: string): Direction | null {
  if (from === PLAZA_ID) return null;
  const room = roomById(layout, from);
  const entry = Object.entries(room?.exits ?? {}).find(([, target]) => target === to);
  return (entry?.[0] as Direction) ?? null;
}

export const DIRECTION_ARROWS: Record<Direction, string> = {
  N: "↑",
  NE: "↗",
  E: "→",
  SE: "↘",
  S: "↓",
  SW: "↙",
  W: "←",
  NW: "↖",
  C: "•",
};
