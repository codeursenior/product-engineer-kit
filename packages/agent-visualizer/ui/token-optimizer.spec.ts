import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { beforeEach, expect, it } from "vitest";
import type { TokenEstimate } from "../src/contracts";
import { WorkspaceState } from "./workspace-state";
import { TokenOptimizer } from "./token-optimizer";

beforeEach(() => localStorage.clear());

it("shows startup entries only and reprices the selected agent iceberg", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const state = TestBed.inject(WorkspaceState);
  state.toggleClient("codex");
  const fixture = TestBed.createComponent(TokenOptimizer);
  const root: HTMLElement = fixture.nativeElement;
  const model = {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    inputPerMillion: 2,
    source: "https://example.com/pricing",
    verifiedAt: "2026-10-10",
  };
  const estimate: TokenEstimate = {
    client: "codex",
    model,
    models: [
      { ...model, id: "gpt-6-astra", name: "GPT-6 Astra", inputPerMillion: 10 },
      model,
      {
        ...model,
        id: "claude-sonnet-5-5",
        name: "Claude Sonnet 5.5",
        inputPerMillion: 2,
      },
    ],
    method: "Local heuristic",
    entries: [
      {
        id: "startup",
        name: "AGENTS.md",
        path: "AGENTS.md",
        scope: "project",
        kind: "instruction",
        portion: "startup",
        tokens: 100,
        words: 50,
        bytes: 400,
        inputCost: 0.0002,
      },
      {
        id: "on-demand",
        name: "linked-guide.md",
        path: "docs/linked-guide.md",
        scope: "project",
        kind: "document",
        portion: "on-demand",
        tokens: 1000,
        words: 500,
        bytes: 4000,
        inputCost: 0.002,
      },
    ],
    startup: { tokens: 100, words: 50, bytes: 400, inputCost: 0.0002 },
    onDemand: { tokens: 1000, words: 500, bytes: 4000, inputCost: 0.002 },
    includeUser: true,
    warnings: [],
  };
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=codex&model=gpt-6.1-sol")
    .flush(estimate);
  http.expectNone("/api/optimization-checks");
  await fixture.whenStable();
  await expect
    .poll(() => root.textContent)
    .toContain("Estimated startup context");
  expect(root.textContent).toContain("On-demand context");
  expect(root.querySelector("svg")).not.toBeNull();
  expect(root.querySelector<HTMLSelectElement>("#optimizer-model")?.value).toBe(
    "gpt-6.1-sol",
  );
  expect(root.querySelector("tbody")?.textContent).toContain("AGENTS.md");
  expect(root.querySelector("tbody")?.textContent).not.toContain(
    "linked-guide.md",
  );
  expect(root.querySelectorAll("thead th").length).toBe(3);
  expect(
    [...root.querySelectorAll("thead th")].map((cell) =>
      cell.textContent?.trim(),
    ),
  ).toEqual(["File or skill", "Tokens ≈", "Words"]);
  expect(root.querySelectorAll("tbody tr")[0]?.children).toHaveLength(3);
  expect(root.querySelector(".startup .cost")?.textContent).toContain(
    "$0.0002",
  );
  expect(root.querySelector(".on-demand .cost")?.textContent).toContain(
    "$0.0020",
  );
  expect(root.textContent).not.toContain("Optimization checklist");
  expect(root.textContent).not.toContain("not to scale");
  expect(root.textContent).not.toContain("Discoverable local context");
  expect(root.textContent).not.toContain("USD input prices");
  expect(root.querySelector("#optimizer-agent")).toBeNull();
  expect(root.querySelector(".portions")?.textContent).not.toContain("bytes");
  expect(root.querySelector(".startup .cost")?.getAttribute("title")).toBe(
    "$0.0002",
  );
  expect(root.querySelector(".on-demand .cost")?.getAttribute("title")).toBe(
    "$0.002",
  );
  state.toggleClient("claude");
  await fixture.whenStable();
  http
    .expectOne((request) => request.url.includes("client=claude"))
    .flush({ ...estimate, client: "claude" });
  await fixture.whenStable();
  const select = root.querySelector<HTMLSelectElement>("#optimizer-model")!;
  select.value = "claude-sonnet-5-5";
  select.dispatchEvent(new Event("change"));
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=claude&model=claude-sonnet-5-5")
    .flush({
      ...estimate,
      startup: { ...estimate.startup, inputCost: 0.01234567 },
      onDemand: { ...estimate.onDemand, inputCost: 1.23456 },
    });
  await fixture.whenStable();
  await expect
    .poll(() => root.querySelector(".startup .cost")?.textContent)
    .toContain("$0.0123");
  expect(root.querySelector(".on-demand .cost")?.textContent).toContain(
    "$1.2346",
  );
  expect(root.querySelector(".startup .cost")?.getAttribute("title")).toBe(
    "$0.01234567",
  );
  expect(root.querySelector(".on-demand .cost")?.getAttribute("title")).toBe(
    "$1.23456",
  );
  fixture.componentInstance.estimate.set({
    ...estimate,
    entries: [estimate.entries[1]!],
  });
  await fixture.whenStable();
  expect(root.querySelector("tbody")?.textContent).toContain(
    "No startup context discovered",
  );
  expect(root.querySelector("tbody")?.textContent).not.toContain(
    "linked-guide.md",
  );
  state.toggleClient("claude");
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=claude-sonnet-5-5")
    .flush({ ...estimate, client: "all" });
  await fixture.whenStable();
  expect(root.textContent).not.toContain("Select an agent");
  await expect.poll(() => root.querySelector("tbody")).not.toBeNull();
  http.verify();
});

it("requests all agents immediately on startup", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  expect(root.textContent).not.toContain("Select an agent");
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(
      { error: "Unavailable" },
      { status: 500, statusText: "Server error" },
    );
  await fixture.whenStable();
  await expect
    .poll(() => root.querySelector('[role="alert"]')?.textContent)
    .toContain("Unavailable");
  http.verify();
});
