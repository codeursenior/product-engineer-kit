import { TestBed } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
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
