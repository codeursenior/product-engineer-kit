import { DatePipe, DecimalPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
} from "@angular/core";
import type {
  Client,
  McpProfiles,
  TokenEntry,
  TokenEstimate,
} from "../src/contracts";
import { WorkspaceApi } from "./api";
import { labels, message } from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [DatePipe, DecimalPipe],
  selector: "app-token-optimizer",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./token-optimizer.css",
  templateUrl: "./token-optimizer.html",
})
export class TokenOptimizer {
  private readonly api = inject(WorkspaceApi);
  private readonly state = inject(WorkspaceState);
  readonly labels = { ...labels, all: "all agents" };
  readonly client = this.state.client;
  readonly model = signal("gpt-6.1-sol");
  readonly estimate = signal<TokenEstimate | null>(null);
  readonly startupEntries = computed(() => {
    const rows = new Map<string, TokenEntry>();
    for (const entry of this.estimate()?.entries ?? []) {
      if (entry.portion !== "startup") continue;
      const key =
        entry.kind === "mcp"
          ? `mcp:${entry.mcpServerId ?? entry.id}`
          : `entry:${entry.id}`;
      const previous = rows.get(key);
      rows.set(
        key,
        previous
          ? {
              ...previous,
              tokens: previous.tokens + entry.tokens,
              words: previous.words + entry.words,
              bytes: previous.bytes + entry.bytes,
              inputCost: previous.inputCost + entry.inputCost,
            }
          : { ...entry, id: key },
      );
    }
    return [...rows.values()].sort(
      (a, b) => b.tokens - a.tokens || a.path.localeCompare(b.path),
    );
  });
  readonly loading = signal(false);
  readonly error = signal("");
  private readonly project = computed(
    () => this.state.data()?.project.path ?? "",
  );
  private readonly restored = computed(() => restoredProfiles(this.project()));
  readonly profiles = linkedSignal(() => this.restored().profiles);
  private readonly saveError = signal("");
  readonly profileNotice = computed(
    () => this.saveError() || this.restored().notice,
  );
  readonly mcpProfiles = computed(() => {
    const selected = this.client();
    return (this.estimate()?.mcp?.profiles ?? []).filter(
      (profile) => selected === "all" || profile.client === selected,
    );
  });

  setProfile(client: Client, value: string): void {
    if (value !== "documented" && value !== "eager" && value !== "deferred")
      return;
    const next = { ...this.profiles(), [client]: value };
    this.profiles.set(next);
    if (!this.project()) return;
    try {
      localStorage.setItem(
        profileStorageKey(this.project()),
        JSON.stringify(next),
      );
      this.saveError.set("");
    } catch {
      this.saveError.set("MCP profiles could not be saved in this browser.");
    }
  }

  constructor() {
    effect((onCleanup) => {
      this.state.data(); // A successful rescan invalidates the estimate.
      const client = this.client(),
        model = this.model(),
        profiles = this.profiles();
      let current = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      onCleanup(() => {
        current = false;
        clearTimeout(timer);
      });
      this.loading.set(true);
      this.error.set("");
      const request = async (): Promise<void> => {
        try {
          const data = await this.api.estimate(client, model, profiles);
          if (!current) return;
          this.estimate.set(data);
          this.error.set("");
          if (data.mcp?.pending)
            timer = setTimeout(() => {
              void request();
            }, 1000);
        } catch (error: unknown) {
          if (current) this.error.set(message(error));
        } finally {
          if (current) this.loading.set(false);
        }
      };
      void request();
    });
  }
}

function profileStorageKey(project: string): string {
  return `pek:mcp-profiles:v1:${project}`;
}

function restoredProfiles(project: string): {
  profiles: McpProfiles;
  notice: string;
} {
  if (!project) return { profiles: {}, notice: "" };
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(profileStorageKey(project)) ?? "null",
    );
    const profiles: McpProfiles = {};
    if (saved !== null && (typeof saved !== "object" || Array.isArray(saved)))
      throw new Error("Invalid profiles");
    if (saved) {
      for (const [client, choice] of Object.entries(saved)) {
        if (
          client !== "codex" &&
          client !== "claude" &&
          client !== "cursor" &&
          client !== "copilot"
        )
          continue;
        if (
          choice !== "documented" &&
          choice !== "eager" &&
          choice !== "deferred"
        )
          throw new Error("Invalid profile");
        profiles[client] = choice;
      }
    }
    return { profiles, notice: "" };
  } catch {
    return {
      profiles: {},
      notice:
        "MCP profiles could not be restored in this browser. Documented defaults are shown.",
    };
  }
}
