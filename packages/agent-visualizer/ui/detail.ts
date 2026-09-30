import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
} from "@angular/core";
import type { EditTarget, FileResponse } from "../src/contracts";
import { WorkspaceApi } from "./api";
import { ClientIcon, ScopeBadge } from "./badges";
import {
  clientNames,
  description,
  invocation,
  labels,
  message,
  paths,
  type Row,
  type Selection,
} from "./models";
import { WorkspaceState } from "./workspace-state";

@Component({
  imports: [ScopeBadge, ClientIcon],
  selector: "aside[appDetail]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./detail.html",
})
export class Detail {
  readonly state = inject(WorkspaceState);
  private readonly api = inject(WorkspaceApi);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly paths = paths;
  readonly clients = clientNames;
  readonly labels = labels;
  readonly invocation = invocation;
  readonly row = computed(() => this.state.selection()?.row ?? null);
  readonly targets = computed<EditTarget[]>(() => {
    const row = this.row();
    return row && "editTargets" in row ? row.editTargets : [];
  });
  readonly targetId = signal("");
  readonly target = computed(
    () =>
      this.targets().find((target) => target.id === this.targetId()) ??
      this.targets()[0],
  );
  readonly preview = signal("Loading…");
  readonly file = signal<FileResponse | null>(null);
  readonly mode = signal<"preview" | "edit" | "delete">("preview");
  readonly draft = signal("");
  readonly status = signal("");
  readonly busy = signal(false);
  private sequence = 0;
  private lastFocus: HTMLElement | null = null;
  private focusTimer: ReturnType<typeof setTimeout> | undefined;
  constructor() {
    effect(() => {
      const selection = this.state.selection();
      untracked(() => this.show(selection));
    });
    inject(DestroyRef).onDestroy(() => {
      this.sequence++;
      clearTimeout(this.focusTimer);
    });
  }
  description(row: Row): string {
    return (
      description(row) ||
      ("kind" in row
        ? `${row.kind} · ${row.bytes.toLocaleString()} bytes`
        : "MCP server configuration")
    );
  }
  ruleConditions(row: Row): string {
    if (!("globs" in row)) return "";
    if (row.legacy) return "Legacy .cursorrules";
    return (
      [
        row.alwaysApply ? "Cursor alwaysApply: true" : "",
        row.globs.length ? `Cursor globs: ${row.globs.join(", ")}` : "",
        row.pathsCondition.length
          ? `Claude paths: ${row.pathsCondition.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join(" · ") || "No path condition declared"
    );
  }
  private focus(selector: string): void {
    clearTimeout(this.focusTimer);
    this.focusTimer = setTimeout(() =>
      this.element.nativeElement.querySelector<HTMLElement>(selector)?.focus(),
    );
  }
  private show(selection: Selection | null): void {
    this.sequence++;
    clearTimeout(this.focusTimer);
    if (!selection) {
      if (this.lastFocus?.isConnected) this.lastFocus.focus();
      this.lastFocus = null;
      return;
    }
    this.lastFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    this.mode.set("preview");
    this.status.set("");
    this.busy.set(false);
    this.file.set(null);
    this.preview.set("Loading…");
    this.targetId.set(this.targets()[0]?.id ?? "");
    this.focus("#close-detail");
    if (selection.tab !== "mcp") void this.loadPreview();
  }
  async loadPreview(): Promise<void> {
    const current = ++this.sequence;
    this.preview.set("Loading…");
    this.file.set(null);
    this.status.set("");
    this.mode.set("preview");
    const row = this.row();
    if (!row) return;
    const target = this.target();
    try {
      if (target) {
        const file = await this.api.file(target.id);
        if (current !== this.sequence) return;
        this.file.set(file);
        this.preview.set(file.text);
      } else {
        const result = await this.api.content(row.id);
        if (current === this.sequence) this.preview.set(result.text);
      }
    } catch (error) {
      if (current === this.sequence) this.preview.set(message(error));
    }
  }
  source(id: string): void {
    this.targetId.set(id);
    void this.loadPreview();
  }
  edit(): void {
    const file = this.file();
    if (!file) return;
    this.draft.set(file.text);
    this.mode.set("edit");
    this.status.set("");
    this.focus("textarea");
  }
  confirmDelete(): void {
    this.mode.set("delete");
    this.status.set("");
    this.focus(".delete-confirm button");
  }
  cancel(): void {
    const mode = this.mode();
    this.mode.set("preview");
    this.focus(mode === "edit" ? ".edit-button" : ".delete-button");
  }
  close(): void {
    this.state.selection.set(null);
  }
  async save(event: Event): Promise<void> {
    event.preventDefault();
    const target = this.target(),
      file = this.file();
    if (!target || !file || this.busy()) return;
    const current = this.sequence,
      text = this.draft();
    this.busy.set(true);
    this.status.set("Saving…");
    try {
      const result = await this.api.save(target.id, {
        text,
        revision: file.revision,
      });
      if (current !== this.sequence) return;
      this.file.set({ text, revision: result.revision });
      this.preview.set(text);
      this.mode.set("preview");
      this.status.set("Saved. Workspace rescanned.");
      await this.state.load(true);
    } catch (error) {
      if (current === this.sequence) this.status.set(message(error));
    } finally {
      if (current === this.sequence) this.busy.set(false);
    }
  }
  async remove(): Promise<void> {
    const target = this.target(),
      file = this.file();
    if (!target || !file || this.busy()) return;
    const current = this.sequence;
    this.busy.set(true);
    this.status.set("Deleting…");
    try {
      await this.api.delete(target.id, file.revision);
      if (current !== this.sequence) return;
      this.close();
      await this.state.load(true);
    } catch (error) {
      if (current === this.sequence) this.status.set(message(error));
    } finally {
      if (current === this.sequence) this.busy.set(false);
    }
  }
}
