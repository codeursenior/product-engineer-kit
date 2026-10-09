import path from "node:path";
import type { links } from "./metadata.js";
import type { FileEntry, ScanEnvironment } from "./types.js";
import { required, slash } from "./values.js";

/** Shared matching semantics for the context graph and token inventory. */
export function referenceResolver(entries: FileEntry[], env: ScanEnvironment) {
  const { root, home } = env;
  const byAlias = new Map<string, FileEntry>();
  const byName = new Map<string, FileEntry[]>();
  for (const entry of entries) {
    for (const alias of entry.aliases) byAlias.set(alias, entry);
    const name = path
      .basename(entry.file)
      .replace(/\.(md|mdc)$/i, "")
      .toLowerCase();
    if (!byName.has(name)) byName.set(name, []);
    required(byName.get(name)).push(entry);
  }
  return (
    entry: FileEntry,
    link: ReturnType<typeof links>[number],
  ): FileEntry | undefined => {
    let target: string;
    try {
      target = decodeURIComponent(link.target.split("#")[0] ?? "");
    } catch {
      return undefined;
    }
    if (!target || /^(https?:|mailto:|data:|file:|javascript:)/i.test(target))
      return undefined;
    let found: FileEntry | undefined;
    const absolute = target.startsWith("~/")
      ? path.join(home, target.slice(2))
      : path.resolve(path.dirname(entry.file), target);
    found = byAlias.get(absolute) || byAlias.get(`${absolute}.md`);
    if (!found && !link.wiki) found = byAlias.get(path.resolve(root, target));
    if (!found && link.wiki) {
      const candidates = (
        byName.get(path.basename(target).replace(/\.md$/i, "").toLowerCase()) ||
        []
      ).filter(
        (e) =>
          e.scope === entry.scope &&
          (!target.includes("/") ||
            e.aliases.some((a) =>
              slash(a).endsWith(`${target.replace(/\.md$/i, "")}.md`),
            )),
      );
      if (candidates.length === 1) found = candidates[0];
    }
    return found;
  };
}
