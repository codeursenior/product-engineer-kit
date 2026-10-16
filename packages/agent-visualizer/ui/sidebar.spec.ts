import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApi } from "./api";
import { Sidebar } from "./sidebar";
import { scanData } from "./test-data";
import { WorkspaceState } from "./workspace-state";

let fixture: ComponentFixture<Sidebar>, state: WorkspaceState;
const scan = vi.fn<WorkspaceApi["scan"]>();
function element<T extends HTMLElement>(selector: string): T {
  const root: HTMLElement = fixture.nativeElement;
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
beforeEach(async () => {
  localStorage.clear();
  scan.mockReset().mockResolvedValue(scanData());
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
  state = TestBed.inject(WorkspaceState);
  state.data.set(scanData());
  fixture = TestBed.createComponent(Sidebar);
  await fixture.whenStable();
});
it("uses the capitalized folder name when identity is absent", () => {
  expect(element(".agent-name").textContent).toBe("Example");
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
  const root: HTMLElement = fixture.nativeElement;
  expect(root.querySelector("#project-name")).toBeNull();
});
it("renders a name as text independently from the avatar", async () => {
  const name = "<img src=x onerror=alert(1)>";
  state.data.set({ ...scanData(), agent: { name } });
  await fixture.whenStable();
  expect(element(".agent-name").textContent).toBe(name);
  expect(element(".agent-name").children.length).toBe(0);
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
});
it("renders an avatar alone, falls back on image failure, and refreshes the identity", async () => {
  const avatar = "data:image/png;base64,aW1hZ2U=";
  state.data.set({ ...scanData(), agent: { avatar } });
  await fixture.whenStable();
  expect(element(".agent-name").textContent).toBe("Example");
  expect(element(".brand img").getAttribute("src")).toBe(avatar);
  element(".brand img").dispatchEvent(new Event("error"));
  await fixture.whenStable();
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
  const nextAvatar = "data:image/jpeg;base64,bmV3";
  scan.mockResolvedValueOnce({
    ...scanData(),
    agent: { name: "Atlas", avatar: nextAvatar },
  });
  element("#refresh").click();
  await fixture.whenStable();
  expect(scan).toHaveBeenCalledWith(true);
  expect(element(".brand img").getAttribute("src")).toBe(nextAvatar);
  expect(element(".agent-name").textContent).toBe("Atlas");
  element("#refresh").click();
  await fixture.whenStable();
  expect(element(".agent-name").textContent).toBe("Example");
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
});

it("uses named agent toggles and links the author below the sidebar controls", async () => {
  const root: HTMLElement = fixture.nativeElement;
  expect(root.querySelectorAll(".agent-filter .dimmed")).toHaveLength(0);
  const codex = element<HTMLButtonElement>('[aria-label="Codex"]');
  const claude = element<HTMLButtonElement>('[aria-label="Claude Code"]');
  codex.click();
  await fixture.whenStable();
  expect(codex.getAttribute("aria-pressed")).toBe("true");
  expect(codex.title).toBe("Codex");
  expect(root.querySelectorAll(".agent-filter .dimmed")).toHaveLength(3);
  element<HTMLButtonElement>('[data-tab="skills"]').click();
  await fixture.whenStable();
  expect(state.client()).toBe("codex");
  claude.click();
  await fixture.whenStable();
  expect(codex.getAttribute("aria-pressed")).toBe("false");
  expect(claude.getAttribute("aria-pressed")).toBe("true");
  claude.click();
  await fixture.whenStable();
  expect(state.client()).toBe("all");
  expect(root.querySelectorAll(".agent-filter .dimmed")).toHaveLength(0);
  expect(root.querySelector(".agent-filter-label")).toBeNull();
  expect(root.querySelector('[data-tab="rules"]')).toBeNull();
  expect(root.querySelector('[data-tab="checklist"]')).toBeNull();
  expect(element(".sidebar-rescan").nextElementSibling).toBe(
    element(".brand-credit"),
  );
  expect(element<HTMLAnchorElement>(".brand-credit").href).toBe(
    "https://codeursenior.substack.com/",
  );
  expect(element(".brand-text").textContent).not.toContain("Workspace");
  expect(element("#project-path").textContent).toBe("/example");
});

it("opens the home page from avatar, name and path while retaining the selected agent", async () => {
  expect(state.tab()).toBe("optimizer");
  state.toggleClient("codex");
  for (const selector of [".agent-portrait", ".agent-name", "#project-path"]) {
    state.selectTab("skills");
    await fixture.whenStable();
    element<HTMLAnchorElement>(selector).click();
    await fixture.whenStable();
    expect(state.tab()).toBe("optimizer");
    expect(state.client()).toBe("codex");
  }
  const root: HTMLElement = fixture.nativeElement;
  expect(root.querySelector('[data-tab="optimizer"]')).toBeNull();
});
