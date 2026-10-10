import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { expect, it } from "vitest";
import type { TokenEstimate } from "../src/contracts";
import { TokenOptimizer } from "./token-optimizer";

it("shows startup entries only and reprices the selected agent iceberg", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TokenOptimizer);
  const root: HTMLElement = fixture.nativeElement;
  const model = {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    inputPerMillion: 1.75,
    source: "https://example.com/pricing",
    verifiedAt: "2026-10-10",
  };
  const estimate: TokenEstimate = {
    client: "codex",
    model,
    models: [
      model,
      {
        ...model,
        id: "claude-sonnet-5.5",
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
        inputCost: 0.000175,
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
        inputCost: 0.00175,
      },
    ],
    startup: { tokens: 100, words: 50, bytes: 400, inputCost: 0.000175 },
    onDemand: { tokens: 1000, words: 500, bytes: 4000, inputCost: 0.00175 },
    includeUser: true,
    warnings: [],
  };
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=codex&model=gpt-5.3-codex")
    .flush(estimate);
  http.expectNone("/api/optimization-checks");
  await fixture.whenStable();
  await expect
    .poll(() => root.textContent)
    .toContain("Estimated startup context");
  expect(root.textContent).toContain("On-demand context");
  expect(root.querySelector("svg")).not.toBeNull();
  expect(root.querySelector("tbody")?.textContent).toContain("AGENTS.md");
  expect(root.querySelector("tbody")?.textContent).not.toContain(
    "linked-guide.md",
  );
  expect(root.querySelectorAll("thead th").length).toBe(5);
  expect(root.querySelector("thead")?.textContent).not.toContain("Bytes");
  expect(root.textContent).not.toContain("Optimization checklist");
  expect(root.textContent).not.toContain("not to scale");
  expect(root.textContent).not.toContain("Discoverable local context");
  expect(root.textContent).not.toContain("USD input prices");
  const agent = root.querySelector<HTMLSelectElement>("#optimizer-agent")!;
  expect([...agent.options].map((option) => option.value)).toEqual([
    "codex",
    "claude",
    "cursor",
    "copilot",
  ]);
  agent.value = "claude";
  agent.dispatchEvent(new Event("change"));
  await fixture.whenStable();
  http
    .expectOne((request) => request.url.includes("client=claude"))
    .flush({ ...estimate, client: "claude" });
  await fixture.whenStable();
  const select = root.querySelector<HTMLSelectElement>("#optimizer-model")!;
  select.value = "claude-sonnet-5.5";
  select.dispatchEvent(new Event("change"));
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=claude&model=claude-sonnet-5.5")
    .flush({
      ...estimate,
      startup: { ...estimate.startup, inputCost: 0.0002 },
    });
  await fixture.whenStable();
  await expect.poll(() => root.textContent).toContain("0.000200");
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
  http.verify();
});
