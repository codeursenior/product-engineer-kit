import {
  drag,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  select,
  zoom,
  zoomIdentity,
} from "d3";

import type { SimulationLinkDatum, SimulationNodeDatum } from "d3";
import type { ContextNode, GraphEdge } from "../src/contracts";
import { labels } from "./models";
interface GraphNode extends ContextNode, SimulationNodeDatum {
  radius: number;
}
interface GraphLink extends SimulationLinkDatum<GraphNode> {
  kind: GraphEdge["kind"];
  source: string | GraphNode;
  target: string | GraphNode;
}
export interface GraphHandle {
  fit(): void;
  zoomIn(): void;
  zoomOut(): void;
  destroy(): void;
}
function endpoint(node: string | GraphNode): GraphNode {
  if (typeof node === "string")
    throw new Error("Graph link has not been initialized");
  return node;
}
export function renderGraph(
  canvas: HTMLElement,
  rows: ContextNode[],
  sourceEdges: GraphEdge[],
  onSelect: (row: ContextNode) => void,
): GraphHandle {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const root =
    rows.find(
      (n) =>
        n.scope === "project" &&
        n.aliases.some((p) => /^AGENTS(?:\.override)?\.md$/i.test(p)),
    ) || rows.find((n) => n.scope === "project" && n.kind === "instruction");
  const nodes: GraphNode[] = rows.map((row, i) => ({
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
  const edges: GraphLink[] = sourceEdges
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
    .selectAll<SVGGElement, GraphNode>("g")
    .data(nodes)
    .join("g")
    .attr(
      "class",
      (n) =>
        `graph-node ${n.scope} ${n.kind} ${n.id === root?.id ? "root" : ""}`,
    )
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      (n) =>
        `${n.name}, ${n.scope}, ${n.path}, ${n.clients.map((client) => labels[client]).join(", ") || "no client entry point"}`,
    )
    .on("click", (_, n) => onSelect(n))
    .on("keydown", (event, n) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onSelect(n);
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
  node
    .append("title")
    .text(
      (n) =>
        `${n.path}\n${n.clients.map((client) => labels[client]).join(", ") || "No client entry point"}`,
    );
  const zoomer = zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.06, 4])
    .on("zoom", (event) => group.attr("transform", event.transform));
  svg.call(zoomer).on("dblclick.zoom", null);
  function fit() {
    const box = group.node()?.getBBox();
    if (!box) return;
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
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<GraphNode, GraphLink>(edges)
        .id((n) => n.id)
        .distance((e) =>
          endpoint(e.source).id === root?.id ||
          endpoint(e.target).id === root?.id
            ? 140
            : 95,
        )
        .strength(0.35),
    )
    .force("charge", forceManyBody().strength(-150))
    .force(
      "collide",
      forceCollide<GraphNode>().radius((n) => n.radius + 35),
    )
    .force(
      "x",
      forceX<GraphNode>((n) =>
        n.scope === "user" ? width * 0.77 : width * 0.43,
      ).strength(0.035),
    )
    .force("y", forceY(height / 2).strength(0.055))
    .stop();
  if (root) {
    const main = nodes.find((n) => n.id === root.id);
    if (main) main.fx = width * 0.45;
    if (main) main.fy = height / 2;
  }
  const tick = () => {
    edge
      .attr("x1", (e) => endpoint(e.source).x ?? 0)
      .attr("y1", (e) => endpoint(e.source).y ?? 0)
      .attr("x2", (e) => endpoint(e.target).x ?? 0)
      .attr("y2", (e) => endpoint(e.target).y ?? 0);
    node.attr("transform", (n) => `translate(${n.x},${n.y})`);
  };
  simulation.tick(Math.min(180, nodes.length > 700 ? 60 : 180));
  tick();
  fit();
  simulation.on("tick", tick);
  node.call(
    drag<SVGGElement, GraphNode>()
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
  return {
    fit,
    zoomIn: () => {
      svg.call(zoomer.scaleBy, 1.3);
    },
    zoomOut: () => {
      svg.call(zoomer.scaleBy, 1 / 1.3);
    },
    destroy: () => {
      simulation.stop();
      simulation.on("tick", null);
      node.on(".drag", null).on("click", null).on("keydown", null);
      svg.on(".zoom", null);
      svg.remove();
    },
  };
}
