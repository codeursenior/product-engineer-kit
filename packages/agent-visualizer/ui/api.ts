import { HttpClient, HttpErrorResponse } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import type {
  ContentResponse,
  DeleteResponse,
  FileResponse,
  SaveRequest,
  SaveResponse,
  ScanData,
} from "../src/contracts";

@Injectable({ providedIn: "root" })
export class WorkspaceApi {
  private readonly http = inject(HttpClient);
  private readonly token =
    new URLSearchParams(location.hash.slice(1)).get("token") ||
    sessionStorage.getItem("boyscout-token") ||
    "";
  constructor() {
    if (this.token) sessionStorage.setItem("boyscout-token", this.token);
    history.replaceState(null, "", location.pathname);
  }
  private async request<T>(
    method: string,
    route: string,
    body?: unknown,
  ): Promise<T> {
    try {
      return await firstValueFrom(
        this.http.request<T>(method, route, {
          body,
          headers: { Authorization: `Bearer ${this.token}` },
        }),
      );
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const body: unknown = error.error;
        if (
          body &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
        )
          throw new Error(body.error);
      }
      throw new Error("Unable to read the workspace.");
    }
  }
  scan(refresh = false): Promise<ScanData> {
    return this.request("GET", `/api/scan${refresh ? "?refresh=1" : ""}`);
  }
  content(id: string): Promise<ContentResponse> {
    return this.request("GET", `/api/content?id=${encodeURIComponent(id)}`);
  }
  file(id: string): Promise<FileResponse> {
    return this.request("GET", `/api/file?id=${encodeURIComponent(id)}`);
  }
  save(id: string, body: SaveRequest): Promise<SaveResponse> {
    return this.request("PUT", `/api/file?id=${encodeURIComponent(id)}`, body);
  }
  delete(id: string, revision: string): Promise<DeleteResponse> {
    return this.request("DELETE", `/api/file?id=${encodeURIComponent(id)}`, {
      revision,
    });
  }
}
