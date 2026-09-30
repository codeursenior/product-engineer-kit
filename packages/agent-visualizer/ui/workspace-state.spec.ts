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
  expect(state.rows()).toHaveLength(2);
  state.scope.set("project");
  state.client.set("codex");
  state.search.set("agents");
  expect(state.rows().map((row) => row.id)).toEqual(["context"]);
  expect(state.summary()).toBe("1 files · 1 project · 0 user");
  state.client.set("claude");
  expect(state.rows()).toEqual([]);
});
it("resets search, client and selection on a tab change while retaining scope and view", async () => {
  const state = TestBed.inject(WorkspaceState);
  await state.load();
  state.scope.set("project");
  state.view.set("list");
  state.search.set("missing");
  state.client.set("cursor");
  state.selectTab("skills");
  expect(state.search()).toBe("");
  expect(state.client()).toBe("all");
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
