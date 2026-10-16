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
