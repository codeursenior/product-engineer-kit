import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from "@angular/core";
import { ClientIcon, ScopeBadge } from "./badges";
import {
  type Row,
  type Tab,
  clientNames,
  conditions,
  description,
  invocation,
  paths,
} from "./models";

@Component({
  imports: [ScopeBadge, ClientIcon],
  selector: "div[appAssetTable]",
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./asset-table.html",
})
export class AssetTable {
  readonly rows = input.required<Row[]>();
  readonly tab = input.required<Tab>();
  readonly selected = output<Row>();
  readonly paths = paths;
  readonly description = description;
  readonly conditions = conditions;
  readonly invocation = invocation;
  readonly clients = clientNames;
  readonly headers: Record<Tab, string[]> = {
    context: ["File", "Type", "Lines", "Scope", "Clients"],
    rules: ["Rule", "Conditions", "Scope", "Clients"],
    skills: ["Skill", "Invocation", "Scope", "Clients"],
    mcp: ["Server", "Connection", "Transport", "Scope", "Clients"],
  };
  readonly help: Record<Tab, string> = {
    context:
      "Client icons show entry points and linked documents that each agent can discover. They do not confirm a file loaded in a session. Unlinked knowledge has no client entry point.",
    rules:
      "Dedicated Cursor, Claude Code, and GitHub Copilot instruction files. File metadata describes conditions; it does not prove a rule loaded in a session. General instructions remain in Context.",
    skills:
      "Client icons: Cursor · Claude Code · Codex · GitHub Copilot. Active means a discovery path was found, not a running session. Hover for invocation details. Identical copies are grouped.",
    mcp: "Client icons: Cursor · Claude Code · Codex · GitHub Copilot. Configuration does not prove a live connection. The viewer never launches a server or sends credentials.",
  };
}
