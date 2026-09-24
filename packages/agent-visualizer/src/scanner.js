import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { parse as yaml } from "yaml";
import { parse as toml } from "smol-toml";
import { parse as jsonc } from "jsonc-parser";

const SKIP = new Set([
  "node_modules",
  ".git",
  ".local",
  "dist",
  "build",
  "coverage",
  ".next",
  ".cache",
  ".angular",
  ".venv",
  "vendor",
  "target",
  "plugins",
  "sessions",
  "history",
]);
const AGENT_DIRS = [".agents", ".claude", ".codex", ".cursor"];
const INSTRUCTION =
  /^(AGENTS(?:\.override)?|CLAUDE(?:\.local)?|GEMINI)\.md$|^\.cursorrules$/i;
const MARKDOWN = /\.(md|mdc)$/i;
const ruleClient = (file) => {
  if (path.basename(file).toLowerCase() === ".cursorrules") return "cursor";
  if (!MARKDOWN.test(file)) return null;
  const normalized = slash(file).toLowerCase();
  if (/(^|\/)\.cursor\/rules\//.test(normalized)) return "cursor";
  if (/(^|\/)\.claude\/rules\//.test(normalized)) return "claude";
  return null;
};
const MAX_FILES = 20000;
const MAX_BYTES = 512 * 1024;
const lineCount = (text) =>
  text.length === 0
    ? 0
    : text.split(/\r\n|\r|\n/).length - Number(/(?:\r\n|\r|\n)$/.test(text));
const id = (value) =>
  createHash("sha256").update(value).digest("hex").slice(0, 16);
const slash = (value) => value.split(path.sep).join("/");
const inside = (base, file) => {
  const r = path.relative(base, file);
  return (
    r === "" ||
    (!r.startsWith(`..${path.sep}`) && r !== ".." && !path.isAbsolute(r))
  );
};
const truth = (value) =>
  value === true || /^(true|yes|on|1)$/i.test(String(value));
const falsehood = (value) =>
  value === false || /^(false|no|off|0)$/i.test(String(value));
const toolsForSkill = (p) => {
  const result = [];
  if (/(^|\/)\.(agents|cursor|claude|codex)\/skills\//.test(p))
    result.push("cursor");
  if (/(^|\/)\.claude\/skills\//.test(p)) result.push("claude");
  if (/(^|\/)\.(agents|codex)\/skills\//.test(p)) result.push("codex");
  return result;
};
const clientsForContextEntry = (alias, scope, root, codexHome) => {
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
function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const result = yaml(match[1], { maxAliasCount: 20 });
  return result && typeof result === "object" ? result : {};
}
function links(text) {
  const result = [];
  for (const m of text.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g))
    result.push({ target: m[1].split("#")[0], wiki: true });
  for (const m of text.matchAll(
    /\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^)]*)?\)/g,
  ))
    result.push({ target: m[1] || m[2], wiki: false });
  for (const m of text.matchAll(
    /(?:`|@)((?:\.{0,2}\/|~\/)?[\w.\-/À-ž]+\.(?:md|mdc))(?=`|\s|$|[,;)])/g,
  ))
    result.push({ target: m[1], wiki: false });
  return result;
}

/** Inventory only: never executes instructions, hooks, skills or MCP commands. */
export async function scanProject(
  project,
  {
    home = os.homedir(),
    includeUser = true,
    codexHome = process.env.CODEX_HOME || path.join(home, ".codex"),
  } = {},
) {
  const root = await fs.realpath(path.resolve(project));
  if (!(await fs.stat(root)).isDirectory())
    throw new Error("Choose a folder to scan.");
  const warnings = [];
  const files = new Map();
  const projectConfigs = new Set();
  const userBases = [
    path.join(home, ".agents"),
    path.join(home, ".claude"),
    path.join(home, ".cursor"),
    codexHome,
  ];
  const allowed = [root, ...(includeUser ? userBases : [])];
  let inspected = 0;
  let capped = false;
  async function collect(file, scope, ancestors = new Set(), depth = 0) {
    if (depth > 35 || inspected >= MAX_FILES) {
      capped = true;
      return;
    }
    try {
      const real = await fs.realpath(file);
      if (!allowed.some((base) => inside(base, real))) return;
      const stat = await fs.stat(real);
      if (stat.isDirectory()) {
        if (ancestors.has(real)) return;
        const next = new Set(ancestors).add(real);
        const entries = await fs.readdir(file, { withFileTypes: true });
        for (const entry of entries.sort((a, b) =>
          a.name.localeCompare(b.name),
        )) {
          if (
            SKIP.has(entry.name) ||
            (entry.name.startsWith(".") &&
              entry.isDirectory() &&
              !AGENT_DIRS.includes(entry.name) &&
              entry.name !== ".system" &&
              entry.name !== ".vscode")
          )
            continue;
          await collect(path.join(file, entry.name), scope, next, depth + 1);
        }
      } else if (stat.isFile()) {
        inspected++;
        if (
          scope === "project" &&
          /(?:^|[\\/])(?:\.mcp\.json|\.cursor[\\/]mcp\.json|\.codex[\\/]config\.toml|\.vscode[\\/]mcp\.json)$/.test(
            file,
          )
        )
          projectConfigs.add(file);
        if (!MARKDOWN.test(file) && !INSTRUCTION.test(path.basename(file)))
          return;
        if (stat.size > MAX_BYTES) {
          warnings.push(`Skipped large context file: ${display(file, scope)}`);
          return;
        }
        const key = `${scope}:${real}`;
        if (files.has(key)) {
          files.get(key).aliases.push(file);
          return;
        }
        files.set(key, {
          id: id(key),
          real,
          file,
          aliases: [file],
          scope,
          text: await fs.readFile(real, "utf8"),
        });
      }
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code))
        warnings.push(
          `Cannot read ${display(file, scope)} (${error.code || "invalid file"}).`,
        );
    }
  }
  function display(file, scope) {
    return scope === "user" && inside(home, file)
      ? `~/${slash(path.relative(home, file))}`
      : slash(path.relative(root, file)) || path.basename(root);
  }
  await collect(root, "project");
  if (includeUser) {
    for (const base of userBases) {
      for (const child of ["skills", "knowledge", "rules"])
        await collect(path.join(base, child), "user");
    }
    for (const file of [
      path.join(home, ".claude", "CLAUDE.md"),
      path.join(codexHome, "AGENTS.md"),
      path.join(codexHome, "AGENTS.override.md"),
      path.join(home, ".cursor", "AGENTS.md"),
    ])
      await collect(file, "user");
  }
  if (capped)
    warnings.push(
      `Scan stopped at ${MAX_FILES} files or 35 folder levels. Some assets may be missing.`,
    );
  const entries = [...files.values()];
  const byAlias = new Map();
  const byName = new Map();
  for (const entry of entries) {
    for (const alias of entry.aliases) byAlias.set(alias, entry);
    const name = path
      .basename(entry.file)
      .replace(/\.(md|mdc)$/i, "")
      .toLowerCase();
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(entry);
  }
  const context = new Map();
  const rules = new Map();
  const edges = new Map();
  const skills = new Map();
  const content = new Map();
  const editable = new Map();
  function addContext(entry) {
    if (context.has(entry.id)) return;
    const aliases = entry.aliases.filter((p) => !ruleClient(p));
    if (!aliases.length) return;
    const paths = aliases.map((p) => display(p, entry.scope));
    const kind = aliases.some((p) => INSTRUCTION.test(path.basename(p)))
      ? "instruction"
      : aliases.some((p) => /[\\/]rules[\\/]|\.mdc$/.test(p))
        ? "rule"
        : "knowledge";
    context.set(entry.id, {
      id: entry.id,
      name: path.basename(aliases[0]),
      path: paths[0],
      aliases: paths,
      clients: [
        ...new Set(
          aliases.flatMap((alias) =>
            clientsForContextEntry(alias, entry.scope, root, codexHome),
          ),
        ),
      ],
      editTargets: [{ id: entry.id, path: paths[0] }],
      scope: entry.scope,
      kind,
      bytes: Buffer.byteLength(entry.text),
      lines: lineCount(entry.text),
      excerpt: entry.text.slice(0, 180),
    });
    content.set(entry.id, entry.text);
    editable.set(entry.id, { file: entry.file, real: entry.real });
  }
  for (const entry of entries) {
    if (path.basename(entry.file) === "SKILL.md") {
      let meta = {};
      try {
        meta = frontmatter(entry.text);
      } catch {
        warnings.push(
          `Invalid skill frontmatter: ${display(entry.file, entry.scope)}`,
        );
      }
      const name =
        typeof meta.name === "string"
          ? meta.name
          : path.basename(path.dirname(entry.file));
      const key = `${entry.scope}:${name}:${id(entry.text)}`;
      if (!skills.has(key))
        skills.set(key, {
          id: id(key),
          name,
          description:
            typeof meta.description === "string" ? meta.description : "",
          scope: entry.scope,
          paths: [],
          editTargets: [],
          clients: [],
          invocation: {},
          legacy: false,
        });
      const skill = skills.get(key);
      content.set(skill.id, entry.text);
      editable.set(entry.id, { file: entry.file, real: entry.real });
      skill.editTargets.push({
        id: entry.id,
        path: display(entry.file, entry.scope),
      });
      let policy = {};
      try {
        policy =
          yaml(
            await fs.readFile(
              path.join(path.dirname(entry.real), "agents/openai.yaml"),
              "utf8",
            ),
          )?.policy || {};
      } catch {
        /* Optional metadata. */
      }
      for (const alias of entry.aliases) {
        const p = display(alias, entry.scope);
        skill.paths.push(p);
        if (p.includes(".codex/skills/")) skill.legacy = true;
        const discovered = toolsForSkill(slash(alias));
        if (
          entry.scope === "user" &&
          inside(path.join(codexHome, "skills"), alias) &&
          !discovered.includes("codex")
        )
          discovered.push("codex");
        for (const client of discovered) {
          if (!skill.clients.includes(client)) skill.clients.push(client);
          const invocation =
            client === "codex"
              ? falsehood(policy.allow_implicit_invocation)
                ? "User only"
                : "Model + user"
              : truth(meta["disable-model-invocation"])
                ? falsehood(meta["user-invocable"])
                  ? "Disabled"
                  : "User only"
                : falsehood(meta["user-invocable"]) && client === "claude"
                  ? "Model only"
                  : "Model + user";
          skill.invocation[client] = [
            ...new Set([
              ...(skill.invocation[client]?.split(" / ") || []),
              invocation,
            ]),
          ].join(" / ");
        }
      }
      skill.mode =
        [...new Set(Object.values(skill.invocation))].join(" / ") ||
        "Not discovered";
    } else {
      const ruleAliases = entry.aliases.filter((p) => ruleClient(p));
      if (ruleAliases.length) {
        let meta = {};
        try {
          meta = frontmatter(entry.text);
        } catch {
          warnings.push(
            `Invalid rule frontmatter: ${display(entry.file, entry.scope)}`,
          );
        }
        const patterns = (value) =>
          (Array.isArray(value)
            ? value
            : typeof value === "string"
              ? [value]
              : []
          )
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
        rules.set(entry.id, {
          id: entry.id,
          name: path.basename(ruleAliases[0]),
          description:
            typeof meta.description === "string" ? meta.description : "",
          scope: entry.scope,
          paths: ruleAliases.map((p) => display(p, entry.scope)),
          clients: [...new Set(ruleAliases.map(ruleClient))],
          legacy: ruleAliases.some(
            (p) => path.basename(p).toLowerCase() === ".cursorrules",
          ),
          globs: patterns(meta.globs),
          pathsCondition: patterns(meta.paths),
          alwaysApply: meta.alwaysApply === true,
        });
        content.set(entry.id, entry.text);
      }
      if (
        !entry.aliases.every((p) => /[\\/]skills[\\/]/.test(p)) &&
        entry.aliases.some(
          (p) =>
            !ruleClient(p) &&
            (INSTRUCTION.test(path.basename(p)) ||
              /[\\/]\.(agents|claude|cursor|codex)[\\/](knowledge|rules)[\\/]/.test(
                p,
              )),
        )
      )
        addContext(entry);
    }
  }
  // Follow references from context roots, never turn the entire codebase into a graph.
  const queue = entries.filter((entry) => context.has(entry.id));
  const visited = new Set();
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (visited.has(entry.id)) continue;
    visited.add(entry.id);
    for (const link of links(entry.text)) {
      let target;
      try {
        target = decodeURIComponent(link.target.split("#")[0]);
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
  const references = new Map();
  for (const edge of edges.values()) {
    if (edge.kind !== "reference") continue;
    if (!references.has(edge.source)) references.set(edge.source, []);
    references.get(edge.source).push(edge.target);
  }
  const pending = [...context.values()].filter((node) => node.clients.length);
  for (let i = 0; i < pending.length; i++) {
    const source = pending[i];
    for (const targetId of references.get(source.id) || []) {
      const target = context.get(targetId);
      const added = source.clients.filter(
        (client) => !target.clients.includes(client),
      );
      if (!added.length) continue;
      target.clients.push(...added);
      pending.push(target);
    }
  }

  const mcp = [];
  async function readConfig(file, format = "json") {
    try {
      const real = await fs.realpath(file);
      if (
        ![...allowed, path.join(home, ".claude.json")].some((base) =>
          inside(base, real),
        )
      )
        return null;
      if ((await fs.stat(real)).size > 2 * 1024 * 1024) {
        warnings.push(`Skipped oversized config: ${path.basename(file)}`);
        return null;
      }
      const text = await fs.readFile(real, "utf8");
      if (format === "toml") return toml(text);
      const errors = [];
      const result = jsonc(text, errors, { allowTrailingComma: true });
      if (errors.length) throw new Error("Invalid JSON");
      return result;
    } catch (error) {
      if (!["ENOENT", "ENOTDIR"].includes(error.code))
        warnings.push(
          `Could not parse ${display(file, inside(root, file) ? "project" : "user")}.`,
        );
      return null;
    }
  }
  function addServers(servers, file, scope, client, origin) {
    if (!servers || typeof servers !== "object" || Array.isArray(servers))
      return;
    for (const [name, config] of Object.entries(servers)) {
      if (!config || typeof config !== "object") continue;
      const disabled = config.enabled === false || config.disabled === true;
      // Whitelist public fields. Never expose arguments, env, headers, URLs or credentials.
      mcp.push({
        id: id(`${file}:${scope}:${client}:${name}:${origin || ""}`),
        name,
        scope,
        path: display(file, inside(root, file) ? "project" : "user"),
        clients: client ? [client] : [],
        transport: config.url
          ? config.type === "sse"
            ? "SSE"
            : "HTTP"
          : config.command
            ? "stdio"
            : "Unknown",
        status: disabled ? "Disabled" : "Not verified",
        configured: !disabled,
        origin: origin || "File configuration",
      });
    }
  }
  for (const [base, scope] of [
    [root, "project"],
    ...(includeUser ? [[home, "user"]] : []),
  ]) {
    for (const [rel, client, format] of [
      [".cursor/mcp.json", "cursor", "json"],
      [".mcp.json", "claude", "json"],
      [".codex/config.toml", "codex", "toml"],
      [".vscode/mcp.json", null, "json"],
    ]) {
      if (
        scope === "user" &&
        (rel === ".mcp.json" || rel.startsWith(".vscode"))
      )
        continue;
      const file =
        scope === "user" && client === "codex"
          ? path.join(codexHome, "config.toml")
          : path.join(base, rel);
      const config = await readConfig(file, format);
      addServers(
        config?.mcpServers || config?.mcp_servers || config?.servers,
        file,
        scope,
        client,
        client
          ? undefined
          : "VS Code configuration; not installed for these clients",
      );
    }
  }
  for (const file of projectConfigs) {
    const relative = slash(path.relative(root, file));
    if (
      [
        ".mcp.json",
        ".cursor/mcp.json",
        ".codex/config.toml",
        ".vscode/mcp.json",
      ].includes(relative)
    )
      continue;
    const client = relative.endsWith(".cursor/mcp.json")
      ? "cursor"
      : relative.endsWith(".codex/config.toml")
        ? "codex"
        : relative.endsWith(".vscode/mcp.json")
          ? null
          : "claude";
    const config = await readConfig(file, client === "codex" ? "toml" : "json");
    addServers(
      config?.mcpServers || config?.mcp_servers || config?.servers,
      file,
      "project",
      client,
      "Nested project configuration",
    );
  }
  if (includeUser) {
    const file = path.join(home, ".claude.json");
    const config = await readConfig(file);
    addServers(config?.mcpServers, file, "user", "claude");
    addServers(
      config?.projects?.[root]?.mcpServers,
      file,
      "project",
      "claude",
      "Project-local configuration in user settings",
    );
  }
  const data = {
    project: { name: path.basename(root), path: root },
    scannedAt: new Date().toISOString(),
    nodes: [...context.values()],
    rules: [...rules.values()].sort((a, b) => a.name.localeCompare(b.name)),
    edges: [...edges.values()],
    skills: [...skills.values()].sort((a, b) => a.name.localeCompare(b.name)),
    mcp: mcp.sort((a, b) => a.name.localeCompare(b.name)),
    warnings: [...new Set(warnings)],
    limits: { includeUser, scannedFiles: inspected, truncated: capped },
  };
  return { data, content, editable };
}
