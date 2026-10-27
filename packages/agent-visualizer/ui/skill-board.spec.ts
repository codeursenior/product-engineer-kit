import { TestBed } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import { boardStorageKey } from "./skill-board-model";
import { SkillBoard } from "./skill-board";
import { skill } from "./test-data";

beforeEach(() => localStorage.clear());

async function open(project = "/example") {
  const fixture = TestBed.createComponent(SkillBoard);
  fixture.componentRef.setInput("project", project);
  fixture.componentRef.setInput("skills", [structuredClone(skill)]);
  fixture.componentRef.setInput("edges", []);
  await fixture.whenStable();
  const element: HTMLElement = fixture.nativeElement;
  return { fixture, element };
}

it("guides the user from the starting skill to the destination when connecting skills", async () => {
  const { fixture, element } = await open();
  fixture.componentRef.setInput("skills", [
    structuredClone(skill),
    {
      ...structuredClone(skill),
      id: "destination",
      name: "publish",
      editTargets: [
        { id: "publish-file", path: "publish/SKILL.md", deletable: true },
      ],
    },
  ]);
  await fixture.whenStable();
  const connect = [...element.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Connect skills",
  )!;
  expect(connect).toBeDefined();
  connect.click();
  await fixture.whenStable();
  expect(connect.getAttribute("aria-pressed")).toBe("true");
  expect(element.querySelector(".board-actions")?.textContent).toContain(
    "Click the starting skill. Escape cancels.",
  );
  element
    .querySelector<SVGGElement>('[aria-label="Skill review"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await fixture.whenStable();
  expect(element.querySelector(".board-actions")?.textContent).toContain(
    "Click the destination skill. Escape cancels.",
  );
  expect(element.querySelector(".connection-source")?.textContent).toContain(
    "Start",
  );
  expect(element.querySelectorAll(".board-arrow")).toHaveLength(0);
  element
    .querySelector<SVGGElement>('[aria-label="Skill publish"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await fixture.whenStable();
  expect(element.querySelectorAll(".board-arrow")).toHaveLength(1);
  expect(connect.getAttribute("aria-pressed")).toBe("false");
  expect(element.querySelector(".connection-source")).toBeNull();
  expect(element.querySelector(".board-actions")?.textContent).not.toContain(
    "Escape cancels.",
  );
});

it("restores titles for the same project and keeps other projects separate", async () => {
  const first = await open();
  const input = first.element.querySelector<HTMLInputElement>(
    '[aria-label="Title text"]',
  )!;
  input.value = "Ship the release";
  input.dispatchEvent(new Event("input"));
  await first.fixture.whenStable();
  first.element
    .querySelector<HTMLButtonElement>('[data-action="add-title"]')!
    .click();
  await first.fixture.whenStable();
  expect(first.element.querySelector(".board-title")?.textContent).toContain(
    "Ship the release",
  );
  first.fixture.destroy();
  const restored = await open();
  expect(restored.element.querySelector(".board-title")?.textContent).toContain(
    "Ship the release",
  );
  restored.fixture.destroy();
  const other = await open("/another-project");
  expect(other.element.querySelector(".board-title")).toBeNull();
});

it("keeps moved skills and drawings after content changes and adds new skills beside the composition", async () => {
  const { fixture, element } = await open();
  const card = element.querySelector<SVGGElement>(".board-card")!;
  card.dispatchEvent(
    new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
  );
  await fixture.whenStable();
  expect(card.getAttribute("transform")).toBe("translate(60 60)");
  fixture.componentRef.setInput("skills", [
    {
      ...structuredClone(skill),
      id: "changed-content",
      description: "New body",
    },
    {
      ...structuredClone(skill),
      id: "new",
      name: "a-new-skill",
      editTargets: [{ id: "new-file", path: "new/SKILL.md", deletable: true }],
    },
  ]);
  await fixture.whenStable();
  expect(
    element.querySelector('[data-skill="review"]')?.getAttribute("transform"),
  ).toBe("translate(60 60)");
  expect(
    element
      .querySelector('[data-skill="a-new-skill"]')
      ?.getAttribute("transform"),
  ).toBe("translate(360 60)");
  expect(element.querySelectorAll(".board-card")).toHaveLength(2);
});

it("keeps skills visible when Delete is pressed and removes missing skills on rescan", async () => {
  const { fixture, element } = await open();
  element
    .querySelector(".board-card")!
    .dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true }),
    );
  await fixture.whenStable();
  expect(element.querySelectorAll(".board-card")).toHaveLength(1);
  fixture.componentRef.setInput("skills", []);
  await fixture.whenStable();
  expect(element.querySelectorAll(".board-card")).toHaveLength(0);
});

it("reports blocked storage while keeping the board usable", async () => {
  const { fixture, element } = await open();
  const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Quota exceeded");
  });
  try {
    element
      .querySelector(".board-card")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    await fixture.whenStable();
    expect(element.querySelector('[role="status"]')?.textContent).toContain(
      "Autosave unavailable",
    );
    expect(
      element.querySelector(".board-card")?.getAttribute("transform"),
    ).toBe("translate(40 80)");
  } finally {
    set.mockRestore();
  }
});

it("does not overwrite an unreadable saved board", async () => {
  const { fixture } = await open();
  fixture.destroy();
  const key = localStorage.key(0)!;
  localStorage.setItem(key, "{broken");
  const next = await open();
  expect(next.element.querySelector('[role="status"]')?.textContent).toContain(
    "Could not restore",
  );
  expect(localStorage.getItem(key)).toBe("{broken");
  expect(next.element.querySelectorAll(".board-card")).toHaveLength(1);
});

it("keeps both cards when identical copies become different skills", async () => {
  const { fixture, element } = await open();
  fixture.componentRef.setInput("skills", [
    {
      ...structuredClone(skill),
      id: "second-copy",
      editTargets: [skill.editTargets[1]!],
    },
    {
      ...structuredClone(skill),
      id: "first-copy",
      editTargets: [skill.editTargets[0]!],
    },
  ]);
  await fixture.whenStable();
  const positions = [...element.querySelectorAll(".board-card")].map((card) =>
    card.getAttribute("transform"),
  );
  expect(positions).toHaveLength(2);
  expect(new Set(positions).size).toBe(2);
  fixture.destroy();
  const reopened = await open();
  expect(reopened.element.querySelectorAll(".board-card")).toHaveLength(1);
});

it("filters skills and both arrow types without losing saved positions or drawings", async () => {
  const { fixture, element } = await open();
  const other = {
    ...structuredClone(skill),
    id: "claude-skill",
    name: "claude-only",
    clients: ["claude"] as const,
    editTargets: [
      {
        id: "claude-file",
        path: ".claude/skills/only/SKILL.md",
        deletable: true,
      },
    ],
  };
  fixture.componentRef.setInput("skills", [
    structuredClone(skill),
    { ...other, clients: [...other.clients] },
  ]);
  fixture.componentRef.setInput("edges", [
    { source: skill.id, target: other.id },
  ]);
  await fixture.whenStable();
  const board = fixture.componentInstance;
  const first = board.cards().find((card) => card.skill.id === skill.id)!;
  const second = board.cards().find((card) => card.skill.id === other.id)!;
  board.toggleConnect();
  board.choose("skill", first.key);
  board.choose("skill", second.key);
  await fixture.whenStable();
  const saved = localStorage.getItem(boardStorageKey("/example"));
  expect(element.querySelectorAll(".board-arrow")).toHaveLength(1);
  expect(element.querySelectorAll(".board-reference")).toHaveLength(1);
  fixture.componentRef.setInput("client", "codex");
  await fixture.whenStable();
  expect(element.querySelectorAll(".board-card")).toHaveLength(1);
  expect(element.querySelectorAll(".board-arrow")).toHaveLength(0);
  expect(element.querySelectorAll(".board-reference")).toHaveLength(0);
  expect(localStorage.getItem(boardStorageKey("/example"))).toBe(saved);
  fixture.componentRef.setInput("client", "all");
  await fixture.whenStable();
  expect(element.querySelectorAll(".board-card")).toHaveLength(2);
  expect(element.querySelectorAll(".board-arrow")).toHaveLength(1);
  expect(element.querySelectorAll(".board-reference")).toHaveLength(1);
  expect(board.cards().find((card) => card.key === first.key)?.x).toBe(first.x);
});

it("restores page scrolling when a fullscreen board is destroyed", async () => {
  const overflow = document.body.style.overflow;
  const { fixture, element } = await open();
  element.querySelector<HTMLButtonElement>(".board-fullscreen")!.click();
  await fixture.whenStable();
  expect(element.getAttribute("aria-modal")).toBe("true");
  expect(document.body.style.overflow).toBe("hidden");
  fixture.destroy();
  expect(document.body.style.overflow).toBe(overflow);
});

it("keeps the point under the cursor fixed while zooming", async () => {
  const { fixture, element } = await open();
  const svg = element.querySelector<SVGSVGElement>(".board-surface")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    new DOMRect(120, 80, 800, 500),
  );
  vi.spyOn(svg, "clientWidth", "get").mockReturnValue(800);
  vi.spyOn(svg, "clientHeight", "get").mockReturnValue(500);
  const board = fixture.componentInstance;
  const point = { x: 160, y: 110 };
  const world = {
    x: (point.x - board.pan().x) / board.scale(),
    y: (point.y - board.pan().y) / board.scale(),
  };
  svg.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: 20,
      clientX: 280,
      clientY: 190,
      bubbles: true,
      cancelable: true,
    }),
  );
  await fixture.whenStable();
  expect(world.x * board.scale() + board.pan().x).toBeCloseTo(point.x, 8);
  expect(world.y * board.scale() + board.pan().y).toBeCloseTo(point.y, 8);
});

it("keeps a burst of small trackpad deltas gradual and ignores horizontal-only scroll", async () => {
  const { fixture, element } = await open();
  const svg = element.querySelector<SVGSVGElement>(".board-surface")!;
  for (let i = 0; i < 40; i++) {
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 2, bubbles: true, cancelable: true }),
    );
  }
  await fixture.whenStable();
  const scale = fixture.componentInstance.scale();
  expect(scale).toBeGreaterThan(0.8);
  expect(scale).toBeLessThan(1);
  svg.dispatchEvent(
    new WheelEvent("wheel", {
      deltaX: 20,
      deltaY: 0,
      bubbles: true,
      cancelable: true,
    }),
  );
  await fixture.whenStable();
  expect(fixture.componentInstance.scale()).toBe(scale);
});

it("zooms by scroll distance rather than wheel event count and normalizes line units", async () => {
  const first = await open();
  const svg = first.element.querySelector<SVGSVGElement>(".board-surface")!;
  for (let i = 0; i < 8; i++)
    svg.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 2, bubbles: true, cancelable: true }),
    );
  await first.fixture.whenStable();
  const scale = first.fixture.componentInstance.scale();
  first.fixture.destroy();
  const second = await open();
  second.element.querySelector<SVGSVGElement>(".board-surface")!.dispatchEvent(
    new WheelEvent("wheel", {
      deltaY: 1,
      deltaMode: 1,
      bubbles: true,
      cancelable: true,
    }),
  );
  await second.fixture.whenStable();
  expect(second.fixture.componentInstance.scale()).toBeCloseTo(scale, 10);
});
