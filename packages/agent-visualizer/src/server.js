import http from "node:http";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { scanProject } from "./scanner.js";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
  ["/mountain-context.jpg", ["mountain-context.jpg", "image/jpeg"]],
  ["/client-logos/cursor.png", ["client-logos/cursor.png", "image/png"]],
  ["/client-logos/claude.png", ["client-logos/claude.png", "image/png"]],
  ["/client-logos/chatgpt.webp", ["client-logos/chatgpt.webp", "image/webp"]],
]);
const MAX_EDIT_BYTES = 512 * 1024;
const revision = (text) => createHash("sha256").update(text).digest("hex");

async function readEditBody(req) {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw { status: 415, error: "Expected JSON." };
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > MAX_EDIT_BYTES * 2)
      throw { status: 413, error: "File is too large to edit." };
    chunks.push(chunk);
  }
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw { status: 400, error: "Invalid JSON." };
  }
  if (typeof body?.text !== "string" || typeof body?.revision !== "string")
    throw { status: 400, error: "Missing text or revision." };
  if (Buffer.byteLength(body.text) > MAX_EDIT_BYTES)
    throw { status: 413, error: "File is too large to edit." };
  return body;
}

export async function startServer({
  root,
  port = 0,
  includeUser = true,
  home,
  codexHome,
} = {}) {
  let snapshot = await scanProject(root, { includeUser, home, codexHome });
  let refresh;
  let saving = Promise.resolve();
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
        if (url.pathname === "/api/file") {
          if (!["GET", "PUT"].includes(req.method))
            return send(405, { error: "Method not allowed." });
          const target = snapshot.editable.get(url.searchParams.get("id"));
          if (!target) return send(404, { error: "Editable file not found." });
          const readCurrent = async () => {
            if ((await fs.realpath(target.file)) !== target.real)
              throw {
                status: 409,
                error: "File path changed. Rescan before editing.",
              };
            const stat = await fs.stat(target.real);
            if (!stat.isFile() || stat.size > MAX_EDIT_BYTES)
              throw { status: 413, error: "File is too large to edit." };
            return fs.readFile(target.real, "utf8");
          };
          if (req.method === "GET") {
            const text = await readCurrent();
            return send(200, { text, revision: revision(text) });
          }
          const body = await readEditBody(req);
          const save = saving.then(async () => {
            const current = await readCurrent();
            if (revision(current) !== body.revision)
              throw {
                status: 409,
                error: "File changed on disk. Reopen it before saving.",
              };
            await fs.writeFile(target.real, body.text, "utf8");
            return { revision: revision(body.text) };
          });
          saving = save.catch(() => {});
          return send(200, await save);
        }
        if (req.method !== "GET")
          return send(405, { error: "Method not allowed." });
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
      } catch (error) {
        return send(error.status || 500, {
          error:
            error.error ||
            "File operation failed. Check permissions and try again.",
        });
      }
    }
    if (req.method !== "GET")
      return send(405, { error: "Method not allowed." });
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
