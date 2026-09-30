import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { AssetTable } from "./asset-table";
import { Detail } from "./detail";
import { Filters } from "./filters";
import { Graph } from "./graph";
import { titles, type Row } from "./models";
import { Sidebar } from "./sidebar";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [Sidebar, Filters, AssetTable, Detail, Graph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: "app-root",
  templateUrl: "./app.html",
  host: { "(document:keydown)": "key($event)" },
})
export class App {
  readonly state = inject(WorkspaceState);
  readonly titles = titles;
  constructor() {
    void this.state.load();
  }
  select(row: Row): void {
    this.state.selection.set({ tab: this.state.tab(), row });
  }
  key(event: KeyboardEvent): void {
    if (event.key === "Escape") this.state.selection.set(null);
    if (
      event.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName ?? "",
      )
    ) {
      event.preventDefault();
      document.getElementById("search")?.focus();
    }
  }
  updated(): string {
    const data = this.state.data();
    return data
      ? "Scanned " +
          new Date(data.scannedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
      : "";
  }
  empty(): string {
    if (
      this.state.search() ||
      this.state.scope() !== "all" ||
      this.state.client() !== "all"
    )
      return "Try another scope, client, or search.";
    switch (this.state.tab()) {
      case "context":
        return "Context appears here when your folder contains AGENTS.md, CLAUDE.md, .github/copilot-instructions.md, or linked knowledge files.";
      case "rules":
        return "Add .cursor/rules, .claude/rules, .github/instructions, or a legacy .cursorrules file to see rules here. General instructions stay in Context.";
      case "skills":
        return "Add a SKILL.md in an agent skills folder to see it here.";
      case "mcp":
        return "No MCP servers found in the supported configuration files.";
    }
  }
}
