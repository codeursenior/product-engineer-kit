import { DecimalPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import type { Client, TokenEstimate } from "../src/contracts";
import { WorkspaceApi } from "./api";
import { labels, message } from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [DecimalPipe],
  selector: "app-token-optimizer",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./token-optimizer.css",
  templateUrl: "./token-optimizer.html",
})
export class TokenOptimizer {
  private readonly api = inject(WorkspaceApi);
  private readonly state = inject(WorkspaceState);
  readonly clients: Client[] = ["codex", "claude", "cursor", "copilot"];
  readonly labels = labels;
  readonly client = signal<Client>("codex");
  readonly model = signal("gpt-5.3-codex");
  readonly estimate = signal<TokenEstimate | null>(null);
  readonly startupEntries = computed(() =>
    (this.estimate()?.entries ?? []).filter(
      (entry) => entry.portion === "startup",
    ),
  );
  readonly loading = signal(false);
  readonly error = signal("");
  constructor() {
    effect((onCleanup) => {
      this.state.data(); // A successful rescan invalidates the estimate.
      const client = this.client(),
        model = this.model();
      let current = true;
      onCleanup(() => {
        current = false;
      });
      this.loading.set(true);
      this.error.set("");
      void this.api
        .estimate(client, model)
        .then((data) => {
          if (current) this.estimate.set(data);
        })
        .catch((error: unknown) => {
          if (current) this.error.set(message(error));
        })
        .finally(() => {
          if (current) this.loading.set(false);
        });
    });
  }
  selectClient(value: string): void {
    const client = this.clients.find((client) => client === value);
    if (client) this.client.set(client);
  }
}
