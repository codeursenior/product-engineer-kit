import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { afterEach, beforeEach, expect, it } from "vitest";
import { WorkspaceApi } from "./api";
import { scanData } from "./test-data";

beforeEach(() => {
  sessionStorage.clear();
  history.replaceState(null, "", "/#token=test-session");
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
});
afterEach(() => TestBed.inject(HttpTestingController).verify());
it("moves the token to tab storage, removes the fragment, and authenticates requests", async () => {
  const api = TestBed.inject(WorkspaceApi);
  expect(location.hash).toBe("");
  expect(sessionStorage.getItem("boyscout-token")).toBe("test-session");
  const pending = api.scan(true);
  const req = TestBed.inject(HttpTestingController).expectOne(
    "/api/scan?refresh=1",
  );
  expect(req.request.headers.get("Authorization")).toBe("Bearer test-session");
  req.flush(scanData());
  expect(await pending).toEqual(scanData());
});
it("encodes target IDs and preserves revision conflicts", async () => {
  const api = TestBed.inject(WorkspaceApi);
  const pending = api.save("a/b", { text: "Updated", revision: "old" });
  const assertion = expect(pending).rejects.toThrow("File changed on disk.");
  const req = TestBed.inject(HttpTestingController).expectOne(
    "/api/file?id=a%2Fb",
  );
  expect(req.request.method).toBe("PUT");
  expect(req.request.body).toEqual({ text: "Updated", revision: "old" });
  req.flush(
    { error: "File changed on disk." },
    { status: 409, statusText: "Conflict" },
  );
  await assertion;
});
