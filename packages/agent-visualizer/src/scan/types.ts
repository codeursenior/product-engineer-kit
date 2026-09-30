import type { ScanData, Scope } from "../contracts.js";

export interface ScanOptions {
  home?: string;
  includeUser?: boolean;
  codexHome?: string;
}
export interface EditableFile {
  file: string;
  real: string;
  deletable: boolean;
}
export interface Snapshot {
  data: ScanData;
  content: Map<string, string>;
  editable: Map<string, EditableFile>;
}
export interface FileEntry {
  id: string;
  real: string;
  file: string;
  aliases: string[];
  scope: Scope;
  text: string;
}
export interface ScanEnvironment {
  root: string;
  home: string;
  codexHome: string;
  includeUser: boolean;
  allowed: string[];
  display: (file: string, scope: Scope) => string;
  warnings: string[];
}
