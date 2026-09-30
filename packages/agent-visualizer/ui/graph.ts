import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import type { ContextNode, GraphEdge } from "../src/contracts";
import { renderGraph, type GraphHandle } from "./graph-renderer";

@Component({
  imports: [],
  selector: "section[appGraph]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./graph.html",
})
export class Graph {
  readonly nodes = input.required<ContextNode[]>();
  readonly edges = input.required<GraphEdge[]>();
  readonly selected = output<ContextNode>();
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly size = signal(0);
  handle: GraphHandle | undefined;
  constructor() {
    afterRenderEffect((cleanup) => {
      this.size();
      const handle = renderGraph(
        this.element.nativeElement,
        this.nodes(),
        this.edges(),
        (row) => this.selected.emit(row),
      );
      this.handle = handle;
      cleanup(() => handle.destroy());
    });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const resize = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.size.update((value) => value + 1), 150);
    };
    window.addEventListener("resize", resize);
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(timeout);
      window.removeEventListener("resize", resize);
    });
  }
}
