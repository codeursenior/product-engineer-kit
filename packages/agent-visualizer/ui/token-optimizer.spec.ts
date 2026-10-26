import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { beforeEach, expect, it, vi } from "vitest";
import type { ScanData, TokenEstimate } from "../src/contracts";
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
  ).toEqual(["Context source", "Tokens ≈", "Words"]);
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

function workspace(path = "/project"): ScanData {
  return {
    project: { name: "project", path },
    scannedAt: "2026-10-26T10:00:00.000Z",
    nodes: [],
    rules: [],
    edges: [],
    skills: [],
    skillEdges: [],
    mcp: [],
    warnings: [],
    limits: { includeUser: false, scannedFiles: 0, truncated: false },
  };
}

function mcpEstimate(pending: boolean): TokenEstimate {
  const model = {
    id: "gpt-6.1-sol",
    name: "GPT-6.1 Sol",
    inputPerMillion: 2,
    source: "https://example.com/pricing",
    verifiedAt: "2026-10-26",
  };
  return {
    client: "all",
    model,
    models: [model],
    method: "Local heuristic",
    entries: [],
    startup: { tokens: 120, words: 40, bytes: 480, inputCost: 0.00024 },
    onDemand: { tokens: 240, words: 80, bytes: 960, inputCost: 0.00048 },
    includeUser: false,
    warnings: [],
    mcp: {
      enabled: true,
      pending,
      complete: !pending,
      profiles: [
        {
          client: "codex",
          choice: "documented",
          label: "Native Codex",
          source: "https://example.com/codex",
          verifiedAt: "2026-10-26",
          assumption: "Documented default; actual runtime not verified.",
        },
      ],
      servers: [
        {
          id: "docs",
          name: "Documentation",
          path: ".codex/config.toml",
          clients: ["codex"],
          status: pending ? "pending" : "ready",
          detail: pending ? "Reading tool catalog" : "Tool catalog collected",
          toolCount: pending ? null : 2,
          partial: pending,
          collectedAt: pending ? undefined : "2026-10-26T10:00:00.000Z",
          startup: pending
            ? null
            : { tokens: 10, words: 4, bytes: 40, inputCost: 0.00002 },
          onDemand: pending
            ? null
            : { tokens: 100, words: 20, bytes: 400, inputCost: 0.0002 },
        },
      ],
    },
  };
}

it("updates automatic MCP progress without disabling pricing and stops polling when complete", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  TestBed.inject(WorkspaceState).data.set(workspace());
  const fixture = TestBed.createComponent(TokenOptimizer);
  const root: HTMLElement = fixture.nativeElement;
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(true));
  await fixture.whenStable();
  await expect
    .poll(() => root.querySelector('[aria-label="MCP context"]')?.textContent)
    .toContain("Analyzing MCP servers");
  expect(
    root.querySelector<HTMLSelectElement>("#optimizer-model")?.disabled,
  ).toBe(false);
  expect(root.querySelector(".mcp-servers tbody")?.textContent).not.toContain(
    "0 tokens",
  );
  const iceberg = root.querySelector(".iceberg-panel");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(false));
  await fixture.whenStable();
  await expect
    .poll(() => root.querySelector(".mcp-servers tbody")?.textContent)
    .toContain("100");
  expect(root.querySelector(".iceberg-panel")).toBe(iceberg);
  expect(
    root.querySelector('[aria-label="MCP context"]')?.textContent,
  ).toContain("2026-10-26");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  http.expectNone("/api/token-estimate?client=all&model=gpt-6.1-sol");
  http.verify();
  fixture.destroy();
});

it("persists loading assumptions per project without changing the selected price model", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const state = TestBed.inject(WorkspaceState);
  state.data.set(workspace());
  let fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(false));
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  await expect
    .poll(() => root.querySelector('[data-mcp-client="codex"]'))
    .not.toBeNull();
  const select = root.querySelector<HTMLSelectElement>(
    '[data-mcp-client="codex"]',
  );
  expect(select).not.toBeNull();
  select!.value = "eager";
  select!.dispatchEvent(new Event("change"));
  await fixture.whenStable();
  http
    .expectOne(
      "/api/token-estimate?client=all&model=gpt-6.1-sol&mcp_codex=eager",
    )
    .flush(mcpEstimate(false));
  await fixture.whenStable();
  expect(root.querySelector<HTMLSelectElement>("#optimizer-model")?.value).toBe(
    "gpt-6.1-sol",
  );
  fixture.destroy();
  fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  http
    .expectOne(
      "/api/token-estimate?client=all&model=gpt-6.1-sol&mcp_codex=eager",
    )
    .flush(mcpEstimate(false));
  await fixture.whenStable();
  fixture.destroy();
  state.data.set(workspace("/other-project"));
  fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(false));
  await fixture.whenStable();
  fixture.destroy();
  http.verify();
});

it("cancels pending MCP polling when destroyed and reports unavailable browser storage", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const state = TestBed.inject(WorkspaceState);
  const getItem = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation(() => {
      throw new Error("Unavailable");
    });
  state.data.set(workspace());
  const fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(true));
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  await expect
    .poll(() => root.textContent)
    .toContain("MCP profiles could not be restored");
  fixture.destroy();
  getItem.mockRestore();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  http.expectNone("/api/token-estimate?client=all&model=gpt-6.1-sol");
  http.verify();
});

it("ignores an old MCP poll after switching agents", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const state = TestBed.inject(WorkspaceState);
  state.data.set(workspace());
  const fixture = TestBed.createComponent(TokenOptimizer);
  const root: HTMLElement = fixture.nativeElement;
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(mcpEstimate(true));
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const old = http.expectOne(
    "/api/token-estimate?client=all&model=gpt-6.1-sol",
  );
  expect(
    root.querySelector<HTMLSelectElement>("#optimizer-model")?.disabled,
  ).toBe(false);
  state.toggleClient("codex");
  await fixture.whenStable();
  http
    .expectOne("/api/token-estimate?client=codex&model=gpt-6.1-sol")
    .flush({ ...mcpEstimate(false), client: "codex" });
  await fixture.whenStable();
  old.flush({
    ...mcpEstimate(true),
    onDemand: { tokens: 999, words: 99, bytes: 999, inputCost: 9 },
  });
  await fixture.whenStable();
  await expect
    .poll(() => root.querySelector(".on-demand .token-total")?.textContent)
    .toContain("240");
  expect(
    root.querySelector(".on-demand .token-total")?.textContent,
  ).not.toContain("999");
  await new Promise((resolve) => setTimeout(resolve, 1100));
  http.expectNone("/api/token-estimate?client=all&model=gpt-6.1-sol");
  http.expectNone("/api/token-estimate?client=codex&model=gpt-6.1-sol");
  fixture.destroy();
  http.verify();
});

it("shows one startup breakdown row per MCP server while summing its components", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(TokenOptimizer);
  await fixture.whenStable();
  const estimate = mcpEstimate(false);
  estimate.entries = [
    {
      id: "docs:name",
      mcpServerId: "docs",
      name: "Documentation",
      path: ".codex/config.toml",
      scope: "project",
      portion: "startup",
      kind: "mcp",
      tokens: 7,
      words: 2,
      bytes: 28,
      inputCost: 0.000014,
    },
    {
      id: "docs:schema",
      mcpServerId: "docs",
      name: "Documentation",
      path: ".codex/config.toml",
      scope: "project",
      portion: "startup",
      kind: "mcp",
      tokens: 8,
      words: 4,
      bytes: 32,
      inputCost: 0.000016,
    },
  ];
  http
    .expectOne("/api/token-estimate?client=all&model=gpt-6.1-sol")
    .flush(estimate);
  await fixture.whenStable();
  const root: HTMLElement = fixture.nativeElement;
  await expect
    .poll(
      () =>
        root.querySelectorAll(".breakdown:not(.mcp-servers) tbody tr").length,
    )
    .toBe(1);
  const row = root.querySelector(".breakdown:not(.mcp-servers) tbody tr")!;
  expect(row.querySelector("th strong")?.textContent).toBe("Documentation");
  expect(
    [...row.querySelectorAll("td")].map((cell) => cell.textContent?.trim()),
  ).toEqual(["15", "6"]);
  fixture.destroy();
  http.verify();
});
