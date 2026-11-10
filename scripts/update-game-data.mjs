// Скачивает справочники (зоны, квесты, гемы) из exile-leveling (MIT) и сохраняет только нужные поля.
// Запуск: node scripts/update-game-data.mjs [commit]
// Код exile-leveling не выполняется — берутся только JSON-данные.

import { mkdir, writeFile } from "node:fs/promises";

const REPO = "HeartofPhos/exile-leveling";
const commit = process.argv[2] ?? "b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba";
const base = `https://raw.githubusercontent.com/${REPO}/${commit}`;
const outDir = new URL("../src/guide/data/", import.meta.url);

async function fetchText(path) {
  const res = await fetch(`${base}/${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

const [areasRaw, questsRaw, gemsRaw, license] = await Promise.all([
  fetchText("common/data/json/areas.json").then(JSON.parse),
  fetchText("common/data/json/quests.json").then(JSON.parse),
  fetchText("common/data/json/gems.json").then(JSON.parse),
  fetchText("LICENSE"),
]);

const areas = {};
for (const a of Object.values(areasRaw)) {
  areas[a.id] = { name: a.name, act: a.act, town: a.is_town_area, townId: a.parent_town_area_id };
}

const quests = {};
for (const q of Object.values(questsRaw)) quests[q.id] = q.name;

const gems = {};
for (const g of Object.values(gemsRaw)) gems[g.id] = { name: g.name, support: g.is_support };

const data = { source: `https://github.com/${REPO}/tree/${commit}`, areas, quests, gems };

await mkdir(outDir, { recursive: true });
await writeFile(new URL("game-data.json", outDir), JSON.stringify(data, null, 1) + "\n");
await writeFile(new URL("LICENSE-exile-leveling.txt", outDir), license);
console.log(
  `areas: ${Object.keys(areas).length}, quests: ${Object.keys(quests).length}, gems: ${Object.keys(gems).length}`,
);
