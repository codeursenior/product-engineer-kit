import { TestBed } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceApi } from "./api";
import { scanData } from "./test-data";
import { WorkspaceState } from "./workspace-state";

const scan = vi.fn<WorkspaceApi["scan"]>();
beforeEach(() => {
  localStorage.clear();
  scan.mockReset().mockResolvedValue(scanData());
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
});
it("combines scope, client and text filters and reports the visible counts", async () => {
  const state = TestBed.inject(WorkspaceState);
  await state.load();
  state.selectTab("context");
  expect(state.rows()).toHaveLength(2);
  state.scope.set("project");
  state.client.set("codex");
  state.search.set("agents");
  expect(state.rows().map((row) => row.id)).toEqual(["context"]);
  expect(state.summary()).toBe("1 files · 1 project · 0 user");
  state.client.set("claude");
  expect(state.rows()).toEqual([]);
});
it("resets search and selection on a tab change while retaining agent, scope and view", async () => {
  const state = TestBed.inject(WorkspaceState);
  await state.load();
  state.scope.set("project");
  state.view.set("list");
  state.search.set("missing");
  state.client.set("codex");
  state.selectTab("skills");
  expect(state.search()).toBe("");
  expect(state.client()).toBe("codex");
  expect(state.scope()).toBe("project");
  expect(state.view()).toBe("list");
  expect(state.rows()).toHaveLength(1);
  expect(state.selection()).toBeNull();
});
it("exposes loading and failure states and recovers on rescan", async () => {
  const state = TestBed.inject(WorkspaceState);
  scan.mockRejectedValueOnce(new Error("Session expired"));
  const loading = state.load();
  expect(state.loading()).toBe(true);
  await loading;
  expect(state.error()).toBe("Session expired");
  expect(state.summary()).toBe("Session unavailable");
  expect(state.loading()).toBe(false);
  await state.load(true);
  expect(scan).toHaveBeenLastCalledWith(true);
  expect(state.error()).toBe("");
  expect(document.title).toBe("example · Agent Visualizer");
});
it("persists the theme and restores it in a new state service", () => {
  const state = TestBed.inject(WorkspaceState);
  state.toggleTheme();
  expect(document.documentElement.dataset["theme"]).toBe("dark");
  expect(localStorage.getItem("boyscout-theme")).toBe("dark");
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
  expect(TestBed.inject(WorkspaceState).theme()).toBe("dark");
});

it("persists agent and scope across reloads and allows returning to all agents", () => {
  const state = TestBed.inject(WorkspaceState);
  state.toggleClient("codex");
  state.scope.set("user");
  TestBed.tick();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
  const restored = TestBed.inject(WorkspaceState);
  expect(restored.client()).toBe("codex");
  expect(restored.scope()).toBe("user");
  restored.toggleClient("claude");
  expect(restored.client()).toBe("claude");
  restored.toggleClient("claude");
  expect(restored.client()).toBe("all");
  TestBed.tick();
  expect(JSON.parse(localStorage.getItem("pek:filters:v1")!).client).toBe(
    "all",
  );
});
it("falls back to all for corrupt or unsupported saved filters", () => {
  localStorage.setItem("pek:filters:v1", "{broken");
  expect(TestBed.inject(WorkspaceState).client()).toBe("all");
  TestBed.resetTestingModule();
  localStorage.setItem(
    "pek:filters:v1",
    JSON.stringify({ client: "unknown", scope: "missing" }),
  );
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
  const state = TestBed.inject(WorkspaceState);
  expect(state.client()).toBe("all");
  expect(state.scope()).toBe("all");
});
it("filters the whiteboard summary by the global agent", async () => {
  const state = TestBed.inject(WorkspaceState);
  await state.load();
  state.selectTab("skills");
  state.skillsView.set("board");
  state.toggleClient("claude");
  expect(state.summary()).toBe("0 skills · 0 project · 0 user");
  state.toggleClient("codex");
  expect(state.summary()).toBe("1 skills · 1 project · 0 user");
});
