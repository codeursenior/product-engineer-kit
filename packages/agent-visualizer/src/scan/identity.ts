import fs from "node:fs/promises";
import path from "node:path";
import type { AgentIdentity } from "../contracts.js";
import { inside } from "./values.js";

/** Read only bounded regular files inside the selected project. */
async function read(root: string, name: string, limit: number) {
  try {
    const real = await fs.realpath(path.join(root, ".agents", name));
    if (!inside(root, real)) return;
    const stat = await fs.stat(real);
    if (!stat.isFile() || stat.size > limit) return;
    const file = await fs.open(real, "r");
    try {
      const opened = await file.stat();
      if (!opened.isFile() || opened.size > limit) return;
      const buffer = Buffer.alloc(limit + 1);
      let size = 0;
      while (size < buffer.length) {
        const { bytesRead } = await file.read(
          buffer,
          size,
          buffer.length - size,
        );
        if (!bytesRead) break;
        size += bytesRead;
      }
      return size <= limit ? buffer.subarray(0, size) : undefined;
    } finally {
      await file.close();
    }
  } catch {
    // An optional identity must never prevent opening the workspace.
    return;
  }
}

export async function discoverIdentity(
  root: string,
): Promise<AgentIdentity | undefined> {
  const identity: AgentIdentity = {};
  const text = await read(root, "NAME.md", 4096);
  const name = text
    ?.toString("utf8")
    .trim()
    .split(/\r?\n|\r/)[0]
    ?.replace(/^#{1,6}(?:\s+|$)/, "")
    .trim();
  if (name && [...name].length <= 100 && !/[\p{Cc}\p{Cf}\uFFFD]/u.test(name))
    identity.name = name;

  for (const [filename, mime, signature] of [
    ["AVATAR.png", "image/png", "89504e470d0a1a0a"],
    ["AVATAR.jpeg", "image/jpeg", "ffd8ff"],
  ] as const) {
    const bytes = await read(root, filename, 2 * 1024 * 1024);
    if (
      bytes
        ?.subarray(0, signature.length / 2)
        .equals(Buffer.from(signature, "hex"))
    ) {
      identity.avatar = `data:${mime};base64,${bytes.toString("base64")}`;
      break;
    }
  }
  return identity.name || identity.avatar ? identity : undefined;
}
