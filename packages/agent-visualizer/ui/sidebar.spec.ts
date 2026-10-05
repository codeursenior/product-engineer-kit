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
  scan.mockReset().mockResolvedValue(scanData());
  TestBed.configureTestingModule({
    providers: [{ provide: WorkspaceApi, useValue: { scan } }],
  });
  state = TestBed.inject(WorkspaceState);
  state.data.set(scanData());
  fixture = TestBed.createComponent(Sidebar);
  await fixture.whenStable();
});
it("preserves the default brand and workspace when identity is absent", () => {
  expect(element(".agent-name").textContent).toBe("boyscout");
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
  expect(element("#project-name").textContent).toBe("example");
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
  expect(element(".agent-name").textContent).toBe("boyscout");
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
  expect(element(".agent-name").textContent).toBe("boyscout");
  expect(element(".brand img").getAttribute("src")).toBe("/favicon.svg");
});
