// Движок гайда: по входу в зону решает, на каком шаге маршрута сейчас игрок.
// Сопоставление идёт по areaId из лога ("Generating level N area \"<id>\"") — не зависит от языка клиента.

export interface StepLocation {
  areaId: string;
  town: boolean;
}

export function advanceOnArea<T extends StepLocation>(steps: T[], current: number, areaId: string): number {
  if (!steps[current] || steps[current].areaId === areaId) return current;

  for (let j = current + 1; j < steps.length; j++) {
    if (steps[j].areaId !== areaId) continue;
    // Портал в город посреди зоны — не повод пропускать шаги до следующего визита в город.
    if (steps[j].town && j > current + 1) return current;
    return j;
  }
  return current;
}

export function clampStep(length: number, index: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
