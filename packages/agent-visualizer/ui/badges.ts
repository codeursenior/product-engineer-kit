import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { Client, Scope } from "../src/contracts";
import { icons, labels } from "./models";

@Component({
  selector: "[appScope]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "[class]": "'badge ' + assetScope()" },
  template: `<i [class]="'dot ' + assetScope()"></i
    >{{ assetScope() === "user" ? "User" : "Project" }}`,
})
export class ScopeBadge {
  readonly assetScope = input.required<Scope>();
}

@Component({
  selector: "[appClient]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    "[class]":
      "'client-icon client-icon--' + client() + (active() ? '' : ' off')",
    role: "img",
    "[attr.aria-label]": "text()",
    "[title]": "text()",
  },
  template: `<img [src]="icons[client()]" alt="" aria-hidden="true" />`,
})
export class ClientIcon {
  readonly client = input.required<Client>();
  readonly active = input.required<boolean>();
  readonly hint = input("");
  readonly icons = icons;
  text(): string {
    return `${labels[this.client()]}: ${this.active() ? "discovered" : "not discovered"}${this.hint() ? " · " + this.hint() : ""}`;
  }
}
