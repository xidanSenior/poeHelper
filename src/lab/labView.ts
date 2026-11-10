// Отрисовка лабиринта: SVG-схема комнат + подсказка «куда идти».

import { isLayoutForToday, type LabLayout } from "./labFormat";
import { DIRECTION_ARROWS, exitDirection, PLAZA_ID, planRoute, roomById, startRoom } from "./labGraph";
import type { LabState } from "./labTracker";

const SVG_NS = "http://www.w3.org/2000/svg";
const PAD = 14;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Plaza рисуем левее первой комнаты. */
function position(layout: LabLayout, id: string): { x: number; y: number } {
  if (id === PLAZA_ID) {
    const s = startRoom(layout);
    return { x: s.x - 90, y: s.y };
  }
  const r = roomById(layout, id);
  return { x: r?.x ?? 0, y: r?.y ?? 0 };
}

function renderMap(layout: LabLayout, route: string[], current: string | null): SVGSVGElement {
  const ids = [PLAZA_ID, ...layout.rooms.map((r) => r.id)];
  const pts = ids.map((id) => position(layout, id));
  const minX = Math.min(...pts.map((p) => p.x)) - PAD;
  const minY = Math.min(...pts.map((p) => p.y)) - PAD;
  const maxX = Math.max(...pts.map((p) => p.x)) + PAD;
  const maxY = Math.max(...pts.map((p) => p.y)) + PAD;

  const svg = el("svg", { viewBox: `${minX} ${minY} ${maxX - minX} ${maxY - minY}`, class: "lab-map" });
  const onRoute = new Set(route);
  const routeEdges = new Set(route.slice(1).map((id, i) => `${route[i]}>${id}`));

  const line = (a: string, b: string, cls: string) => {
    const p = position(layout, a);
    const q = position(layout, b);
    svg.append(el("line", { x1: p.x, y1: p.y, x2: q.x, y2: q.y, class: cls }));
  };

  line(PLAZA_ID, startRoom(layout).id, routeEdges.has(`${PLAZA_ID}>${startRoom(layout).id}`) ? "edge route" : "edge");
  for (const room of layout.rooms) {
    for (const target of Object.values(room.exits)) {
      if (target) line(room.id, target, routeEdges.has(`${room.id}>${target}`) ? "edge route" : "edge");
    }
    if (room.secretPassage) line(room.id, room.secretPassage, "edge secret");
  }

  for (const id of ids) {
    const room = id === PLAZA_ID ? null : roomById(layout, id);
    const p = position(layout, id);
    const classes = ["room"];
    if (onRoute.has(id)) classes.push("on-route");
    if (room?.name === "Aspirant's Trial") classes.push("trial");
    if (room?.contents.some((c) => /darkshrine/i.test(c))) classes.push("shrine");
    if (id === current) classes.push("current");
    const circle = el("circle", { cx: p.x, cy: p.y, r: id === current ? 11 : 8, class: classes.join(" ") });
    const title = el("title", {});
    title.textContent = room ? `${room.name}${room.contents.length ? " — " + room.contents.join(", ") : ""}` : "Aspirants' Plaza";
    circle.append(title);
    svg.append(circle);
  }
  return svg;
}

function roomLabel(layout: LabLayout, id: string): string {
  return id === PLAZA_ID ? "Aspirants' Plaza" : (roomById(layout, id)?.name ?? "?");
}

export interface LabView {
  title: string;
  warning: string | null;
  map: SVGSVGElement | null;
  lines: { text: string; cls?: string }[];
}

export function buildLabView(layout: LabLayout | undefined, state: LabState): LabView {
  const diff = state.difficulty ?? "?";
  if (!layout) {
    return {
      title: `Лабиринт ${diff}`,
      warning: `Раскладка ${diff} не загружена — Alt+Shift+O`,
      map: null,
      lines: [],
    };
  }

  const warning = isLayoutForToday(layout) ? null : `Раскладка от ${layout.date || "?"} — возможно, устарела`;
  const from = state.roomId ?? PLAZA_ID;
  const route = planRoute(layout, from);
  const lines: LabView["lines"] = [];

  if (state.roomId === null) {
    lines.push({ text: "Комната не определена — маршрут показан от входа", cls: "away" });
  } else {
    const room = state.roomId === PLAZA_ID ? null : roomById(layout, state.roomId);
    lines.push({ text: `Сейчас: ${roomLabel(layout, state.roomId)}` });
    if (room?.contents.length) lines.push({ text: room.contents.join(", "), cls: "contents" });
  }

  const next = route[1];
  if (next) {
    const dir = state.roomId ? exitDirection(layout, state.roomId, next) : null;
    const arrow = dir ? `${DIRECTION_ARROWS[dir]} ${dir} → ` : "→ ";
    lines.push({ text: `Иди: ${arrow}${roomLabel(layout, next)}`, cls: "go" });
    const nextRoom = roomById(layout, next);
    if (nextRoom?.contents.length) lines.push({ text: `там: ${nextRoom.contents.join(", ")}`, cls: "contents" });
  } else {
    lines.push({ text: "Финальный Izaro — здесь", cls: "go" });
  }
  lines.push({ text: `До Izaro: ${Math.max(route.length - 1, 0)} комн.`, cls: "contents" });

  return { title: `Лабиринт ${layout.difficulty} · ${layout.date}`, warning, map: renderMap(layout, route, state.roomId), lines };
}
