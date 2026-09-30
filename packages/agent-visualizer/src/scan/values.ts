import { createHash } from "node:crypto";
import path from "node:path";

export const MAX_FILES = 20000;
export const MAX_BYTES = 512 * 1024;
export const MAX_DEPTH = 35;
export const INSTRUCTION =
  /^(AGENTS(?:\.override)?|CLAUDE(?:\.local)?|GEMINI|copilot-instructions)\.md$|^\.cursorrules$/i;
export const MARKDOWN = /\.(md|mdc)$/i;
export const id = (value: string): string =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);
export const slash = (value: string): string => value.split(path.sep).join("/");
export const inside = (base: string, file: string): boolean => {
  const relative = path.relative(base, file);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
};
export const lineCount = (text: string): number =>
  text.length === 0
    ? 0
    : text.split(/\r\n|\r|\n/).length - Number(/(?:\r\n|\r|\n)$/.test(text));
export const truth = (value: unknown): boolean =>
  value === true || /^(true|yes|on|1)$/i.test(String(value));
export const falsehood = (value: unknown): boolean =>
  value === false || /^(false|no|off|0)$/i.test(String(value));
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function errorCode(error: unknown): string | undefined {
  const code = record(error).code;
  return typeof code === "string" ? code : undefined;
}
/** Indexes asserted here come from internal maps/arrays populated in the same scan. */
export function required<T>(value: T | null | undefined): T {
  if (value === undefined || value === null)
    throw new Error("Missing indexed scan value");
  return value;
}
