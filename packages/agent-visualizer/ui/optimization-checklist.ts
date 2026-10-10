import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from "@angular/core";
import type { OptimizationCheck } from "../src/contracts";
import { WorkspaceApi } from "./api";
import { message } from "./models";

@Component({
  selector: "app-optimization-checklist",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./optimization-checklist.css",
  templateUrl: "./optimization-checklist.html",
})
export class OptimizationChecklist {
  private readonly api = inject(WorkspaceApi);
  readonly checks = signal<OptimizationCheck[]>([]);
  readonly checking = signal(false);
  readonly checkError = signal("");
  constructor() {
    void this.checkAgain();
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
