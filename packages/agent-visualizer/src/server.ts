import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { browserAssets } from "./http/assets.js";
import { HttpError } from "./http/errors.js";
import { FileOperations } from "./http/files.js";
import {
  authenticated,
  localRequest,
  securityHeaders,
} from "./http/security.js";
import type { ScanOptions } from "./scan/types.js";
import { scanProject } from "./scanner.js";

export interface ServerOptions extends ScanOptions {
  root: string;
  port?: number;
}
export interface LocalServer {
  server: http.Server;
  url: string;
  token: string;
}

export async function startServer({
  root,
  port = 0,
  ...options
}: ServerOptions): Promise<LocalServer> {
  let snapshot = await scanProject(root, options);
  let refresh: Promise<void> | undefined;
  const files = new FileOperations();
  const token = randomBytes(24).toString("hex");
  const assets = await browserAssets(
    fileURLToPath(new URL("../dist/browser/", import.meta.url)),
  );
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    if (!address || typeof address === "string") {
      res.end();
      return;
    }
    const host = `127.0.0.1:${address.port}`;
    const nonce = randomBytes(24).toString("base64");
    securityHeaders(res, nonce);
    const send = (
      status: number,
      body: unknown,
      type = "application/json; charset=utf-8",
    ): void => {
      res.writeHead(status, { "Content-Type": type });
      res.end(
        typeof body === "string" || Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
      );
    };
    if (!localRequest(req, host))
      return send(403, { error: "Local requests only." });
    let url: URL;
    try {
      url = new URL(req.url ?? "/", `http://${host}`);
    } catch {
      return send(400, { error: "Invalid URL." });
    }
    if (url.pathname.startsWith("/api/")) {
      if (!authenticated(req, token))
        return send(401, {
          error:
            "Open the URL printed in your terminal to access this session.",
        });
      try {
        if (url.pathname === "/api/file") {
          if (!["GET", "PUT", "DELETE"].includes(req.method ?? ""))
            return send(405, { error: "Method not allowed." });
          const target = snapshot.editable.get(
            url.searchParams.get("id") ?? "",
          );
          if (!target) return send(404, { error: "Editable file not found." });
          return send(200, await files.handle(req, target));
        }
        if (req.method !== "GET")
          return send(405, { error: "Method not allowed." });
        if (url.pathname === "/api/scan") {
          if (url.searchParams.has("refresh")) {
            refresh ??= scanProject(root, options)
              .then((result) => {
                snapshot = result;
              })
              .finally(() => {
                refresh = undefined;
              });
            await refresh;
          }
          return send(200, snapshot.data);
        }
        if (url.pathname === "/api/content") {
          const text = snapshot.content.get(url.searchParams.get("id") ?? "");
          return text === undefined
            ? send(404, { error: "Context file not found." })
            : send(200, { text });
        }
        return send(404, { error: "Not found." });
      } catch (error) {
        return send(error instanceof HttpError ? error.status : 500, {
          error:
            error instanceof HttpError
              ? error.message
              : "File operation failed. Check permissions and try again.",
        });
      }
    }
    if (req.method !== "GET")
      return send(405, { error: "Method not allowed." });
    const asset = assets.get(url.pathname);
    if (!asset)
      return send(url.pathname === "/" ? 500 : 404, {
        error:
          url.pathname === "/"
            ? "UI assets missing. Run npm run build."
            : "Not found.",
      });
    try {
      const bytes = await fs.readFile(asset.file);
      send(
        200,
        url.pathname === "/"
          ? bytes.toString("utf8").replaceAll("__CSP_NONCE__", nonce)
          : bytes,
        asset.type,
      );
    } catch {
      send(500, { error: "UI assets missing. Run npm run build." });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Server did not bind to a local port.");
  return {
    server,
    token,
    url: `http://127.0.0.1:${address.port}/#token=${token}`,
  };
}
