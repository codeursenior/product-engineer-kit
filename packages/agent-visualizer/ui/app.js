import {
  select,
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  zoom,
  zoomIdentity,
  drag,
} from "d3";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const token =
  new URLSearchParams(location.hash.slice(1)).get("token") ||
  sessionStorage.getItem("boyscout-token");
if (token) sessionStorage.setItem("boyscout-token", token);
history.replaceState(null, "", location.pathname);
const state = {
  data: null,
  tab: "context",
  scope: "all",
  client: "all",
  search: "",
  view: "graph",
};
const themeKey = "boyscout-theme";
const savedTheme = localStorage.getItem(themeKey);
document.documentElement.dataset.theme =
  savedTheme === "dark" ? "dark" : "light";
function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === "dark";
  $("#theme-toggle").textContent = dark ? "☀" : "☾";
  $("#theme-toggle").setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode",
  );
  $("#theme-toggle").title = dark ? "Light mode" : "Dark mode";
  $("#theme-toggle").setAttribute("aria-pressed", String(dark));
}
let simulation;
let detailRequest = 0;
let lastFocus;
const labels = { cursor: "Cursor", claude: "Claude Code", codex: "Codex" };
const icons = {
  cursor: "/client-logos/cursor.png",
  claude: "/client-logos/claude.png",
  codex: "/client-logos/chatgpt.webp",
};
function clientIcon(client, active, title = "") {
  const text = `${labels[client]}: ${active ? "discovered" : "not discovered"}${title ? ` · ${title}` : ""}`;
  return `<span class="client-icon client-icon--${client} ${active ? "" : "off"}" role="img" aria-label="${escape(text)}" title="${escape(text)}"><img src="${icons[client]}" alt="" aria-hidden="true"></span>`;
}
const clients = (row) =>
  `<div class="client-icons">${Object.keys(labels)
    .map((client) =>
      clientIcon(
        client,
        row.clients.includes(client),
        row.invocation?.[client],
      ),
    )
    .join("")}</div>`;
const scopeBadge = (scope) =>
  `<span class="badge ${scope}"><i class="dot ${scope}"></i>${scope === "user" ? "User" : "Project"}</span>`;
async function api(route, options = {}) {
  const response = await fetch(route, {
    ...options,
    headers: {
      Authorization: `Bearer ${token || ""}`,
      ...options.headers,
    },
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error || "Unable to read the workspace.");
  return body;
}
async function load(refresh = false) {
  $("#refresh").disabled = true;
  try {
    state.data = await api(`/api/scan${refresh ? "?refresh=1" : ""}`);
    $("#project-name").textContent = state.data.project.name;
    $("#project-path").textContent = state.data.project.path;
    $("#project-path").title = state.data.project.path;
    document.title = `${state.data.project.name} · Agent Visualizer`;
    $("#count-context").textContent = state.data.nodes.length;
    $("#count-rules").textContent = state.data.rules.length;
    $("#count-skills").textContent = state.data.skills.length;
    $("#count-mcp").textContent = state.data.mcp.length;
    $("#updated").textContent =
      `Scanned ${new Date(state.data.scannedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    $("#notice").hidden = !state.data.warnings.length;
    $("#notice").textContent = state.data.warnings.join(" ");
    render();
  } catch (error) {
    $("#canvas").className = "";
    $("#canvas").innerHTML =
      `<div class="empty"><span class="empty-mark">⌁</span><strong>Couldn’t load this workspace</strong><p>${escape(error.message)}</p></div>`;
    $("#summary").textContent = "Session unavailable";
  } finally {
    $("#refresh").disabled = false;
  }
}
function filtered(rows) {
  return rows.filter(
    (row) =>
      (state.scope === "all" || row.scope === state.scope) &&
      (state.client === "all" ||
        !row.clients ||
        row.clients.includes(state.client)) &&
      (!state.search ||
        `${row.name} ${row.path || ""} ${(row.paths || []).join(" ")} ${row.description || ""} ${(row.globs || []).join(" ")} ${(row.pathsCondition || []).join(" ")}`
          .toLowerCase()
          .includes(state.search.toLowerCase())),
  );
}
function render() {
  if (!state.data) return;
  simulation?.stop();
  const titles = {
    context: [
      "THE BIG PICTURE",
      "Your agent’s context.",
      "Follow the connections. Find the source of every instruction.",
    ],
    rules: [
      "SCOPED INSTRUCTIONS",
      "Your agent’s rules.",
      "Browse dedicated Cursor and Claude Code rule files.",
    ],
    skills: [
      "WHAT YOUR AGENT CAN DO",
      "A skill for every task.",
      "Explore reusable workflows and the clients that discover them.",
    ],
    mcp: [
      "CONNECTED CAPABILITIES",
      "Tools beyond the code.",
      "See configured MCP servers, their scope, and their client setup.",
    ],
  };
  const title = titles[state.tab];
  $("#page-eyebrow").textContent = title[0];
  $("#page-title").textContent = title[1];
  $("#page-description").textContent = title[2];
  $("#view-switch").hidden = state.tab !== "context";
  $("#client-filter").hidden = state.tab === "context";
  $("#search").placeholder =
    state.tab === "context"
      ? "Find a file…"
      : state.tab === "rules"
        ? "Find a rule…"
        : state.tab === "skills"
          ? "Find a skill…"
          : "Find a server…";
  $$(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.tab);
    button.setAttribute(
      "aria-current",
      button.dataset.tab === state.tab ? "page" : "false",
    );
  });
  $$("[data-scope]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.scope === state.scope);
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.scope === state.scope),
    );
  });
  $("#graph-view").classList.toggle("selected", state.view === "graph");
  $("#list-view").classList.toggle("selected", state.view === "list");
  const rows = filtered(
    state.tab === "context" ? state.data.nodes : state.data[state.tab],
  );
  const projectCount = rows.filter((row) => row.scope === "project").length;
  $("#summary").textContent =
    `${rows.length} ${state.tab === "context" ? "files" : state.tab === "mcp" ? "servers" : state.tab === "rules" ? "rules" : "skills"} · ${projectCount} project · ${rows.length - projectCount} user`;
  const canvas = $("#canvas");
  canvas.className = "";
  canvas.setAttribute(
    "aria-label",
    state.tab === "context"
      ? "Context graph"
      : `${state.tab === "mcp" ? "MCP servers" : state.tab === "rules" ? "Rules" : "Skills"} list`,
  );
  canvas.replaceChildren();
  if (!rows.length) {
    const filteredOut =
      state.search || state.scope !== "all" || state.client !== "all";
    canvas.innerHTML = `<div class="empty"><span class="empty-mark">✳</span><strong>${filteredOut ? "No matching assets" : "A blank canvas, for now"}</strong><p>${filteredOut ? "Try another scope, client, or search." : state.tab === "context" ? "Context appears here when your folder contains AGENTS.md, CLAUDE.md, or linked knowledge files." : state.tab === "rules" ? "Add .cursor/rules, .claude/rules, or a legacy .cursorrules file to see rules here. Codex instructions stay in Context." : state.tab === "skills" ? "Add a SKILL.md in an agent skills folder to see it here." : "No MCP servers found in the supported configuration files."}</p></div>`;
    return;
  }
  if (state.tab === "context" && state.view === "graph") renderGraph(rows);
  else renderTable(rows);
}
function renderGraph(rows) {
  const canvas = $("#canvas");
  canvas.className = "graph-canvas";
  canvas.innerHTML =
    '<div class="graph-key"><span><i class="dot project"></i>Project context</span><span><i class="dot user"></i>User context</span><span><i class="key-line"></i>Reference</span><span><i class="key-line dashed"></i>Folder scope</span></div><div class="graph-controls"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button><button id="fit" aria-label="Fit graph">Fit</button></div><div class="graph-hint">Scroll to zoom · Drag to explore · Click a file</div>';
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const root =
    rows.find(
      (n) =>
        n.scope === "project" &&
        n.aliases.some((p) => /^AGENTS(?:\.override)?\.md$/i.test(p)),
    ) || rows.find((n) => n.scope === "project" && n.kind === "instruction");
  const nodes = rows.map((row, i) => ({
    ...row,
    radius:
      row.id === root?.id
        ? 30
        : row.kind === "instruction"
          ? 18
          : row.kind === "rule"
            ? 11
            : 8,
    x: width / 2 + Math.cos(i * 2.39996) * 90,
    y: height / 2 + Math.sin(i * 2.39996) * 90,
  }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = state.data.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e }));
  const svg = select(canvas)
    .append("svg")
    .attr("class", "graph")
    .attr("role", "img")
    .attr(
      "aria-label",
      `Context graph with ${nodes.length} files. Use the Files view for a table.`,
    );
  const group = svg.append("g");
  const edge = group
    .append("g")
    .selectAll("line")
    .data(edges)
    .join("line")
    .attr("stroke", (e) => (e.kind === "scope" ? "#b6c3ac" : "#c6d3bc"))
    .attr("stroke-width", 1)
    .attr("stroke-dasharray", (e) => (e.kind === "scope" ? "4 5" : null));
  const node = group
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr(
      "class",
      (n) =>
        `graph-node ${n.scope} ${n.kind} ${n.id === root?.id ? "root" : ""}`,
    )
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", (n) => `${n.name}, ${n.scope}, ${n.path}`)
    .on("click", (_, n) => showDetail(n))
    .on("keydown", (event, n) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        showDetail(n);
      }
    });
  node
    .append("circle")
    .attr("r", (n) => n.radius)
    .attr("fill", (n) =>
      n.id === root?.id
        ? "#d6e6c7"
        : n.scope === "user"
          ? "#eee6f6"
          : n.kind === "instruction"
            ? "#e3edda"
            : "#eaf0e1",
    )
    .attr("stroke", (n) => (n.scope === "user" ? "#b7a1c9" : "#a9c08e"));
  node
    .filter((n) => n.kind === "instruction")
    .append("text")
    .attr("class", "node-icon")
    .attr("dy", 5)
    .text((n) => (n.id === root?.id ? "✳" : "◇"));
  node
    .append("text")
    .attr("class", (n) => `node-label ${n.id === root?.id ? "root-label" : ""}`)
    .attr("y", (n) => n.radius + 17)
    .text((n) => (n.name.length > 30 ? n.name.slice(0, 27) + "…" : n.name));
  node.append("title").text((n) => n.path);
  const zoomer = zoom()
    .scaleExtent([0.06, 4])
    .on("zoom", (event) => group.attr("transform", event.transform));
  svg.call(zoomer).on("dblclick.zoom", null);
  function fit() {
    const box = group.node().getBBox();
    const scale = Math.min(
      1.4,
      (width - 100) / Math.max(box.width, 1),
      (height - 105) / Math.max(box.height, 1),
    );
    svg.call(
      zoomer.transform,
      zoomIdentity
        .translate(
          width / 2 - (box.x + box.width / 2) * scale,
          height / 2 - (box.y + box.height / 2) * scale,
        )
        .scale(scale),
    );
  }
  $("#zoom-in").onclick = () => svg.call(zoomer.scaleBy, 1.3);
  $("#zoom-out").onclick = () => svg.call(zoomer.scaleBy, 1 / 1.3);
  $("#fit").onclick = fit;
  simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink(edges)
        .id((n) => n.id)
        .distance((e) =>
          e.source.id === root?.id || e.target.id === root?.id ? 140 : 95,
        )
        .strength(0.35),
    )
    .force("charge", forceManyBody().strength(-150))
    .force(
      "collide",
      forceCollide().radius((n) => n.radius + 35),
    )
    .force(
      "x",
      forceX((n) =>
        n.scope === "user" ? width * 0.77 : width * 0.43,
      ).strength(0.035),
    )
    .force("y", forceY(height / 2).strength(0.055))
    .stop();
  if (root) {
    const main = nodes.find((n) => n.id === root.id);
    main.fx = width * 0.45;
    main.fy = height / 2;
  }
  const tick = () => {
    edge
      .attr("x1", (e) => e.source.x)
      .attr("y1", (e) => e.source.y)
      .attr("x2", (e) => e.target.x)
      .attr("y2", (e) => e.target.y);
    node.attr("transform", (n) => `translate(${n.x},${n.y})`);
  };
  simulation.tick(Math.min(180, nodes.length > 700 ? 60 : 180));
  tick();
  fit();
  simulation.on("tick", tick);
  node.call(
    drag()
      .on("start", (event, n) => {
        if (!event.active) simulation.alphaTarget(0.2).restart();
        n.fx = n.x;
        n.fy = n.y;
      })
      .on("drag", (event, n) => {
        n.fx = event.x;
        n.fy = event.y;
      })
      .on("end", (event, n) => {
        if (!event.active) simulation.alphaTarget(0);
        n.fx = null;
        n.fy = null;
      }),
  );
}
function renderTable(rows) {
  const headers =
    state.tab === "rules"
      ? ["Rule", "Conditions", "Scope", "Clients"]
      : state.tab === "skills"
        ? ["Skill", "Invocation", "Scope", "Clients"]
        : state.tab === "mcp"
          ? ["Server", "Connection", "Transport", "Scope", "Clients"]
          : ["File", "Type", "Lines", "Scope"];
  const help =
    state.tab === "rules"
      ? "Dedicated Cursor and Claude Code files only. File metadata describes conditions; it does not prove a rule loaded in a session. Codex AGENTS.md remains in Context."
      : state.tab === "skills"
        ? "Client icons: Cursor · Claude Code · Codex. Active means a discovery path was found, not a running session. Hover for invocation details. Identical copies are grouped."
        : state.tab === "mcp"
          ? "Client icons: Cursor · Claude Code · Codex. Configuration does not prove a live connection. The viewer never launches a server or sends credentials."
          : "Only context entry points, agent knowledge folders, and their linked documents appear here.";
  $("#canvas").innerHTML =
    `<div class="table-wrap"><div class="table-help">${help}</div><table><thead><tr>${headers.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${rows
      .map((row) => {
        const name = `<td class="name"><button data-detail="${escape(row.id)}">${escape(row.name)}</button><p title="${escape(row.path || row.paths?.join("\n"))}">${escape(row.description || row.path || row.paths?.[0])}</p></td>`;
        const conditions = row.legacy
          ? "Legacy .cursorrules"
          : [
              row.alwaysApply ? "Cursor alwaysApply" : "",
              row.globs?.length ? `Cursor globs: ${row.globs.join(", ")}` : "",
              row.pathsCondition?.length
                ? `Claude paths: ${row.pathsCondition.join(", ")}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || "No path condition";
        return `<tr>${name}${state.tab === "rules" ? `<td>${escape(conditions)}</td><td>${scopeBadge(row.scope)}</td><td>${clients(row)}</td>` : state.tab === "skills" ? `<td><span class="badge neutral">${escape(row.mode)}</span></td><td>${scopeBadge(row.scope)}</td><td>${clients(row)}</td>` : state.tab === "mcp" ? `<td><span class="badge ${row.status === "Disabled" ? "neutral" : "warn"}">○ ${escape(row.status)}</span></td><td>${escape(row.transport)}</td><td>${scopeBadge(row.scope)}</td><td>${clients(row)}</td>` : `<td>${escape(row.kind)}</td><td class="line-count">${Number(row.lines).toLocaleString()}</td><td>${scopeBadge(row.scope)}</td>`}</tr>`;
      })
      .join("")}</tbody></table></div>`;
  $$("[data-detail]").forEach((button) => {
    button.onclick = () =>
      showDetail(rows.find((row) => row.id === button.dataset.detail));
  });
}
async function showDetail(row) {
  const request = ++detailRequest;
  lastFocus = document.activeElement;
  $("#detail").hidden = false;
  $("#close-detail").focus();
  const paths = row.paths || row.aliases || [row.path];
  $("#detail-body").innerHTML =
    `${scopeBadge(row.scope)}<h2>${escape(row.name)}</h2><p>${escape(row.description || (row.kind ? `${row.kind} · ${row.bytes.toLocaleString()} bytes` : "MCP server configuration"))}</p><h3>Source ${paths.length > 1 ? "paths" : "path"}</h3>${paths.map((p) => `<p class="mono source-path">${escape(p)}</p>`).join("")}${
      row.clients
        ? `<h3>Client discovery</h3>${Object.keys(labels)
            .map(
              (client) =>
                `<div class="client-line">${clientIcon(client, row.clients.includes(client))}${labels[client]} · ${escape(row.invocation?.[client] || (row.clients.includes(client) ? "Configured" : "Not discovered"))}</div>`,
            )
            .join("")}`
        : ""
    }${row.legacy && state.tab === "skills" ? "<p>Includes a legacy .codex/skills discovery path. Client behavior can depend on its installed version.</p>" : ""}${state.tab === "rules" ? `<h3>Declared conditions</h3><p>${escape(row.legacy ? "Legacy .cursorrules" : [row.alwaysApply ? "Cursor alwaysApply: true" : "", row.globs?.length ? `Cursor globs: ${row.globs.join(", ")}` : "", row.pathsCondition?.length ? `Claude paths: ${row.pathsCondition.join(", ")}` : ""].filter(Boolean).join(" · ") || "No path condition declared")}</p><p>File discovery does not confirm whether this rule loaded in an agent session.</p>` : ""}`;
  if (state.tab === "mcp") {
    $("#detail-body").insertAdjacentHTML(
      "beforeend",
      `<h3>Connection status</h3><p>${escape(row.status)}. ${row.status === "Disabled" ? "Disabled in this file." : "Check the client’s MCP panel to confirm its live connection."}</p><p>${escape(row.origin)}</p><p>Commands, arguments, server URLs, headers, and credentials are intentionally omitted.</p>`,
    );
    return;
  }
  const heading = document.createElement("h3");
  heading.textContent = "File preview";
  const preview = document.createElement("pre");
  preview.textContent = "Loading…";
  $("#detail-body").append(heading, preview);
  if (row.editTargets?.length) {
    const targets = row.editTargets;
    const targetSelect = document.createElement("select");
    if (targets.length > 1) {
      const label = document.createElement("label");
      label.className = "edit-source";
      label.textContent = "File to edit";
      for (const target of targets) {
        const option = document.createElement("option");
        option.value = target.id;
        option.textContent = target.path;
        targetSelect.append(option);
      }
      label.append(targetSelect);
      $("#detail-body").append(label);
    }
    const editButton = document.createElement("button");
    editButton.className = "edit-button";
    editButton.textContent = "Edit file";
    editButton.disabled = true;
    const form = document.createElement("form");
    form.className = "edit-form";
    form.hidden = true;
    const textarea = document.createElement("textarea");
    textarea.setAttribute("aria-label", `Edit ${row.name}`);
    textarea.spellcheck = false;
    const actions = document.createElement("div");
    actions.className = "edit-actions";
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.textContent = "Save";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.textContent = "Cancel";
    actions.append(saveButton, cancelButton);
    form.append(textarea, actions);
    const status = document.createElement("p");
    status.className = "edit-status";
    status.setAttribute("role", "status");
    $("#detail-body").append(editButton, form, status);
    let file;
    let targetRequest = 0;
    async function loadTarget() {
      const current = ++targetRequest;
      preview.textContent = "Loading…";
      editButton.disabled = true;
      status.textContent = "";
      try {
        const result = await api(
          `/api/file?id=${encodeURIComponent(targetSelect.value || targets[0].id)}`,
        );
        if (request !== detailRequest || current !== targetRequest) return;
        file = result;
        preview.textContent = result.text;
        editButton.disabled = false;
      } catch (error) {
        if (request === detailRequest && current === targetRequest)
          preview.textContent = error.message;
      }
    }
    targetSelect.onchange = loadTarget;
    editButton.onclick = () => {
      textarea.value = file.text;
      preview.hidden = true;
      editButton.hidden = true;
      form.hidden = false;
      targetSelect.disabled = true;
      status.textContent = "";
      textarea.focus();
    };
    cancelButton.onclick = () => {
      form.hidden = true;
      preview.hidden = false;
      editButton.hidden = false;
      targetSelect.disabled = false;
      editButton.focus();
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      saveButton.disabled = true;
      cancelButton.disabled = true;
      status.textContent = "Saving…";
      try {
        const result = await api(
          `/api/file?id=${encodeURIComponent(targetSelect.value || targets[0].id)}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: textarea.value,
              revision: file.revision,
            }),
          },
        );
        if (request !== detailRequest) return;
        file = { text: textarea.value, revision: result.revision };
        preview.textContent = file.text;
        form.hidden = true;
        preview.hidden = false;
        editButton.hidden = false;
        targetSelect.disabled = false;
        status.textContent = "Saved. Workspace rescanned.";
        await load(true);
      } catch (error) {
        if (request === detailRequest) status.textContent = error.message;
      } finally {
        saveButton.disabled = false;
        cancelButton.disabled = false;
      }
    };
    await loadTarget();
    return;
  }
  try {
    const result = await api(`/api/content?id=${encodeURIComponent(row.id)}`);
    if (request === detailRequest) preview.textContent = result.text;
  } catch (error) {
    if (request === detailRequest) preview.textContent = error.message;
  }
}
function closeDetail() {
  detailRequest++;
  $("#detail").hidden = true;
  if (lastFocus?.isConnected) lastFocus.focus();
}
$$("[data-tab]").forEach((button) => {
  button.onclick = () => {
    state.tab = button.dataset.tab;
    state.client = "all";
    $("#client-filter").value = "all";
    state.search = "";
    $("#search").value = "";
    closeDetail();
    render();
  };
});
$$("[data-scope]").forEach((button) => {
  button.onclick = () => {
    state.scope = button.dataset.scope;
    render();
  };
});
$("#client-filter").onchange = (event) => {
  state.client = event.target.value;
  render();
};
let searchTimeout;
$("#search").oninput = (event) => {
  state.search = event.target.value;
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(render, 130);
};
$("#graph-view").onclick = () => {
  state.view = "graph";
  render();
};
$("#list-view").onclick = () => {
  state.view = "list";
  render();
};
$("#refresh").onclick = () => {
  closeDetail();
  load(true);
};
$("#theme-toggle").onclick = () => {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem(themeKey, next);
  updateThemeButton();
};
updateThemeButton();
$("#close-detail").onclick = closeDetail;
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDetail();
  if (
    event.key === "/" &&
    !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    $("#search").focus();
  }
});
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (state.tab === "context" && state.view === "graph") render();
  }, 150);
});
load();
