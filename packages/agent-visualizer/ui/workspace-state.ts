import { Injectable, computed, effect, inject, signal } from "@angular/core";
import type { Client, ScanData, Scope } from "../src/contracts";
import { WorkspaceApi } from "./api";
import {
  clientNames,
  filterRows,
  message,
  type Row,
  type Selection,
  type Tab,
} from "./models";

const filterStorageKey = "pek:filters:v1";
function savedFilters(): { client: Client | "all"; scope: Scope | "all" } {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(filterStorageKey) ?? "null",
    );
    if (saved && typeof saved === "object") {
      const value = saved as Record<string, unknown>;
      return {
        client:
          clientNames.find((client) => client === value["client"]) ?? "all",
        scope:
          value["scope"] === "project" || value["scope"] === "user"
            ? value["scope"]
            : "all",
      };
    }
  } catch {
    /* Ignore unavailable or invalid browser preferences. */
  }
  return { client: "all", scope: "all" };
}

@Injectable({ providedIn: "root" })
export class WorkspaceState {
  private readonly api = inject(WorkspaceApi);
  readonly data = signal<ScanData | null>(null);
  readonly tab = signal<Tab>("context");
  readonly assetTab = computed(() => {
    const tab = this.tab();
    return tab === "optimizer" || tab === "checklist" ? "context" : tab;
  });
  private readonly savedFilters = savedFilters();
  readonly scope = signal<Scope | "all">(this.savedFilters.scope);
  readonly client = signal<Client | "all">(this.savedFilters.client);
  readonly filterStorageError = signal("");
  readonly boardSkills = computed(() =>
    filterRows(this.data()?.skills ?? [], "all", this.client(), ""),
  );
  readonly search = signal("");
  readonly view = signal<"graph" | "list">("graph");
  readonly skillsView = signal<"list" | "board">("list");
  readonly whiteboard = computed(
    () => this.tab() === "skills" && this.skillsView() === "board",
  );
  readonly loading = signal(false);
  readonly error = signal("");
  readonly selection = signal<Selection | null>(null);
  readonly theme = signal(
    localStorage.getItem("boyscout-theme") === "dark" ? "dark" : "light",
  );
  readonly rows = computed(() => {
    const data = this.data();
    const tab = this.tab();
    if (tab === "optimizer" || tab === "checklist") return [];
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
    if (this.tab() === "checklist") return "Local installation checks";
    if (this.tab() === "optimizer")
      return this.client() === "all"
        ? "Select an agent to estimate context"
        : "Static local estimates · One selected agent";
    const rows = this.whiteboard() ? this.boardSkills() : this.rows();
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
    effect(() => {
      const filters = { client: this.client(), scope: this.scope() };
      try {
        localStorage.setItem(filterStorageKey, JSON.stringify(filters));
        this.filterStorageError.set("");
      } catch {
        this.filterStorageError.set(
          "Filters could not be saved in this browser.",
        );
      }
    });
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
    this.search.set("");
    this.selection.set(null);
  }
  toggleClient(client: Client): void {
    this.client.update((selected) => (selected === client ? "all" : client));
    this.selection.set(null);
  }
  toggleTheme(): void {
    const next = this.theme() === "dark" ? "light" : "dark";
    this.theme.set(next);
    localStorage.setItem("boyscout-theme", next);
    document.documentElement.dataset["theme"] = next;
  }
}
