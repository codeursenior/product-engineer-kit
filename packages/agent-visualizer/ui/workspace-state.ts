import { Injectable, computed, inject, signal } from "@angular/core";
import type { Client, ScanData, Scope } from "../src/contracts";
import { WorkspaceApi } from "./api";
import {
  filterRows,
  message,
  type Row,
  type Selection,
  type Tab,
} from "./models";

@Injectable({ providedIn: "root" })
export class WorkspaceState {
  private readonly api = inject(WorkspaceApi);
  readonly data = signal<ScanData | null>(null);
  readonly tab = signal<Tab>("context");
  readonly assetTab = computed(() => {
    const tab = this.tab();
    return tab === "optimizer" ? "context" : tab;
  });
  readonly scope = signal<Scope | "all">("all");
  readonly client = signal<Client | "all">("all");
  readonly search = signal("");
  readonly view = signal<"graph" | "list">("graph");
  readonly loading = signal(false);
  readonly error = signal("");
  readonly selection = signal<Selection | null>(null);
  readonly theme = signal(
    localStorage.getItem("boyscout-theme") === "dark" ? "dark" : "light",
  );
  readonly rows = computed(() => {
    const data = this.data();
    const tab = this.tab();
    if (tab === "optimizer") return [];
    const rows: Row[] = data
      ? tab === "context"
        ? data.nodes
        : data[tab]
      : [];
    return filterRows(rows, this.scope(), this.client(), this.search());
  });
  readonly nodes = computed(() =>
    filterRows(
      this.data()?.nodes ?? [],
      this.scope(),
      this.client(),
      this.search(),
    ),
  );
  readonly summary = computed(() => {
    if (this.error()) return "Session unavailable";
    if (!this.data()) return "Reading local assets";
    if (this.tab() === "optimizer")
      return "Static local estimates · One selected agent";
    const rows = this.rows();
    const project = rows.filter((row) => row.scope === "project").length;
    const noun =
      this.tab() === "context"
        ? "files"
        : this.tab() === "mcp"
          ? "servers"
          : this.tab();
    return `${rows.length} ${noun} · ${project} project · ${rows.length - project} user`;
  });
  constructor() {
    document.documentElement.dataset["theme"] = this.theme();
  }
  async load(refresh = false): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.scan(refresh);
      this.data.set(data);
      this.error.set("");
      document.title = `${data.project.name} · Agent Visualizer`;
    } catch (error) {
      this.error.set(message(error));
    } finally {
      this.loading.set(false);
    }
  }
  selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.client.set("all");
    this.search.set("");
    this.selection.set(null);
  }
  toggleTheme(): void {
    const next = this.theme() === "dark" ? "light" : "dark";
    this.theme.set(next);
    localStorage.setItem("boyscout-theme", next);
    document.documentElement.dataset["theme"] = next;
  }
}
