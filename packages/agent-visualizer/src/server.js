import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { scanProject } from "./scanner.js";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/client-logos/cursor.png", ["client-logos/cursor.png", "image/png"]],
  ["/client-logos/claude.png", ["client-logos/claude.png", "image/png"]],
  ["/client-logos/chatgpt.webp", ["client-logos/chatgpt.webp", "image/webp"]],
]);

export async function startServer({
  root,
  port = 0,
  includeUser = true,
  home,
  codexHome,
} = {}) {
  let snapshot = await scanProject(root, { includeUser, home, codexHome });
  let refresh;
  const token = randomBytes(24).toString("hex");
  const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
  const server = http.createServer(async (req, res) => {
    const host = `127.0.0.1:${server.address().port}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const send = (status, body, type = "application/json; charset=utf-8") => {
      res.writeHead(status, { "Content-Type": type });
      res.end(
        typeof body === "string" || Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
      );
    };
    if (
      req.headers.host !== host ||
      (req.headers.origin && req.headers.origin !== `http://${host}`)
    )
      return send(403, { error: "Local requests only." });
    let url;
    try {
      url = new URL(req.url, `http://${host}`);
    } catch {
      return send(400, { error: "Invalid URL." });
    }
    if (req.method !== "GET") return send(405, { error: "Read-only server." });
    if (url.pathname.startsWith("/api/")) {
      const provided = Buffer.from(
        req.headers.authorization?.replace(/^Bearer /, "") || "",
      );
      const expected = Buffer.from(token);
      if (
        provided.length !== expected.length ||
        !timingSafeEqual(provided, expected)
      )
        return send(401, {
          error:
            "Open the URL printed in your terminal to access this session.",
        });
      try {
        if (url.pathname === "/api/scan") {
          if (url.searchParams.has("refresh")) {
            refresh ||= scanProject(root, { includeUser, home, codexHome })
              .then((result) => {
                snapshot = result;
              })
              .finally(() => {
                refresh = null;
              });
            await refresh;
          }
          return send(200, snapshot.data);
        }
        if (url.pathname === "/api/content") {
          const value = snapshot.content.get(url.searchParams.get("id"));
          return value === undefined
            ? send(404, { error: "Context file not found." })
            : send(200, { text: value });
        }
        return send(404, { error: "Not found." });
      } catch {
        return send(500, {
          error: "Scan failed. Check folder permissions and try again.",
        });
      }
    }
    const asset = assets.get(url.pathname);
    if (!asset) return send(404, { error: "Not found." });
    try {
      send(200, await fs.readFile(publicDir + asset[0]), asset[1]);
    } catch {
      send(500, { error: "UI assets missing. Run npm run build." });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    server,
    token,
    url: `http://127.0.0.1:${server.address().port}/#token=${token}`,
  };
}
