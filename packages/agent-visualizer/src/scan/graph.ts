import path from "node:path";
import type { ContextNode, GraphEdge } from "../contracts.js";
import { links, ruleClient } from "./metadata.js";
import type { FileEntry, ScanEnvironment } from "./types.js";
import { inside, required, slash } from "./values.js";
export function buildGraph(
  entries: FileEntry[],
  context: Map<string, ContextNode>,
  addContext: (entry: FileEntry) => void,
  env: ScanEnvironment,
): GraphEdge[] {
  const { root, home } = env;
  const edges = new Map<string, GraphEdge>();
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
  // Follow references from context roots, never turn the entire codebase into a graph.
  const queue = entries.filter((entry) => context.has(entry.id));
  const visited = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const entry = required(queue[i]);
    if (visited.has(entry.id)) continue;
    visited.add(entry.id);
    for (const link of links(entry.text)) {
      let target;
      try {
        target = decodeURIComponent(link.target.split("#")[0] ?? "");
      } catch {
        continue;
      }
      if (!target || /^(https?:|mailto:|data:|file:|javascript:)/i.test(target))
        continue;
      let found;
      const absolute = target.startsWith("~/")
        ? path.join(home, target.slice(2))
        : path.resolve(path.dirname(entry.file), target);
      found = byAlias.get(absolute) || byAlias.get(`${absolute}.md`);
      if (!found && !link.wiki) found = byAlias.get(path.resolve(root, target));
      if (!found && link.wiki) {
        const candidates = (
          byName.get(
            path.basename(target).replace(/\.md$/i, "").toLowerCase(),
          ) || []
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
      if (
        found &&
        path.basename(found.file) !== "SKILL.md" &&
        found.aliases.some((p) => !ruleClient(p))
      ) {
        addContext(found);
        if (context.has(found.id)) queue.push(found);
        if (context.has(found.id) && found.id !== entry.id)
          edges.set(`${entry.id}:${found.id}`, {
            source: entry.id,
            target: found.id,
            kind: "reference",
          });
      }
    }
  }
  // Dashed hierarchy edges are distinct from explicit document references.
  const instructions = entries.filter(
    (e) => context.get(e.id)?.kind === "instruction",
  );
  for (const child of instructions) {
    const parents = instructions.filter(
      (p) =>
        p.id !== child.id &&
        p.scope === child.scope &&
        path.dirname(p.file) !== path.dirname(child.file) &&
        inside(path.dirname(p.file), child.file),
    );
    parents.sort((a, b) => b.file.length - a.file.length);
    if (parents[0])
      edges.set(`scope:${parents[0].id}:${child.id}`, {
        source: parents[0].id,
        target: child.id,
        kind: "scope",
      });
  }

  // Only explicit references carry discovery to other documents. Folder scope
  // describes where instructions apply; it does not import the child file.
  const references = new Map<string, string[]>();
  for (const edge of edges.values()) {
    if (edge.kind !== "reference") continue;
    if (!references.has(edge.source)) references.set(edge.source, []);
    required(references.get(edge.source)).push(edge.target);
  }
  const pending = [...context.values()].filter((node) => node.clients.length);
  for (let i = 0; i < pending.length; i++) {
    const source = required(pending[i]);
    for (const targetId of references.get(source.id) || []) {
      const target = required(context.get(targetId));
      const added = source.clients.filter(
        (client) => !target.clients.includes(client),
      );
      if (!added.length) continue;
      target.clients.push(...added);
      pending.push(target);
    }
  }

  return [...edges.values()];
}
