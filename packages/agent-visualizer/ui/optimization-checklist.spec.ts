import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { expect, it } from "vitest";
import { OptimizationChecklist } from "./optimization-checklist";

it("detects RTK independently from token estimates and rechecks installation", async () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const http = TestBed.inject(HttpTestingController);
  const fixture = TestBed.createComponent(OptimizationChecklist);
  const root: HTMLElement = fixture.nativeElement;
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
  http.expectOne("/api/optimization-checks").flush(checklist);
  http.expectNone((request) => request.url.includes("token-estimate"));
  await fixture.whenStable();
  await expect.poll(() => root.textContent).toContain("Install RTK");
  const checkbox = root.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  )!;
  expect(checkbox.checked).toBe(false);
  expect(checkbox.disabled).toBe(true);
  expect(root.textContent).toContain("brew install");
  root.querySelector<HTMLButtonElement>(".check-again")!.click();
  await fixture.whenStable();
  http
    .expectOne("/api/optimization-checks")
    .flush({ checks: [{ ...checklist.checks[0], detected: true }] });
  await fixture.whenStable();
  await expect.poll(() => checkbox.checked).toBe(true);
  expect(checkbox.disabled).toBe(true);
  expect(root.querySelector(".check-again")).toBeNull();
  expect(root.querySelector("svg")).toBeNull();
  http.verify();
});
