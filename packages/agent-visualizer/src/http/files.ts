import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import type {
  DeleteResponse,
  FileResponse,
  SaveResponse,
} from "../contracts.js";
import type { EditableFile } from "../scan/types.js";
import { record } from "../scan/values.js";
import { HttpError } from "./errors.js";

const MAX_EDIT_BYTES = 512 * 1024;
const revision = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

async function readEditBody(
  req: IncomingMessage,
  deleting: boolean,
): Promise<{ revision: string; text: string }> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new HttpError(415, "Expected JSON.");
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const raw of req) {
    const chunk: unknown = raw;
    if (!Buffer.isBuffer(chunk)) throw new HttpError(400, "Invalid JSON.");
    bytes += chunk.length;
    if (bytes > MAX_EDIT_BYTES * 2)
      throw new HttpError(413, "File is too large to edit.");
    chunks.push(chunk);
  }
  let body: Record<string, unknown>;
  try {
    body = record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
  if (
    typeof body.revision !== "string" ||
    (!deleting && typeof body.text !== "string")
  ) {
    throw new HttpError(
      400,
      deleting ? "Missing revision." : "Missing text or revision.",
    );
  }
  const text = typeof body.text === "string" ? body.text : "";
  if (!deleting && Buffer.byteLength(text) > MAX_EDIT_BYTES)
    throw new HttpError(413, "File is too large to edit.");
  return { revision: body.revision, text };
}

async function readCurrent(target: EditableFile): Promise<string> {
  if ((await fs.realpath(target.file)) !== target.real)
    throw new HttpError(409, "File path changed. Rescan before editing.");
  const stat = await fs.stat(target.real);
  if (!stat.isFile() || stat.size > MAX_EDIT_BYTES)
    throw new HttpError(413, "File is too large to edit.");
  return fs.readFile(target.real, "utf8");
}

/** One write queue per server; failed writes must not poison subsequent requests. */
export class FileOperations {
  private saving: Promise<unknown> = Promise.resolve();
  async handle(
    req: IncomingMessage,
    target: EditableFile,
  ): Promise<FileResponse | SaveResponse | DeleteResponse> {
    if (req.method === "GET") {
      const text = await readCurrent(target);
      return { text, revision: revision(text) };
    }
    const deleting = req.method === "DELETE";
    const body = await readEditBody(req, deleting);
    const save = this.saving.then(
      async (): Promise<SaveResponse | DeleteResponse> => {
        const current = await readCurrent(target);
        if (revision(current) !== body.revision)
          throw new HttpError(
            409,
            "File changed on disk. Reopen it before changing it.",
          );
        if (deleting) {
          if (
            !target.deletable ||
            (await fs.lstat(target.file)).isSymbolicLink()
          )
            throw new HttpError(
              409,
              "This file has another path. Rescan before deleting.",
            );
          await fs.unlink(target.file);
          return { deleted: true };
        }
        await fs.writeFile(target.real, body.text, "utf8");
        return { revision: revision(body.text) };
      },
    );
    this.saving = save.catch(() => undefined);
    return save;
  }
}
