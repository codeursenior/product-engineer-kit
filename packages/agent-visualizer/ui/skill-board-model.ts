import type { Skill } from "../src/contracts";

export interface Point {
  x: number;
  y: number;
}
export interface Placement extends Point {
  key: string;
  files: string[];
}
export interface Drawing {
  id: string;
  source: string;
  target: string;
}
export interface BoardTitle extends Point {
  id: string;
  text: string;
}
export interface BoardData {
  version: 1;
  nodes: Placement[];
  arrows: Drawing[];
  titles: BoardTitle[];
}
export const cardSize = { width: 220, height: 82 };
const emptyBoard = (): BoardData => ({
  version: 1,
  nodes: [],
  arrows: [],
  titles: [],
});
export const boardStorageKey = (project: string) =>
  `pek:skill-board:v1:${project}`;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown): value is string => typeof value === "string";
const point = (value: Record<string, unknown>) =>
  typeof value.x === "number" &&
  Number.isFinite(value.x) &&
  typeof value.y === "number" &&
  Number.isFinite(value.y);

/** Treat saved browser data as untrusted, including old or interrupted writes. */
export function readBoard(project: string): BoardData {
  const text = localStorage.getItem(boardStorageKey(project));
  if (!text) return emptyBoard();
  const data = object(JSON.parse(text));
  if (
    data.version !== 1 ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.arrows) ||
    !Array.isArray(data.titles)
  )
    throw new Error("Unsupported whiteboard data");
  const nodes: Placement[] = [];
  const arrows: Drawing[] = [];
  const titles: BoardTitle[] = [];
  for (const item of data.nodes) {
    const node = object(item);
    if (
      !string(node.key) ||
      !Array.isArray(node.files) ||
      !node.files.every(string) ||
      !point(node)
    )
      throw new Error("Invalid position");
    nodes.push({
      key: node.key,
      files: node.files,
      x: Number(node.x),
      y: Number(node.y),
    });
  }
  for (const item of data.arrows) {
    const arrow = object(item);
    if (!string(arrow.id) || !string(arrow.source) || !string(arrow.target))
      throw new Error("Invalid arrow");
    arrows.push({ id: arrow.id, source: arrow.source, target: arrow.target });
  }
  for (const item of data.titles) {
    const title = object(item);
    if (!string(title.id) || !string(title.text) || !point(title))
      throw new Error("Invalid title");
    titles.push({
      id: title.id,
      text: title.text.slice(0, 160),
      x: Number(title.x),
      y: Number(title.y),
    });
  }
  return { version: 1, nodes, arrows, titles };
}

export function reconcileBoard(skills: Skill[], saved: BoardData): BoardData {
  const nodes: Placement[] = [];
  const used = new Set<string>();
  const newSkills: Skill[] = [];
  for (const skill of [...skills].sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const files = skill.editTargets.map((target) => target.id);
    const previous = saved.nodes.find(
      (node) =>
        !used.has(node.key) && node.files.some((file) => files.includes(file)),
    );
    if (previous) {
      used.add(previous.key);
      nodes.push({ ...previous, files });
    } else newSkills.push(skill);
  }
  const right = Math.max(
    0,
    ...nodes.map((node) => node.x + cardSize.width),
    ...saved.titles.map((title) => title.x + 320),
  );
  const start = right ? right + 80 : 40;
  newSkills.forEach((skill, index) => {
    const files = skill.editTargets.map((target) => target.id);
    const key =
      files
        .slice()
        .sort()
        .find((file) => !used.has(file)) ?? skill.id;
    used.add(key);
    nodes.push({
      key,
      files,
      x: start + (index % 4) * 270,
      y: 60 + Math.floor(index / 4) * 140,
    });
  });
  const keys = new Set(nodes.map((node) => node.key));
  return {
    ...saved,
    nodes,
    arrows: saved.arrows.filter(
      (arrow) => keys.has(arrow.source) && keys.has(arrow.target),
    ),
  };
}

export function anchor(source: Point, target: Point): Point {
  const dx = target.x - source.x,
    dy = target.y - source.y;
  const ratio =
    1 /
    Math.max(
      Math.abs(dx) / (cardSize.width / 2),
      Math.abs(dy) / (cardSize.height / 2),
      1,
    );
  return {
    x: source.x + cardSize.width / 2 + dx * ratio,
    y: source.y + cardSize.height / 2 + dy * ratio,
  };
}
