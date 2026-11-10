import { describe, expect, it } from "vitest";
import { parseExport, type Section } from "./exportFormat";
import { buildZoneSteps, type GameData } from "./zoneSteps";
import realData from "./data/game-data.json";

const data = realData as unknown as GameData;

// Фрагмент в формате 3rd-Party Export (начало акта 1).
const sections: Section[] = [
  {
    name: "Act 1",
    steps: [
      { type: "fragment_step", parts: ["Find and kill ", { type: "kill", value: "Hillock" }], subSteps: [] },
      { type: "fragment_step", parts: ["➞ ", { type: "enter", areaId: "1_1_town" }], subSteps: [] },
      { type: "fragment_step", parts: ["Hand in ", { type: "quest", questId: "a1q1", rewardOffers: ["a1q1"] }], subSteps: [] },
      {
        type: "gem_step",
        requiredGem: { id: "Metadata/Items/Gems/SkillGemFireball", note: "", count: 1 },
        rewardType: "quest",
        count: 1,
      },
      {
        type: "fragment_step",
        parts: ["➞ ", { type: "enter", areaId: "1_1_2" }],
        subSteps: [{ type: "fragment_step", parts: ["Go ", { type: "dir", dirIndex: 2 }], subSteps: [] }],
      },
      { type: "fragment_step", parts: ["Get ", { type: "waypoint_get" }], subSteps: [] },
      { type: "fragment_step", parts: [{ type: "logout", areaId: "1_1_town" }], subSteps: [] },
      { type: "fragment_step", parts: [{ type: "waypoint_use", dstAreaId: "1_1_2", srcAreaId: "1_1_town" }], subSteps: [] },
      { type: "fragment_step", parts: ["Complete ", { type: "trial" }], subSteps: [] },
    ],
  },
];

describe("parseExport", () => {
  it("parses sections and pob code", () => {
    const parsed = parseExport(JSON.stringify([...sections, "pob-code:abc123"]));
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.pobCode).toBe("abc123");
  });

  it("treats pob-code:none as no build", () => {
    expect(parseExport(JSON.stringify([...sections, "pob-code:none"])).pobCode).toBeNull();
  });

  it("rejects non-JSON and empty exports with readable errors", () => {
    expect(() => parseExport("hello")).toThrow(/JSON/);
    expect(() => parseExport("{}")).toThrow(/массив/);
    expect(() => parseExport('["pob-code:none"]')).toThrow(/секций/);
  });
});

describe("buildZoneSteps", () => {
  const steps = buildZoneSteps(sections, data);

  it("groups steps by zone, starting at The Twilight Strand", () => {
    expect(steps.map((s) => s.zone)).toEqual([
      "The Twilight Strand",
      "Lioneye's Watch",
      "The Coast",
      "Lioneye's Watch",
      "The Coast",
    ]);
    expect(steps[1].town).toBe(true);
    expect(steps[0].act).toBe(1);
  });

  it("keeps the 'how to get there' line in the previous zone", () => {
    const strand = steps[0].items.map((i) => i.line.map((s) => s.text).join(""));
    expect(strand).toEqual(["Find and kill Hillock", "➞ Lioneye's Watch"]);
  });

  it("renders quests, gems, directions and trials", () => {
    const town = steps[1].items;
    expect(town[0].line).toContainEqual({ text: "Enemy at the Gate", kind: "quest" });
    expect(town[1].line).toContainEqual({ text: "Fireball", kind: "gem" });
    expect(town[2].sub[0]).toContainEqual({ text: "→", kind: "dir" });
    expect(steps[4].items[0].line).toContainEqual({ text: "Trial of Ascendancy", kind: "trial" });
  });

  it("follows logout and waypoint transitions", () => {
    expect(steps[2].items.at(-1)?.line[0].text).toBe("Logout → Lioneye's Watch");
    expect(steps[3].items[0].line[0].text).toBe("вейпоинт → The Coast");
  });
});
