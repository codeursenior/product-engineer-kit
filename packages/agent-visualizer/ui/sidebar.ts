import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import {
  clientNames,
  icons,
  labels,
  filterRows,
  type Row,
  type Tab,
} from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [],
  selector: "aside[appSidebar]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./sidebar.html",
})
export class Sidebar {
  readonly state = inject(WorkspaceState);
  readonly clients = clientNames;
  readonly icons = icons;
  readonly labels = labels;
  readonly agentName = computed(() => {
    const data = this.state.data();
    if (data?.agent?.name) return data.agent.name;
    const folder = data?.project.name;
    return folder
      ? folder.charAt(0).toUpperCase() + folder.slice(1)
      : "Loading…";
  });
  readonly failedAvatar = signal<string | undefined>(undefined);
  readonly avatar = computed(() => {
    const avatar = this.state.data()?.agent?.avatar;
    return avatar !== this.failedAvatar() ? avatar : undefined;
  });
  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "context", label: "Context", icon: "⌘" },
    { id: "skills", label: "Skills", icon: "✧" },
    { id: "mcp", label: "MCP servers", icon: "⎇" },
  ];
  count(tab: Tab): number {
    if (tab === "optimizer" || tab === "checklist") return 0;
    const data = this.state.data();
    return data
      ? filterRows<Row>(
          tab === "context" ? data.nodes : data[tab],
          "all",
          this.state.client(),
          "",
        ).length
      : 0;
  }
  refresh(): void {
    this.state.selection.set(null);
    void this.state.load(true);
  }
}
