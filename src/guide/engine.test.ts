import { describe, expect, it } from "vitest";
import { advanceOnArea, clampStep, type StepLocation } from "./engine";

const steps: StepLocation[] = [
  { areaId: "1_1_1", town: false }, // Twilight Strand
  { areaId: "1_1_town", town: true },
  { areaId: "1_1_2", town: false }, // Coast
  { areaId: "1_1_3", town: false }, // Mud Flats
  { areaId: "1_1_town", town: true },
  { areaId: "1_1_5", town: false }, // Ledge
  { areaId: "2_6_2", town: false }, // Coast, акт 6
];

describe("advanceOnArea", () => {
  it("moves to the next matching step", () => {
    expect(advanceOnArea(steps, 0, "1_1_town")).toBe(1);
    expect(advanceOnArea(steps, 1, "1_1_2")).toBe(2);
  });

  it("skips ahead over optional steps", () => {
    expect(advanceOnArea(steps, 2, "1_1_5")).toBe(5);
  });

  it("stays when re-entering the current zone", () => {
    expect(advanceOnArea(steps, 2, "1_1_2")).toBe(2);
  });

  it("ignores a far-away town visit (portal to sell)", () => {
    expect(advanceOnArea(steps, 2, "1_1_town")).toBe(2);
  });

  it("accepts the town when it is the very next step", () => {
    expect(advanceOnArea(steps, 3, "1_1_town")).toBe(4);
  });

  it("does not confuse act 1 and act 6 zones", () => {
    expect(advanceOnArea(steps, 3, "1_1_2")).toBe(3);
  });

  it("stays on unknown areas (hideout, maps)", () => {
    expect(advanceOnArea(steps, 2, "HideoutFelled")).toBe(2);
  });
});

describe("clampStep", () => {
  it("keeps index within bounds", () => {
    expect(clampStep(7, -1)).toBe(0);
    expect(clampStep(7, 99)).toBe(6);
    expect(clampStep(0, 3)).toBe(0);
  });
});
