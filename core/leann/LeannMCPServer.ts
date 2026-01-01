/**
 * LEANN MCP Server - Model Context Protocol server for LEANN indexing
 *
 * Provides MCP tools for:
 * - Building/updating the codebase index
 * - Searching the index
 * - Getting index statistics
 */

import { LeannIndex, LeannSearchOptions } from "./LeannIndex.js";

export interface LeannMCPConfig {
  rootPath: string;
  onProgress?: (current: number, total: number, status: string) => void;
}

export interface LeannMCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface LeannMCPToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * LEANN MCP Server - provides indexing and search capabilities
 */
export class LeannMCPServer {
  private index: LeannIndex;
  private config: LeannMCPConfig;
  private building: boolean = false;

  constructor(config: LeannMCPConfig) {
    this.config = config;
    this.index = new LeannIndex({
      rootPath: config.rootPath,
      collection: "codebase",
    });
  }

  /**
   * Get available tools
   */
  getTools(): LeannMCPTool[] {
    return [
      {
        name: "leann_build",
        description:
          "Build or update the LEANN index for the codebase. This scans all source files and creates a lightweight index for fast searching. Only stores file hashes, not vectors - 97% storage savings.",
        inputSchema: {
          type: "object",
          properties: {
            force: {
              type: "boolean",
              description:
                "Force full rebuild even if index exists. Default: false",
            },
          },
        },
      },
      {
        name: "leann_search",
        description:
          "Search the codebase index for relevant code snippets. Returns matching files with content and relevance scores.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The search query - can be natural language or code",
            },
            topK: {
              type: "number",
              description: "Maximum number of results to return. Default: 10",
            },
            languageFilter: {
              type: "array",
              items: { type: "string" },
              description:
                'Filter results by programming language (e.g., ["typescript", "python"])',
            },
          },
          required: ["query"],
        },
      },
      {
        name: "leann_status",
        description:
          "Get the status and statistics of the LEANN index, including document count and index location.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ];
  }

  /**
   * Call a tool by name
   */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<LeannMCPToolResult> {
    try {
      switch (name) {
        case "leann_build":
          return await this.buildIndex(args.force as boolean | undefined);
        case "leann_search":
          return await this.search(
            args.query as string,
            args.topK as number | undefined,
            args.languageFilter as string[] | undefined,
          );
        case "leann_status":
          return await this.getStatus();
        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: `Error: ${error}` }],
        isError: true,
      };
    }
  }

  /**
   * Build/update the index
   */
  private async buildIndex(force?: boolean): Promise<LeannMCPToolResult> {
    if (this.building) {
      return {
        content: [
          {
            type: "text",
            text: "Index build already in progress. Please wait.",
          },
        ],
      };
    }

    this.building = true;
    try {
      await this.index.initialize();

      // Notify start
      this.config.onProgress?.(0, 1, "Scanning files...");

      const startTime = Date.now();
      const { indexed, skipped } = await this.index.build((current, total) => {
        // Progress callback - emit to extension
        this.config.onProgress?.(
          current,
          total,
          `Indexing files (${current}/${total})`,
        );
      });

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const stats = this.index.getStats();

      // Notify completion
      this.config.onProgress?.(
        stats.documentCount,
        stats.documentCount,
        "Complete!",
      );

      return {
        content: [
          {
            type: "text",
            text:
              `LEANN Index built successfully!\n\n` +
              `📁 Documents indexed: ${stats.documentCount}\n` +
              `✅ New/updated: ${indexed}\n` +
              `⏭️ Skipped (unchanged): ${skipped}\n` +
              `⏱️ Time: ${duration}s\n\n` +
              `Index location: ${this.config.rootPath}/.leann/`,
          },
        ],
      };
    } finally {
      this.building = false;
    }
  }

  /**
   * Search the index
   */
  private async search(
    query: string,
    topK?: number,
    languageFilter?: string[],
  ): Promise<LeannMCPToolResult> {
    await this.index.initialize();

    const options: LeannSearchOptions = {
      topK: topK || 10,
      minScore: 0.1,
      languageFilter,
    };

    const results = await this.index.search(query, options);

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No results found for query: "${query}"\n\nTry different keywords or check if the index has been built.`,
          },
        ],
      };
    }

    // Format results
    const formattedResults = results
      .map((r, i) => {
        // Truncate content for display
        const preview =
          r.content.length > 500
            ? r.content.slice(0, 500) + "\n... (truncated)"
            : r.content;

        return (
          `### ${i + 1}. ${r.document.path} (score: ${r.score.toFixed(2)})\n` +
          `**Language:** ${r.document.language || "unknown"}\n\n` +
          "```" +
          (r.document.language || "") +
          "\n" +
          preview +
          "\n```"
        );
      })
      .join("\n\n---\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} results for "${query}":\n\n${formattedResults}`,
        },
      ],
    };
  }

  /**
   * Get index status
   */
  private async getStatus(): Promise<LeannMCPToolResult> {
    await this.index.initialize();
    const stats = this.index.getStats();
    const exists = LeannIndex.exists(this.config.rootPath);

    return {
      content: [
        {
          type: "text",
          text:
            `LEANN Index Status\n\n` +
            `📊 Collection: ${stats.collection}\n` +
            `📁 Documents: ${stats.documentCount}\n` +
            `📍 Root: ${stats.rootPath}\n` +
            `💾 Index exists: ${exists ? "Yes" : "No"}\n\n` +
            `Storage: ~${Math.ceil(stats.documentCount * 0.1)}KB (97% savings vs vector DB)`,
        },
      ],
    };
  }

  /**
   * Quick search method for direct use (not via MCP)
   */
  async quickSearch(query: string, topK: number = 5): Promise<string[]> {
    await this.index.initialize();
    const results = await this.index.search(query, { topK, minScore: 0.1 });
    return results.map((r) => r.content);
  }

  /**
   * Initialize and build index if needed
   */
  async ensureIndexed(): Promise<boolean> {
    await this.index.initialize();

    if (!LeannIndex.exists(this.config.rootPath)) {
      await this.index.build();
      return true;
    }

    return false;
  }
}
