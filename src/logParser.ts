// Разбор строк Client.txt. Только чтение лога — это разрешённый GGG способ узнать, где игрок.

export type LogEvent =
  | { type: "area-generated"; level: number; areaId: string }
  | { type: "zone-entered"; name: string };

// 2024/07/26 19:22:13 123 abc [DEBUG Client 1234] Generating level 2 area "1_1_2" with seed 1
// Не зависит от языка клиента: areaId одинаковый для любой локализации.
const GENERATING_RE = /Generating level (\d+) area "([^"]+)"/;

// 2024/07/26 19:22:13 123 abc [INFO Client 1234] : You have entered The Coast.
const ENTERED_RE = /\] : You have entered (.+)\.$/;

export function parseLine(line: string): LogEvent | null {
  const gen = GENERATING_RE.exec(line);
  if (gen) return { type: "area-generated", level: Number(gen[1]), areaId: gen[2] };

  const entered = ENTERED_RE.exec(line);
  if (entered) return { type: "zone-entered", name: entered[1] };

  return null;
}

export interface ZoneState {
  name: string | null;
  areaId: string | null;
  level: number | null;
  act: number | null;
}

export const initialZoneState: ZoneState = { name: null, areaId: null, level: null, act: null };

/** "1_1_2" → 1, "2_5_town" → 2, "MapWorldsBeach" → null */
export function actFromAreaId(areaId: string): number | null {
  const m = /^(\d+)_(\d+)_/.exec(areaId);
  if (!m) return null;
  // Акты 6–10 кодируются как "2_6_..." … "2_10_..." (вторая часть — номер акта).
  return Number(m[2]);
}

export function reduceZone(state: ZoneState, event: LogEvent): ZoneState {
  switch (event.type) {
    case "area-generated":
      // Генерация зоны всегда идёт перед "You have entered", поэтому имя сбрасываем.
      return { name: null, areaId: event.areaId, level: event.level, act: actFromAreaId(event.areaId) };
    case "zone-entered":
      return { ...state, name: event.name };
  }
}

export function reduceLines(state: ZoneState, lines: string[]): ZoneState {
  let next = state;
  for (const line of lines) {
    const event = parseLine(line);
    if (event) next = reduceZone(next, event);
  }
  return next;
}
