import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { expect, it } from "vitest";
import type { TokenEstimate } from "../src/contracts";
import { TokenOptimizer } from "./token-optimizer";

it("shows one agent's iceberg, reprices on selection and checks installation through detection", async () => {
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
    entries: [],
    startup: { tokens: 100, words: 50, bytes: 400, inputCost: 0.000175 },
    onDemand: { tokens: 1000, words: 500, bytes: 4000, inputCost: 0.00175 },
    includeUser: true,
    warnings: [],
  };
  const checklist = {
    checks: [
      {
        id: "rtk",
        label: "Install RTK",
        detected: false,
        detail: "Not detected",
        guide: "https://example.com",
        instructions: [
          { label: "Install", command: "brew install rtk-ai/tap/rtk" },
        ],
      },
    ],
  };
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=codex&model=gpt-5.3-codex")
    .flush(estimate);
  http.expectOne("/api/optimization-checks").flush(checklist);
  await fixture.whenStable();
  await expect
    .poll(() => root.textContent)
    .toContain("Estimated startup context");
  expect(root.textContent).toContain("On-demand context");
  expect(root.querySelector("svg")).not.toBeNull();
  const checkbox = root.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  expect(checkbox.checked).toBe(false);
  expect(checkbox.disabled).toBe(true);
  expect(root.textContent).toContain("brew install");
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
  root.querySelector<HTMLButtonElement>(".check-again")!.click();
  await fixture.whenStable();
  http
    .expectOne("/api/optimization-checks")
    .flush({ checks: [{ ...checklist.checks[0], detected: true }] });
  await fixture.whenStable();
  await expect.poll(() => checkbox.checked).toBe(true);
  expect(checkbox.disabled).toBe(true);
  expect(root.querySelector(".check-again")).toBeNull();
  http.verify();
});
