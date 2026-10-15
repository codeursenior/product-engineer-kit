import path from "node:path";
import type { Skill, SkillEdge } from "../contracts.js";
import { links } from "./metadata.js";
import { referenceResolver } from "./references.js";
import type { FileEntry, ScanEnvironment } from "./types.js";

/** Explicit references only. A mention in prose is not a dependency. */
export function skillGraph(
  entries: FileEntry[],
  skills: Skill[],
  env: ScanEnvironment,
): SkillEdge[] {
  const files = entries.filter(
    (entry) => path.basename(entry.file) === "SKILL.md",
  );
  const byFile = new Map(
    skills.flatMap((skill) =>
      skill.editTargets.map((target) => [target.id, skill] as const),
    ),
  );
  const resolve = referenceResolver(files, env);
  const edges = new Map<string, SkillEdge>();
  for (const entry of files) {
    const source = byFile.get(entry.id);
    if (!source) continue;
    const add = (target: Skill | undefined) => {
      if (target && target.id !== source.id)
        edges.set(`${source.id}:${target.id}`, {
          source: source.id,
          target: target.id,
        });
    };
    const references = links(entry.text);
    // Also accept unquoted paths, including absolute paths; resolve only indexed skills.
    for (const match of entry.text.matchAll(
      /(?:^|[\s`(<])((?:~\/|\.{0,2}\/)?[\w.\-/À-ž]+\/SKILL\.md)(?=$|[\s`)>.,;#])/gm,
    ))
      references.push({ target: match[1] ?? "", wiki: false });
    for (const reference of references) {
      const target = resolve(entry, reference);
      if (target) add(byFile.get(target.id));
    }
    const body = entry.text.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    for (const match of body.matchAll(
      /(?:^|[\s`(])(?:\/|\$)([a-zA-Z0-9][\w:-]*)(?=$|[\s`.,;!?)\]])/gm,
    )) {
      const candidates = skills.filter((skill) => skill.name === match[1]);
      // Names shared by different skills are ambiguous; paths remain resolvable.
      if (candidates.length === 1) add(candidates[0]);
    }
  }
  return [...edges.values()];
}
