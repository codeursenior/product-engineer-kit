import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  type Transport,
} from "@modelcontextprotocol/client";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/client/stdio";
import type {
  McpAnalysis,
  McpCatalogResult,
  McpTarget,
  McpToolDefinition,
} from "./types.js";

const catalogLimit = 4 * 1024 * 1024;
const execute = promisify(execFile);
class CollectionFailure extends Error {}

function validateNesting(value: unknown): void {
  const pending = [{ value, depth: 0 }];
  for (;;) {
    const entry = pending.pop();
    if (!entry) return;
    if (entry.value === null || typeof entry.value !== "object") continue;
    if (entry.depth > 64)
      throw new CollectionFailure("MCP catalogue exceeds the nesting limit.");
    for (const child of Object.values(entry.value))
      pending.push({ value: child, depth: entry.depth + 1 });
  }
}

/** Restrict even legacy SSE's advertised POST endpoint to the configured origin. */
function connectionFetch(
  target: McpTarget,
  signal: AbortSignal,
  observed: { failure?: string },
): typeof fetch {
  const origin = new URL(target.url!).origin;
  let received = 0;
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin) {
      observed.failure = "MCP endpoint changed origin.";
      throw new CollectionFailure(observed.failure);
    }
    const headers = new Headers(target.headers);
    new Headers(input instanceof Request ? input.headers : undefined).forEach(
      (value, name) => headers.set(name, value),
    );
    new Headers(init?.headers).forEach((value, name) =>
      headers.set(name, value),
    );
    const response = await fetch(input, {
      ...init,
      headers,
      redirect: "error",
      signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
    });
    if (response.status === 401 || response.status === 403) {
      observed.failure = "Authentication unavailable.";
      await response.body?.cancel();
      throw new CollectionFailure(observed.failure);
    }
    if (!response.body) return response;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          received += chunk.byteLength;
          if (received > catalogLimit) {
            observed.failure = "MCP catalogue exceeds the size limit.";
            controller.error(new CollectionFailure(observed.failure));
            return;
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

function createTransport(
  target: McpTarget,
  signal: AbortSignal,
  observed: { failure?: string },
): Transport {
  if (target.transport === "stdio" && target.command)
    return new StdioClientTransport({
      command: target.command,
      args: target.args,
      cwd: target.cwd,
      env: { ...getDefaultEnvironment(), ...target.env },
      stderr: "ignore",
      maxBufferSize: catalogLimit,
    });
  if (
    (target.transport === "HTTP" || target.transport === "SSE") &&
    target.url
  ) {
    const url = new URL(target.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new CollectionFailure("Unsupported MCP endpoint.");
    const options = {
      fetch: connectionFetch(target, signal, observed),
      requestInit: { headers: target.headers, redirect: "error" as const },
    };
    return target.transport === "SSE"
      ? new SSEClientTransport(url, options)
      : new StreamableHTTPClientTransport(url, options);
  }
  throw new CollectionFailure("Unsupported MCP configuration.");
}

/** Only retain the definition fields whose text can reach the model. */
function definition(tool: McpToolDefinition): McpToolDefinition {
  return {
    name: tool.name,
    ...(tool.description === undefined
      ? {}
      : { description: tool.description }),
    ...(tool.title === undefined ? {} : { title: tool.title }),
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema === undefined
      ? {}
      : { outputSchema: tool.outputSchema }),
    ...(tool.annotations === undefined
      ? {}
      : { annotations: tool.annotations }),
  };
}

async function descendants(pid: number): Promise<number[]> {
  if (process.platform === "win32") return [];
  try {
    const { stdout } = await execute("ps", ["-axo", "pid=,ppid="], {
      timeout: 1000,
      maxBuffer: 1024 * 1024,
    });
    const rows = stdout
      .trim()
      .split("\n")
      .map((line) => line.trim().split(/\s+/).map(Number));
    const found = new Set([pid]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const [child, parent] of rows)
        if (child && parent && found.has(parent) && !found.has(child)) {
          found.add(child);
          changed = true;
        }
    }
    return [...found].filter((child) => child !== pid);
  } catch {
    return [];
  }
}

async function close(
  client: Client,
  transport: Transport | undefined,
): Promise<void> {
  const pid = transport instanceof StdioClientTransport ? transport.pid : null;
  const children = pid ? await descendants(pid) : [];
  if (pid && process.platform === "win32") {
    // /T is essential for package launchers that start the actual MCP child.
    await execute("taskkill", ["/pid", String(pid), "/T", "/F"], {
      timeout: 3000,
    }).catch(() => undefined);
  }
  let closed = false;
  const cleanup = (async () => {
    try {
      await client.close();
    } catch {
      /* Never forward protocol or process errors. */
    }
    await transport?.close().catch(() => undefined);
    closed = true;
  })();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      cleanup,
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, 4500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    // SDK stdio cleanup already escalates after four seconds. Keep our own
    // deadline so a future transport cannot indefinitely stall a rescan.
    for (const child of [
      ...children.reverse(),
      ...(!closed && pid ? [pid] : []),
    ]) {
      try {
        process.kill(child, "SIGKILL");
      } catch {
        /* Already exited. */
      }
    }
  }
}

/** Connect, list metadata, and disconnect. No tool execution is exposed here. */
export async function collectMcpCatalog(
  target: McpTarget,
  signal: AbortSignal,
): Promise<McpCatalogResult> {
  if (target.issue) return { ...target.issue };
  const client = new Client(
    { name: "agent-visualizer", version: "1" },
    {
      capabilities: {},
      versionNegotiation:
        target.transport === "HTTP"
          ? { mode: "auto", probe: { timeoutMs: 2000 } }
          : { mode: "legacy" },
    },
  );
  let transport: Transport | undefined;
  const observed: { failure?: string } = {};
  const connection = new AbortController();
  const connectionSignal = AbortSignal.any([signal, connection.signal]);
  try {
    signal.throwIfAborted();
    transport = createTransport(target, connectionSignal, observed);
    await client.connect(transport, { signal: connectionSignal });
    const instructions = client.getInstructions() ?? "";
    let bytes = Buffer.byteLength(instructions);
    if (bytes > catalogLimit)
      throw new CollectionFailure("MCP catalogue exceeds the size limit.");
    const tools: McpToolDefinition[] = [];
    if (client.getServerCapabilities()?.tools) {
      const cursors = new Set<string>();
      const names = new Set<string>();
      let cursor: string | undefined;
      for (let pageNumber = 0; ; pageNumber++) {
        if (pageNumber >= 100)
          throw new CollectionFailure("MCP catalogue exceeds the page limit.");
        const page = await client.request(
          {
            method: "tools/list",
            params: cursor === undefined ? {} : { cursor },
          },
          { signal: connectionSignal },
        );
        validateNesting(page);
        bytes += Buffer.byteLength(JSON.stringify(page));
        if (bytes > catalogLimit || tools.length + page.tools.length > 5000)
          throw new CollectionFailure("MCP catalogue exceeds the size limit.");
        for (const tool of page.tools) {
          if (names.has(tool.name))
            throw new CollectionFailure(
              "MCP catalogue contains duplicate tools.",
            );
          names.add(tool.name);
          tools.push(definition(tool));
        }
        if (page.nextCursor === undefined) break;
        if (cursors.has(page.nextCursor))
          throw new CollectionFailure(
            "MCP catalogue pagination did not finish.",
          );
        cursors.add(page.nextCursor);
        cursor = page.nextCursor;
      }
    }
    signal.throwIfAborted();
    return {
      status: "ready",
      detail: "Catalogue collected.",
      instructions,
      tools,
      collectedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      status: "unavailable",
      detail: signal.aborted
        ? "MCP analysis cancelled."
        : (observed.failure ??
          (error instanceof CollectionFailure
            ? error.message
            : "MCP catalogue unavailable. Check the server configuration or authentication.")),
    };
  } finally {
    connection.abort();
    await close(client, transport);
  }
}

export function startMcpAnalysis(
  targets: McpTarget[],
  {
    enabled = true,
    serverTimeoutMs = 30000,
    runTimeoutMs = 120000,
  }: {
    enabled?: boolean;
    serverTimeoutMs?: number;
    runTimeoutMs?: number;
  } = {},
): { state: McpAnalysis; cancel: () => void; done: Promise<void> } {
  const controller = new AbortController();
  const state: McpAnalysis = {
    enabled,
    running: enabled && targets.some((target) => !target.issue),
    results: new Map(),
  };
  const groups = new Map<string, McpTarget[]>();
  for (const target of targets) {
    state.results.set(
      target.id,
      !enabled
        ? { status: "disabled", detail: "MCP analysis is disabled." }
        : target.issue
          ? { ...target.issue }
          : { status: "pending", detail: "Collecting MCP catalogue…" },
    );
    if (enabled && !target.issue)
      groups.set(target.catalogId, [
        ...(groups.get(target.catalogId) ?? []),
        target,
      ]);
  }
  const queue = [...groups.values()];
  const timer = setTimeout(() => controller.abort(), runTimeoutMs);
  timer.unref();
  async function worker(): Promise<void> {
    for (;;) {
      const group = queue.shift();
      if (!group) return;
      const first = group[0]!;
      const task = new AbortController();
      const abort = () => task.abort();
      controller.signal.addEventListener("abort", abort, { once: true });
      if (controller.signal.aborted) task.abort();
      let timedOut = false;
      const deadline = setTimeout(() => {
        timedOut = true;
        task.abort();
      }, serverTimeoutMs);
      deadline.unref();
      try {
        const result = await collectMcpCatalog(first, task.signal);
        for (const target of group)
          state.results.set(
            target.id,
            timedOut || controller.signal.aborted
              ? {
                  status: "unavailable",
                  detail: timedOut
                    ? "MCP analysis timed out."
                    : "MCP analysis cancelled.",
                }
              : result,
          );
      } finally {
        clearTimeout(deadline);
        controller.signal.removeEventListener("abort", abort);
      }
    }
  }
  const done = Promise.all([worker(), worker()])
    .then(() => undefined)
    .finally(() => {
      clearTimeout(timer);
      state.running = false;
    });
  return { state, cancel: () => controller.abort(), done };
}
