import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import type { Tab } from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [],
  selector: "aside[appSidebar]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./sidebar.html",
})
export class Sidebar {
  readonly state = inject(WorkspaceState);
  readonly failedAvatar = signal<string | undefined>(undefined);
  readonly avatar = computed(() => {
    const avatar = this.state.data()?.agent?.avatar;
    return avatar !== this.failedAvatar() ? avatar : undefined;
  });
  readonly tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "context", label: "Context", icon: "⌘" },
    { id: "rules", label: "Rules", icon: "▤" },
    { id: "skills", label: "Skills", icon: "✧" },
    { id: "mcp", label: "MCP servers", icon: "⎇" },
  ];
  count(tab: Tab): number {
    const data = this.state.data();
    return data ? (tab === "context" ? data.nodes : data[tab]).length : 0;
  }
  refresh(): void {
    this.state.selection.set(null);
    void this.state.load(true);
  }
}
