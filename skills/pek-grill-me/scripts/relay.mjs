#!/usr/bin/env node
import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
  ["/favicon.svg", ["favicon.svg", "image/svg+xml"]],
]);
const publicDir = new URL("../public/", import.meta.url);

function openBrowser(url) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: true,
    shell: false,
  });
  child.on("error", () =>
    console.error(`Browser did not open. Open ${url} manually.`),
  );
  child.on("exit", (code) => {
    if (code) console.error(`Browser did not open. Open ${url} manually.`);
  });
  child.unref();
}

export async function startSession({ port = 0, open = false } = {}) {
  const token = randomBytes(32).toString("hex");
  const history = [];
  const pending = [];
  const deliveries = new Map();
  let closed = false;
  let awaitingAnswer = false;
  let nextId = 1;
  const publish = (event) => {
    history.push({ id: nextId++, ...event });
    for (const wake of pending.splice(0)) wake();
  };
  const server = http.createServer(async (req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    );
    const send = (status, body, type = "application/json; charset=utf-8") => {
      if (res.destroyed || res.writableEnded) return;
      res.writeHead(status, { "Content-Type": type });
      res.end(
        typeof body === "string" || Buffer.isBuffer(body)
          ? body
          : JSON.stringify(body),
      );
    };
    if (
      req.headers.host !== new URL(base).host ||
      (req.headers.origin && req.headers.origin !== base)
    )
      return send(403, { error: "Local requests only." });
    let url;
    try {
      url = new URL(req.url, base);
    } catch {
      return send(400, { error: "Invalid URL." });
    }
    if (url.pathname.startsWith("/api/")) {
      const supplied = Buffer.from(
        req.headers.authorization?.replace(/^Bearer /, "") || "",
      );
      const expected = Buffer.from(token);
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return send(401, { error: "Invalid session token." });
      if (
        req.method === "POST" &&
        !["application/json"].includes(
          req.headers["content-type"]?.split(";")[0],
        )
      )
        return send(415, { error: "JSON required." });
      const readBody = async () => {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 65536) throw new RangeError("Message is too long.");
        }
        const parsed = JSON.parse(body);
        if (
          parsed === null ||
          typeof parsed !== "object" ||
          Array.isArray(parsed)
        )
          throw new SyntaxError("JSON object required.");
        return parsed;
      };
      try {
        if (url.pathname === "/api/history" && req.method === "GET")
          return send(200, { history, closed });
        if (url.pathname === "/api/events" && req.method === "GET") {
          const after = Number(url.searchParams.get("after") || 0);
          if (!Number.isSafeInteger(after) || after < 0)
            return send(400, { error: "Invalid cursor." });
          if (!history.some((item) => item.id > after) && !closed)
            await new Promise((resolve) => {
              const timeout = setTimeout(() => {
                pending.splice(pending.indexOf(wake), 1);
                resolve();
              }, 25000);
              const wake = () => {
                clearTimeout(timeout);
                resolve();
              };
              pending.push(wake);
              res.once("close", () => {
                const index = pending.indexOf(wake);
                if (index !== -1) pending.splice(index, 1);
                clearTimeout(timeout);
                resolve();
              });
            });
          return send(200, {
            events: history.filter((item) => item.id > after),
            closed,
          });
        }
        if (url.pathname === "/api/question" && req.method === "POST") {
          const body = await readBody();
          if (closed) return send(410, { error: "Session closed." });
          if (awaitingAnswer)
            return send(409, {
              error: "A question is already awaiting an answer.",
            });
          if (
            typeof body.text !== "string" ||
            !body.text.trim() ||
            body.text.length > 16000
          )
            return send(400, { error: "Question text required." });
          publish({ role: "agent", text: body.text });
          awaitingAnswer = true;
          return send(201, { accepted: true });
        }
        if (url.pathname === "/api/answer" && req.method === "POST") {
          const body = await readBody();
          if (
            typeof body.key !== "string" ||
            !/^[a-zA-Z0-9-]{8,100}$/.test(body.key) ||
            typeof body.text !== "string" ||
            !body.text.trim() ||
            body.text.length > 16000
          )
            return send(400, { error: "Answer and idempotency key required." });
          if (deliveries.has(body.key))
            return send(200, {
              accepted: true,
              id: deliveries.get(body.key),
              duplicate: true,
            });
          if (closed) return send(410, { error: "Session closed." });
          if (!awaitingAnswer)
            return send(409, { error: "Wait for the next question." });
          publish({ role: "user", text: body.text });
          awaitingAnswer = false;
          deliveries.set(body.key, nextId - 1);
          return send(201, { accepted: true, id: nextId - 1 });
        }
        if (url.pathname === "/api/close" && req.method === "POST") {
          if (!closed) {
            closed = true;
            publish({ role: "system", text: "Entretien fermé." });
          }
          return send(200, { closed: true });
        }
        return send(404, { error: "Not found." });
      } catch (error) {
        if (error instanceof SyntaxError)
          return send(400, { error: "JSON object required." });
        if (error instanceof RangeError)
          return send(413, { error: "Message is too long." });
        return send(500, { error: "Request failed." });
      }
    }
    if (req.method !== "GET")
      return send(405, { error: "Method not allowed." });
    const asset = assets.get(url.pathname);
    if (!asset) return send(404, { error: "Not found." });
    try {
      return send(200, await readFile(new URL(asset[0], publicDir)), asset[1]);
    } catch {
      return send(500, { error: "Interface files missing." });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = `${base}/#token=${token}`;
  if (open) openBrowser(url);
  return {
    server,
    base,
    token,
    url,
    history,
    stop: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const portArg = process.argv.indexOf("--port");
    const port = portArg === -1 ? 0 : Number(process.argv[portArg + 1]);
    if (!Number.isInteger(port) || port < 0 || port > 65535)
      throw new Error("Invalid port.");
    const session = await startSession({
      port,
      open: !process.argv.includes("--no-open"),
    });
    console.log(
      JSON.stringify({
        base: session.base,
        token: session.token,
        url: session.url,
      }),
    );
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => session.stop());
  } catch (error) {
    console.error(`Cannot start local chat: ${error.message}`);
    process.exitCode = 1;
  }
}
