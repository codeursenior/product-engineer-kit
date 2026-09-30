/** JSON contracts shared by the local server and browser. No filesystem capabilities. */
export type Client = "cursor" | "claude" | "codex";
export type Scope = "project" | "user";
export interface EditTarget {
  id: string;
  path: string;
  deletable: boolean;
}
export interface Asset {
  id: string;
  name: string;
  scope: Scope;
  clients: Client[];
}
export interface ContextNode extends Asset {
  path: string;
  aliases: string[];
  editTargets: EditTarget[];
  kind: "instruction" | "rule" | "knowledge";
  bytes: number;
  lines: number;
  excerpt: string;
}
export interface Rule extends Asset {
  description: string;
  paths: string[];
  legacy: boolean;
  globs: string[];
  pathsCondition: string[];
  alwaysApply: boolean;
}
export interface Skill extends Asset {
  description: string;
  paths: string[];
  editTargets: EditTarget[];
  invocation: Partial<Record<Client, string>>;
  legacy: boolean;
  mode: string;
}
export interface McpServer extends Asset {
  path: string;
  transport: "SSE" | "HTTP" | "stdio" | "Unknown";
  status: "Disabled" | "Not verified";
  configured: boolean;
  origin: string;
}
export interface GraphEdge {
  source: string;
  target: string;
  kind: "reference" | "scope";
}
export interface ScanData {
  project: { name: string; path: string };
  scannedAt: string;
  nodes: ContextNode[];
  rules: Rule[];
  edges: GraphEdge[];
  skills: Skill[];
  mcp: McpServer[];
  warnings: string[];
  limits: { includeUser: boolean; scannedFiles: number; truncated: boolean };
}
export interface ContentResponse {
  text: string;
}
export interface FileResponse extends ContentResponse {
  revision: string;
}
export interface SaveRequest {
  text: string;
  revision: string;
}
export interface DeleteRequest {
  revision: string;
}
export interface SaveResponse {
  revision: string;
}
export interface DeleteResponse {
  deleted: true;
}
export interface ApiError {
  error: string;
}
