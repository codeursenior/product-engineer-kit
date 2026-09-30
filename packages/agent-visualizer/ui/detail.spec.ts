import { TestBed, type ComponentFixture } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import type { FileResponse } from "../src/contracts";
import { WorkspaceApi } from "./api";
import { Detail } from "./detail";
import { contextFile, scanData, skill } from "./test-data";
import { WorkspaceState } from "./workspace-state";

const api = {
  file: vi.fn<WorkspaceApi["file"]>(),
  content: vi.fn<WorkspaceApi["content"]>(),
  save: vi.fn<WorkspaceApi["save"]>(),
  delete: vi.fn<WorkspaceApi["delete"]>(),
  scan: vi.fn<WorkspaceApi["scan"]>(),
};
let fixture: ComponentFixture<Detail>, state: WorkspaceState;
function element<T extends HTMLElement>(selector: string): T {
  const root: HTMLElement = fixture.nativeElement;
  const node = root.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}
beforeEach(async () => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.file.mockResolvedValue({
    text: "<script>data only</script>",
    revision: "old",
  });
  api.scan.mockResolvedValue(scanData());
  api.save.mockResolvedValue({ revision: "new" });
  api.delete.mockResolvedValue({ deleted: true });
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: api }],
  });
  state = TestBed.inject(WorkspaceState);
  fixture = TestBed.createComponent(Detail);
  await fixture.whenStable();
});
it("shows text safely and selects the correct source in a grouped skill", async () => {
  state.selection.set({ row: skill, tab: "skills" });
  await fixture.whenStable();
  expect(element("pre").textContent).toBe("<script>data only</script>");
  expect(element("pre").querySelector("script")).toBeNull();
  const select = element<HTMLSelectElement>("select");
  select.value = "second";
  select.dispatchEvent(new Event("change"));
  await fixture.whenStable();
  expect(api.file).toHaveBeenLastCalledWith("second");
  element(".edit-button").click();
  await fixture.whenStable();
  const textarea = element<HTMLTextAreaElement>("textarea");
  textarea.value = "Updated";
  textarea.dispatchEvent(new Event("input"));
  element("form").dispatchEvent(new Event("submit", { cancelable: true }));
  await fixture.whenStable();
  expect(api.save).toHaveBeenCalledWith("second", {
    text: "Updated",
    revision: "old",
  });
  expect(api.scan).toHaveBeenCalledWith(true);
  expect(element('[role="status"]').textContent).toBe(
    "Saved. Workspace rescanned.",
  );
});
it("ignores an old preview response after switching source or closing", async () => {
  let resolve: (file: FileResponse) => void = () => {
    throw new Error("Preview not requested");
  };
  api.file.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  state.selection.set({ row: skill, tab: "skills" });
  await fixture.whenStable();
  fixture.componentInstance.source("second");
  await fixture.whenStable();
  resolve({ text: "Stale first source", revision: "stale" });
  await fixture.whenStable();
  expect(element("pre").textContent).toBe("<script>data only</script>");
  api.file.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  fixture.componentInstance.source("first");
  await fixture.whenStable();
  state.selection.set(null);
  await fixture.whenStable();
  resolve({ text: "Closed", revision: "stale" });
  await fixture.whenStable();
  expect(fixture.componentInstance.file()).toBeNull();
});
it("keeps the draft on a save conflict and prevents double submission", async () => {
  api.save.mockRejectedValueOnce(new Error("File changed on disk."));
  state.selection.set({ row: contextFile, tab: "context" });
  await fixture.whenStable();
  element(".edit-button").click();
  await fixture.whenStable();
  const textarea = element<HTMLTextAreaElement>("textarea");
  textarea.value = "My draft";
  textarea.dispatchEvent(new Event("input"));
  element("form").dispatchEvent(new Event("submit", { cancelable: true }));
  element("form").dispatchEvent(new Event("submit", { cancelable: true }));
  await fixture.whenStable();
  expect(api.save).toHaveBeenCalledTimes(1);
  expect(fixture.componentInstance.draft()).toBe("My draft");
  expect(fixture.componentInstance.mode()).toBe("edit");
  expect(element('[role="status"]').textContent).toBe("File changed on disk.");
  expect(api.scan).not.toHaveBeenCalled();
});
it("requires deletion confirmation and rescans after successful deletion", async () => {
  state.selection.set({ row: contextFile, tab: "context" });
  await fixture.whenStable();
  element(".delete-button").click();
  await fixture.whenStable();
  expect(api.delete).not.toHaveBeenCalled();
  expect(element(".delete-confirm p").textContent).toContain("AGENTS.md");
  element(".delete-confirm button").click();
  await fixture.whenStable();
  expect(api.delete).toHaveBeenCalledWith("context", "old");
  expect(state.selection()).toBeNull();
  expect(api.scan).toHaveBeenCalledWith(true);
});
