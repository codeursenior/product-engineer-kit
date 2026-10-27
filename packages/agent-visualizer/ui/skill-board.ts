import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from "@angular/core";
import type { Client, Skill, SkillEdge } from "../src/contracts";
import {
  anchor,
  boardStorageKey,
  cardSize,
  readBoard,
  reconcileBoard,
  type BoardData,
  type Point,
  type Drawing,
} from "./skill-board-model";

type Selection = { kind: "skill" | "arrow" | "title"; id: string };
type Gesture =
  | { kind: "pan"; start: Point; origin: Point }
  | { kind: "skill" | "title"; id: string; start: Point; origin: Point }
  | { kind: "endpoint"; id: string; end: "source" | "target" };

@Component({
  selector: "app-skill-board",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./skill-board.html",
  styleUrl: "./skill-board.css",
  host: {
    "[class.fullscreen]": "fullscreen()",
    "[attr.role]": "fullscreen() ? 'dialog' : null",
    "[attr.aria-modal]": "fullscreen() ? 'true' : null",
    "[attr.aria-label]": "fullscreen() ? 'Skills whiteboard fullscreen' : null",
    "(keydown)": "fullscreenKey($event)",
  },
})
export class SkillBoard {
  readonly ends = ["source", "target"] as const;
  readonly project = input.required<string>();
  readonly skills = input.required<Skill[]>();
  readonly client = input<Client | "all">("all");
  readonly edges = input.required<SkillEdge[]>();
  readonly selected = output<Skill>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly storageError = signal("");
  readonly fullscreen = signal(false);
  readonly state = linkedSignal<
    { project: string; skills: Skill[] },
    { project: string; data: BoardData; restoreError: string }
  >({
    source: () => ({ project: this.project(), skills: this.skills() }),
    computation: (source, previous) => {
      let saved: BoardData = { version: 1, nodes: [], arrows: [], titles: [] };
      let restoreError = "";
      if (previous?.value.project === source.project) {
        saved = previous.value.data;
        restoreError = previous.value.restoreError;
      } else {
        try {
          saved = readBoard(source.project);
        } catch {
          restoreError =
            "Could not restore this whiteboard. Changes in this session will not overwrite the saved data.";
        }
      }
      return {
        project: source.project,
        data: reconcileBoard(source.skills, saved),
        restoreError,
      };
    },
  });
  readonly board = computed(() => this.state().data);
  readonly selection = signal<Selection | null>(null);
  readonly connecting = signal(false);
  readonly source = signal<string | null>(null);
  readonly titleText = signal("");
  readonly pan = signal<Point>({ x: 0, y: 0 });
  readonly scale = signal(1);
  readonly pointer = signal<Point | null>(null);
  readonly transform = computed(
    () => `translate(${this.pan().x} ${this.pan().y}) scale(${this.scale()})`,
  );
  private gesture: Gesture | undefined;
  readonly cards = computed(() =>
    this.board().nodes.flatMap((node) => {
      const skill = this.skills().find((skill) =>
        skill.editTargets.some((file) => node.files.includes(file.id)),
      );
      const client = this.client();
      return skill && (client === "all" || skill.clients.includes(client))
        ? [{ ...node, skill }]
        : [];
    }),
  );
  readonly automatic = computed(() =>
    this.edges().flatMap((edge) => {
      const source = this.cards().find((node) => node.skill.id === edge.source);
      const target = this.cards().find((node) => node.skill.id === edge.target);
      return source && target
        ? [{ source: source.key, target: target.key }]
        : [];
    }),
  );
  readonly drawings = computed(() => {
    const keys = new Set(this.cards().map((card) => card.key));
    return this.board().arrows.filter(
      (arrow) => keys.has(arrow.source) && keys.has(arrow.target),
    );
  });
  readonly arrow = computed(() =>
    this.drawings().find(
      (arrow) =>
        this.selection()?.kind === "arrow" && arrow.id === this.selection()?.id,
    ),
  );
  readonly title = computed(() =>
    this.board().titles.find(
      (title) =>
        this.selection()?.kind === "title" && title.id === this.selection()?.id,
    ),
  );
  readonly skill = computed(
    () =>
      this.cards().find(
        (card) =>
          this.selection()?.kind === "skill" &&
          card.key === this.selection()?.id,
      )?.skill,
  );
  readonly hint = computed(() =>
    this.connecting()
      ? this.source()
        ? "Click the destination skill. Escape cancels."
        : "Click the starting skill. Escape cancels."
      : "Drag skills and titles. Drag the background to pan. Select a skill and use arrow keys to move it.",
  );

  constructor() {
    effect((onCleanup) => {
      if (!this.fullscreen()) return;
      const overflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      onCleanup(() => {
        document.body.style.overflow = overflow;
      });
    });
    effect(() => {
      const state = this.state();
      if (state.restoreError) return;
      try {
        localStorage.setItem(
          boardStorageKey(state.project),
          JSON.stringify(state.data),
        );
        this.storageError.set("");
      } catch {
        this.storageError.set(
          "Autosave unavailable. Keep this tab open; changes are only held in memory.",
        );
      }
    });
  }
  toggleFullscreen(): void {
    this.fullscreen.update((value) => !value);
  }
  exitFullscreen(): void {
    this.fullscreen.set(false);
    this.element.nativeElement
      .querySelector<HTMLButtonElement>(".board-fullscreen")
      ?.focus();
  }
  openSkill(skill: Skill): void {
    if (this.fullscreen()) this.exitFullscreen();
    this.selected.emit(skill);
  }
  fullscreenKey(event: KeyboardEvent): void {
    if (!this.fullscreen()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.escape();
      this.exitFullscreen();
    }
    if (event.key !== "Tab") return;
    const controls = this.element.nativeElement.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
    );
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  private change(update: (data: BoardData) => BoardData): void {
    this.state.update((state) => ({ ...state, data: update(state.data) }));
  }
  choose(kind: Selection["kind"], id: string): void {
    if (kind === "skill" && this.connecting()) {
      const source = this.source();
      if (!source || !this.cards().some((card) => card.key === source))
        this.source.set(id);
      else if (source !== id) {
        const arrow = { id: crypto.randomUUID(), source, target: id };
        this.change((data) => ({ ...data, arrows: [...data.arrows, arrow] }));
        this.connecting.set(false);
        this.source.set(null);
        this.selection.set({ kind: "arrow", id: arrow.id });
      }
      return;
    }
    this.selection.set({ kind, id });
  }
  toggleConnect(): void {
    this.connecting.update((value) => !value);
    this.source.set(null);
  }
  addTitle(): void {
    const text = this.titleText().trim();
    if (!text) return;
    const svg = this.svg();
    const x = ((svg?.clientWidth ?? 800) / 2 - this.pan().x) / this.scale();
    const y = (0 - this.pan().y) / this.scale();
    const title = { id: crypto.randomUUID(), text: text.slice(0, 160), x, y };
    this.change((data) => ({ ...data, titles: [...data.titles, title] }));
    this.selection.set({ kind: "title", id: title.id });
    this.titleText.set("");
  }
  editTitle(text: string): void {
    const id = this.title()?.id;
    this.change((data) => ({
      ...data,
      titles: data.titles.map((title) =>
        title.id === id ? { ...title, text: text.slice(0, 160) } : title,
      ),
    }));
  }
  remove(): void {
    const selection = this.selection();
    if (!selection || selection.kind === "skill") return;
    this.change((data) => ({
      ...data,
      arrows: data.arrows.filter(
        (arrow) => selection.kind !== "arrow" || arrow.id !== selection.id,
      ),
      titles: data.titles.filter(
        (title) => selection.kind !== "title" || title.id !== selection.id,
      ),
    }));
    this.selection.set(null);
  }
  reconnect(end: "source" | "target", value: string): void {
    const selected = this.arrow();
    if (!selected || selected[end === "source" ? "target" : "source"] === value)
      return;
    this.change((data) => ({
      ...data,
      arrows: data.arrows.map((arrow) =>
        arrow.id === selected.id ? { ...arrow, [end]: value } : arrow,
      ),
    }));
  }
  path(edge: Pick<Drawing, "source" | "target">): string {
    const source = this.board().nodes.find((node) => node.key === edge.source);
    const target = this.board().nodes.find((node) => node.key === edge.target);
    if (!source || !target) return "";
    let a = anchor(source, target),
      b = anchor(target, source);
    if (
      this.gesture?.kind === "endpoint" &&
      "id" in edge &&
      this.gesture.id === edge.id &&
      this.pointer()
    ) {
      if (this.gesture.end === "source") a = this.pointer()!;
      else b = this.pointer()!;
    }
    if ("id" in edge) {
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const control = {
        x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * 28,
        y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * 28,
      };
      return `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`;
    }
    return `M ${a.x} ${a.y} L ${b.x} ${b.y}`;
  }
  endpoint(edge: Drawing, end: "source" | "target"): Point {
    const source = this.board().nodes.find((node) => node.key === edge.source);
    const target = this.board().nodes.find((node) => node.key === edge.target);
    return source && target
      ? end === "source"
        ? anchor(source, target)
        : anchor(target, source)
      : { x: 0, y: 0 };
  }
  private svg(): SVGSVGElement | null {
    return this.element.nativeElement.querySelector("svg.board-surface");
  }
  private screenPoint(event: PointerEvent): Point {
    return { x: event.clientX, y: event.clientY };
  }
  private world(event: PointerEvent): Point {
    const rect = this.svg()!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left - this.pan().x) / this.scale(),
      y: (event.clientY - rect.top - this.pan().y) / this.scale(),
    };
  }
  start(event: PointerEvent, kind: "skill" | "title", id: string): void {
    if (event.button !== 0 || this.connecting()) return;
    event.stopPropagation();
    const item =
      kind === "skill"
        ? this.board().nodes.find((node) => node.key === id)
        : this.board().titles.find((title) => title.id === id);
    if (!item) return;
    this.gesture = {
      kind,
      id,
      start: this.screenPoint(event),
      origin: { x: item.x, y: item.y },
    };
    this.svg()?.setPointerCapture(event.pointerId);
    this.selection.set({ kind, id });
  }
  startEndpoint(
    event: PointerEvent,
    arrow: Drawing,
    end: "source" | "target",
  ): void {
    if (event.button !== 0) return;
    event.stopPropagation();
    this.gesture = { kind: "endpoint", id: arrow.id, end };
    this.pointer.set(this.world(event));
    this.svg()?.setPointerCapture(event.pointerId);
  }
  startPan(event: PointerEvent): void {
    if (
      event.button !== 0 ||
      (event.target instanceof Element &&
        event.target.closest("[data-board-item]"))
    )
      return;
    this.gesture = {
      kind: "pan",
      start: this.screenPoint(event),
      origin: this.pan(),
    };
    this.svg()?.setPointerCapture(event.pointerId);
    this.selection.set(null);
  }
  move(event: PointerEvent): void {
    const gesture = this.gesture;
    if (!gesture) return;
    if (gesture.kind === "endpoint") {
      this.pointer.set(this.world(event));
      return;
    }
    const divisor = gesture.kind === "pan" ? 1 : this.scale();
    const point = {
      x: gesture.origin.x + (event.clientX - gesture.start.x) / divisor,
      y: gesture.origin.y + (event.clientY - gesture.start.y) / divisor,
    };
    if (gesture.kind === "pan") this.pan.set(point);
    else this.position(gesture.kind, gesture.id, point);
  }
  end(event: PointerEvent): void {
    if (this.gesture?.kind === "endpoint") {
      const point = this.world(event);
      const card = this.cards().find(
        (node) =>
          point.x >= node.x &&
          point.x <= node.x + cardSize.width &&
          point.y >= node.y &&
          point.y <= node.y + cardSize.height,
      );
      if (card) this.reconnect(this.gesture.end, card.key);
    }
    this.cancelGesture(event);
  }
  cancelGesture(event: PointerEvent): void {
    this.gesture = undefined;
    this.pointer.set(null);
    if (this.svg()?.hasPointerCapture(event.pointerId))
      this.svg()?.releasePointerCapture(event.pointerId);
  }
  private position(kind: "skill" | "title", id: string, point: Point): void {
    this.change((data) =>
      kind === "skill"
        ? {
            ...data,
            nodes: data.nodes.map((node) =>
              node.key === id ? { ...node, ...point } : node,
            ),
          }
        : {
            ...data,
            titles: data.titles.map((title) =>
              title.id === id ? { ...title, ...point } : title,
            ),
          },
    );
  }
  key(event: KeyboardEvent, kind: Selection["kind"], id: string): void {
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      this.choose(kind, id);
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      this.selection.set({ kind, id });
      this.remove();
    }
    const direction: Record<string, Point> = {
      ArrowLeft: { x: -20, y: 0 },
      ArrowRight: { x: 20, y: 0 },
      ArrowUp: { x: 0, y: -20 },
      ArrowDown: { x: 0, y: 20 },
    };
    const delta = direction[event.key];
    if (delta && kind !== "arrow") {
      event.preventDefault();
      const item =
        kind === "skill"
          ? this.board().nodes.find((node) => node.key === id)
          : this.board().titles.find((title) => title.id === id);
      if (item)
        this.position(kind, id, { x: item.x + delta.x, y: item.y + delta.y });
    }
  }
  escape(): void {
    this.connecting.set(false);
    this.source.set(null);
    this.selection.set(null);
  }
  zoom(factor: number, anchor?: Point): void {
    const svg = this.svg();
    const next = Math.max(0.05, Math.min(3, this.scale() * factor));
    const ratio = next / this.scale();
    const center = anchor ?? {
      x: (svg?.clientWidth ?? 800) / 2,
      y: (svg?.clientHeight ?? 500) / 2,
    };
    this.pan.update((pan) => ({
      x: center.x - (center.x - pan.x) * ratio,
      y: center.y - (center.y - pan.y) * ratio,
    }));
    this.scale.set(next);
  }
  wheel(event: WheelEvent): void {
    event.preventDefault();
    if (!event.deltaY) return;
    const svg = this.svg();
    const rect = svg?.getBoundingClientRect();
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? svg?.clientHeight || 500
          : 1;
    // Trackpads emit many tiny events. Scale by distance, not event count.
    const delta = Math.max(-100, Math.min(100, event.deltaY * unit));
    this.zoom(Math.exp(-delta * 0.001), {
      x: event.clientX - (rect?.left ?? 0),
      y: event.clientY - (rect?.top ?? 0),
    });
  }
  fit(): void {
    const items = [...this.cards(), ...this.board().titles];
    if (!items.length) return;
    const left = Math.min(...items.map((item) => item.x)) - 40;
    const top = Math.min(...items.map((item) => item.y)) - 40;
    const width =
      Math.max(
        ...items.map(
          (item) =>
            item.x +
            ("text" in item
              ? Math.max(320, item.text.length * 15)
              : cardSize.width),
        ),
      ) -
      left +
      40;
    const height =
      Math.max(...items.map((item) => item.y + cardSize.height)) - top + 40;
    const svg = this.svg();
    const scale = Math.max(
      0.05,
      Math.min(
        1,
        (svg?.clientWidth ?? 800) / width,
        (svg?.clientHeight ?? 500) / height,
      ),
    );
    this.scale.set(scale);
    this.pan.set({ x: -left * scale, y: -top * scale });
  }
}
