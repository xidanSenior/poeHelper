// Где игрок в лабиринте — по событиям лога.
// Названия комнат повторяются, поэтому новую комнату ищем среди соседей текущей.

import type { LogEvent } from "../logParser";
import { difficultyFromAreaId, isPlazaAreaId, type Difficulty, type LabLayout } from "./labFormat";
import { neighbors, PLAZA_ID, startRoom } from "./labGraph";

export interface LabState {
  inLab: boolean;
  difficulty: Difficulty | null;
  /** id комнаты из раскладки, PLAZA_ID или null (не удалось определить). */
  roomId: string | null;
  /** areaId последней сгенерированной зоны — подсказка, если по названию неоднозначно. */
  pendingAreaId: string | null;
}

export const initialLabState: LabState = { inLab: false, difficulty: null, roomId: null, pendingAreaId: null };

export type Layouts = Partial<Record<Difficulty, LabLayout>>;

const norm = (s: string) => s.trim().toLowerCase();
const normCode = (s: string) => norm(s).replace(/_#$/, "");

function locateRoom(layout: LabLayout, state: LabState, name: string): string | null {
  const byName = layout.rooms.filter((r) => norm(r.name) === norm(name));
  if (byName.length === 0) return null;

  const pick = (ids: string[]) => {
    if (ids.length === 1) return ids[0];
    if (ids.length > 1 && state.pendingAreaId) {
      const code = normCode(state.pendingAreaId);
      const exact = ids.filter((id) => normCode(byName.find((r) => r.id === id)!.areaCode) === code);
      if (exact.length === 1) return exact[0];
    }
    return null;
  };

  if (state.roomId !== null) {
    const adjacent = new Set(neighbors(layout, state.roomId));
    const found = pick(byName.filter((r) => adjacent.has(r.id)).map((r) => r.id));
    if (found) return found;
  }
  const first = startRoom(layout);
  const isFirst = norm(first.name) === norm(name);
  if (state.roomId === PLAZA_ID && isFirst) return first.id;
  return pick(byName.map((r) => r.id)) ?? (state.roomId === null && isFirst ? first.id : null);
}

export function reduceLab(state: LabState, event: LogEvent, layouts: Layouts): LabState {
  if (event.type === "area-generated") {
    if (isPlazaAreaId(event.areaId)) {
      return { ...state, inLab: true, roomId: PLAZA_ID, pendingAreaId: event.areaId };
    }
    const difficulty = difficultyFromAreaId(event.areaId);
    if (difficulty) return { ...state, inLab: true, difficulty, pendingAreaId: event.areaId };
    return initialLabState; // вышли из лабиринта
  }

  // zone-entered
  if (!state.inLab) return state;
  if (state.pendingAreaId && isPlazaAreaId(state.pendingAreaId)) return state;
  const layout = state.difficulty ? layouts[state.difficulty] : undefined;
  if (!layout) return { ...state, roomId: null };
  return { ...state, roomId: locateRoom(layout, state, event.name) ?? null };
}
