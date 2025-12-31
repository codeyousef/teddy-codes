/**
 * LEANN - Low-storage Embedding Approximate Nearest Neighbors
 *
 * A lightweight codebase indexing system designed for Teddy.Codes.
 * Provides 97% storage savings by storing only file hashes and
 * recomputing embeddings on-the-fly during search.
 */

export { LeannIndex } from "./LeannIndex.js";
export type {
  LeannDocument,
  LeannIndexConfig,
  LeannSearchOptions,
  LeannSearchResult,
} from "./LeannIndex.js";

export { LeannMCPServer } from "./LeannMCPServer.js";
export type {
  LeannMCPConfig,
  LeannMCPTool,
  LeannMCPToolResult,
} from "./LeannMCPServer.js";
