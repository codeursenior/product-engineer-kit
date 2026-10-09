import { DecimalPipe } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
} from "@angular/core";
import type {
  Client,
  OptimizationCheck,
  TokenEstimate,
} from "../src/contracts";
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
  readonly checks = signal<OptimizationCheck[]>([]);
  readonly loading = signal(false);
  readonly checking = signal(false);
  readonly error = signal("");
  readonly checkError = signal("");
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
    void this.checkAgain();
  }
  selectClient(value: string): void {
    const client = this.clients.find((client) => client === value);
    if (client) this.client.set(client);
  }
  async checkAgain(): Promise<void> {
    if (this.checking()) return;
    this.checking.set(true);
    this.checkError.set("");
    try {
      this.checks.set((await this.api.optimizationChecks()).checks);
    } catch (error) {
      this.checkError.set(message(error));
    } finally {
      this.checking.set(false);
    }
  }
}
