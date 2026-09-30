import path from "node:path";
import { parse as yaml } from "yaml";
import type { Client, Scope } from "../contracts.js";
import { inside, MARKDOWN, record, required, slash } from "./values.js";
export const ruleClient = (file: string): Client | null => {
  if (path.basename(file).toLowerCase() === ".cursorrules") return "cursor";
  if (!MARKDOWN.test(file)) return null;
  const normalized = slash(file).toLowerCase();
  if (/(^|\/)\.cursor\/rules\//.test(normalized)) return "cursor";
  if (/(^|\/)\.claude\/rules\//.test(normalized)) return "claude";
  return null;
};
export const toolsForSkill = (p: string): Client[] => {
  const result: Client[] = [];
  if (/(^|\/)\.(agents|cursor|claude|codex)\/skills\//.test(p))
    result.push("cursor");
  if (/(^|\/)\.claude\/skills\//.test(p)) result.push("claude");
  if (/(^|\/)\.(agents|codex)\/skills\//.test(p)) result.push("codex");
  return result;
};
export const clientsForContextEntry = (
  alias: string,
  scope: Scope,
  root: string,
  codexHome: string,
): Client[] => {
  const name = path.basename(alias).toLowerCase();
  if (name === "agents.override.md") return ["codex"];
  if (name === "agents.md") {
    if (scope === "user")
      return inside(codexHome, alias) ? ["codex"] : ["cursor"];
    return ["cursor", "codex"];
  }
  if (name === "claude.local.md") return ["claude"];
  if (name === "claude.md")
    return scope === "project" && path.dirname(alias) === root
      ? ["cursor", "claude"]
      : ["claude"];
  return [];
};
export function frontmatter(text: string): Record<string, unknown> {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const result = yaml(required(match[1]), { maxAliasCount: 20 });
  return record(result);
}
export function links(text: string): { target: string; wiki: boolean }[] {
  const result = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))
    result.push({ target: required(m[1]).split("#")[0] ?? "", wiki: true });
  for (const m of text.matchAll(
    /\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^)]*)?\)/g,
  ))
    result.push({ target: required(m[1] || m[2]), wiki: false });
  for (const m of text.matchAll(
    /(?:`|@)((?:\.{0,2}\/|~\/)?[\w.\-/À-ž]+\.(?:md|mdc))(?=`|\s|$|[,;)])/g,
  ))
    result.push({ target: required(m[1]), wiki: false });
  return result;
}
