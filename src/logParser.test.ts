import { describe, expect, it } from "vitest";
import { actFromAreaId, initialZoneState, parseLine, reduceLines } from "./logParser";

const GEN = '2024/07/26 19:22:13 1234567 cff945b9 [DEBUG Client 1234] Generating level 2 area "1_1_2" with seed 2938475';
const ENTER = "2024/07/26 19:22:15 1236789 cb7bd3b1 [INFO Client 1234] : You have entered The Coast.";

describe("parseLine", () => {
  it("parses area generation", () => {
    expect(parseLine(GEN)).toEqual({ type: "area-generated", level: 2, areaId: "1_1_2" });
  });

  it("parses zone entered", () => {
    expect(parseLine(ENTER)).toEqual({ type: "zone-entered", name: "The Coast" });
  });

  it("keeps dots inside zone names", () => {
    const line = "2024/07/26 19:22:15 1 a [INFO Client 1] : You have entered St. Something's Rest.";
    expect(parseLine(line)).toEqual({ type: "zone-entered", name: "St. Something's Rest" });
  });

  it("ignores chat that imitates the message", () => {
    const chat = "2024/07/26 19:22:15 1 a [INFO Client 1] #Player: You have entered The Coast.";
    expect(parseLine(chat)).toBeNull();
  });

  it("ignores unrelated lines", () => {
    expect(parseLine("2024/07/26 19:22:15 1 a [INFO Client 1] Connecting to instance server")).toBeNull();
  });
});

describe("actFromAreaId", () => {
  it.each([
    ["1_1_2", 1],
    ["1_1_town", 1],
    ["1_5_1", 5],
    ["2_6_1", 6],
    ["2_10_town", 10],
  ])("%s → act %i", (id, act) => {
    expect(actFromAreaId(id)).toBe(act);
  });

  it("returns null for maps and hideouts", () => {
    expect(actFromAreaId("MapWorldsBeach")).toBeNull();
    expect(actFromAreaId("HideoutFelled")).toBeNull();
  });
});

describe("reduceLines", () => {
  it("tracks the latest zone from a backlog", () => {
    const state = reduceLines(initialZoneState, [GEN, ENTER]);
    expect(state).toEqual({ name: "The Coast", areaId: "1_1_2", level: 2, act: 1 });
  });

  it("drops the old name when a new area is generated", () => {
    const next = '2024/07/26 19:30:00 1 a [DEBUG Client 1] Generating level 3 area "1_1_3" with seed 1';
    const state = reduceLines(initialZoneState, [GEN, ENTER, next]);
    expect(state).toEqual({ name: null, areaId: "1_1_3", level: 3, act: 1 });
  });
});
