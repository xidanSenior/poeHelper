import { describe, expect, it } from "vitest";
import { parseLine } from "../logParser";
import { difficultyFromAreaId, isLayoutForToday, parseLabLayout, titleCase, type LabLayout } from "./labFormat";
import { exitDirection, finalRoom, neighbors, PLAZA_ID, planRoute } from "./labGraph";
import { initialLabState, reduceLab, type LabState } from "./labTracker";

// Мини-лаба в формате poelab. Названия «estate path» и «aspirant's trial» повторяются.
const LAB_JSON = JSON.stringify({
  difficulty: "Normal",
  date: "2026-11-10",
  weapon: "TwoSwords",
  rooms: [
    { name: "estate path", areacode: "1_labyrinth_oh_straight", id: "1", x: "100", y: "128", contents: ["Trap gauntlet"], exits: { NE: "2" } },
    { name: "aspirant's trial", areacode: "1_labyrinth_boss_1", id: "2", x: "240", y: "128", contents: [], exits: { NW: "3" } },
    { name: "sanitorium halls", areacode: "1_labyrinth_p_branch", id: "3", x: "380", y: "128", contents: ["Switch puzzle"], exits: { NW: "5", NE: "4" } },
    { name: "mansion passage", areacode: "1_labyrinth_eh_straight_#", id: "5", x: "450", y: "40", contents: ["darkshrine"], exits: { NE: "4" } },
    { name: "aspirant's trial", areacode: "1_labyrinth_boss_2", id: "4", x: "520", y: "128", contents: [], exits: { E: "6" } },
    { name: "estate path", areacode: "1_labyrinth_rt_straight", id: "6", x: "620", y: "128", contents: [], exits: { E: "7" } },
    { name: "aspirant's trial", areacode: "1_labyrinth_boss_3", id: "7", x: "720", y: "128", contents: [], exits: {} },
  ],
});

const lab: LabLayout = parseLabLayout(LAB_JSON);
const layouts = { Normal: lab };

const gen = (areaId: string, level = 33) =>
  `2026/11/10 12:00:00 1 a [DEBUG Client 1] Generating level ${level} area "${areaId}" with seed 1`;
const enter = (name: string) => `2026/11/10 12:00:01 1 a [INFO Client 1] : You have entered ${name}.`;

function play(lines: string[], state: LabState = initialLabState): LabState {
  for (const line of lines) {
    const ev = parseLine(line);
    if (ev) state = reduceLab(state, ev, layouts);
  }
  return state;
}

describe("parseLabLayout", () => {
  it("reads rooms, title-cases names, converts coordinates", () => {
    expect(lab.difficulty).toBe("Normal");
    expect(lab.rooms[0]).toMatchObject({ id: "1", name: "Estate Path", x: 100, y: 128, exits: { NE: "2" } });
  });

  it("rejects bad files with readable errors", () => {
    expect(() => parseLabLayout("nope")).toThrow(/JSON/);
    expect(() => parseLabLayout("{}")).toThrow(/rooms/);
    expect(() => parseLabLayout('{"difficulty":"Easy","rooms":[]}')).toThrow(/сложность/);
  });

  it("title-cases names with apostrophes", () => {
    expect(titleCase("aspirant's trial")).toBe("Aspirant's Trial");
  });

  it("checks the layout date against today (UTC)", () => {
    expect(isLayoutForToday(lab, new Date("2026-11-10T23:00:00Z"))).toBe(true);
    expect(isLayoutForToday(lab, new Date("2026-11-11T00:30:00Z"))).toBe(false);
  });
});

describe("difficultyFromAreaId", () => {
  it.each([
    ["1_Labyrinth_boss_1", "Normal"],
    ["2_Labyrinth_oh_straight", "Cruel"],
    ["3_labyrinth_boss_3", "Merciless"],
    ["4_Labyrinth_x", "Uber"],
  ])("%s → %s", (id, d) => expect(difficultyFromAreaId(id)).toBe(d));

  it("ignores normal zones", () => expect(difficultyFromAreaId("1_1_2")).toBeNull());
});

describe("labGraph", () => {
  it("finds the final Izaro room", () => expect(finalRoom(lab).id).toBe("7"));

  it("lists neighbours both ways, plaza included", () => {
    expect(neighbors(lab, "1").sort()).toEqual(["2", PLAZA_ID].sort());
    expect(neighbors(lab, "4").sort()).toEqual(["3", "5", "6"]);
  });

  it("plans the shortest forward route to Izaro", () => {
    expect(planRoute(lab, PLAZA_ID)).toEqual([PLAZA_ID, "1", "2", "3", "4", "6", "7"]);
    expect(planRoute(lab, "5")).toEqual(["5", "4", "6", "7"]);
  });

  it("gives the exit direction", () => {
    expect(exitDirection(lab, "3", "4")).toBe("NE");
    expect(exitDirection(lab, "4", "3")).toBeNull();
  });
});

describe("reduceLab", () => {
  it("enters plaza, then tracks rooms with duplicate names", () => {
    let s = play([gen("Labyrinth_Airlock"), enter("Aspirants' Plaza")]);
    expect(s).toMatchObject({ inLab: true, roomId: PLAZA_ID });

    s = play([gen("1_Labyrinth_oh_straight"), enter("Estate Path")], s);
    expect(s).toMatchObject({ difficulty: "Normal", roomId: "1" });

    s = play([gen("1_Labyrinth_boss_1"), enter("Aspirant's Trial")], s);
    expect(s.roomId).toBe("2");

    s = play([gen("1_Labyrinth_p_branch"), enter("Sanitorium Halls"), gen("1_Labyrinth_boss_2"), enter("Aspirant's Trial")], s);
    expect(s.roomId).toBe("4");

    // Второй Estate Path — выбираем соседа текущей комнаты, а не первую комнату лабы.
    s = play([gen("1_Labyrinth_rt_straight"), enter("Estate Path")], s);
    expect(s.roomId).toBe("6");
  });

  it("uses the area id to disambiguate when position is unknown", () => {
    const lost: LabState = { inLab: true, difficulty: "Normal", roomId: null, pendingAreaId: null };
    expect(play([gen("1_Labyrinth_rt_straight"), enter("Estate Path")], lost).roomId).toBe("6");
    expect(play([gen("1_Labyrinth_EH_straight_#"), enter("Mansion Passage")], lost).roomId).toBe("5");
  });

  it("leaves the lab on any other zone", () => {
    const s = play([gen("Labyrinth_Airlock"), enter("Aspirants' Plaza"), gen("1_3_town", 30), enter("The Sarn Encampment")]);
    expect(s).toEqual(initialLabState);
  });

  it("does not track rooms without a loaded layout", () => {
    const s = play([gen("2_Labyrinth_oh_straight", 55), enter("Estate Path")]);
    expect(s).toMatchObject({ inLab: true, difficulty: "Cruel", roomId: null });
  });
});
