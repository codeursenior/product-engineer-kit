import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  signal,
} from "@angular/core";
import { clientNames } from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [],
  selector: "div[appFilters]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./filters.html",
})
export class Filters {
  readonly state = inject(WorkspaceState);
  readonly query = signal("");
  private timeout: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    effect(() => {
      this.state.tab();
      clearTimeout(this.timeout);
      this.query.set("");
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timeout));
  }
  search(value: string): void {
    this.query.set(value);
    clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.state.search.set(value), 130);
  }
  client(value: string): void {
    this.state.client.set(
      clientNames.find((client) => client === value) ?? "all",
    );
  }
}
