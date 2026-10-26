import type {
  Client,
  McpAnalysisStatus,
  McpServer,
  Scope,
} from "../contracts.js";

/** Private connection settings. Never serialize this type into an API response. */
export interface McpTarget {
  id: string;
  catalogId: string;
  name: string;
  path: string;
  scope: Scope;
  clients: Client[];
  transport: McpServer["transport"];
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabledTools?: string[];
  disabledTools?: string[];
  alwaysLoad?: boolean;
  loading?: "eager" | "deferred" | "conditional";
  loadingByClient?: Partial<
    Record<Client, "eager" | "deferred" | "conditional">
  >;
  copilotSurface?: "vscode" | "cli";
  issue?: {
    status: Exclude<McpAnalysisStatus, "pending" | "ready">;
    detail: string;
  };
}
export interface McpToolDefinition {
  name: string;
  description?: string;
  title?: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}
export interface McpCatalogResult {
  status: McpAnalysisStatus;
  detail: string;
  instructions?: string;
  tools?: McpToolDefinition[];
  collectedAt?: string;
}
export interface McpAnalysis {
  enabled: boolean;
  running: boolean;
  results: Map<string, McpCatalogResult>;
}
