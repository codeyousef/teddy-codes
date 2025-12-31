import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
} from "../../index";
import { BaseContextProvider } from "../index";

export class LeannContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "LEANN",
    displayTitle: "LEANN",
    description: "Low-storage automated context",
    type: "normal",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    // TODO: Connect to LEANN MCP Server
    // For now, we'll return a placeholder or try to fetch from a local server if running.

    return [
      {
        name: "LEANN Context",
        description: "Context retrieved from LEANN",
        content: "LEANN context placeholder for query: " + query,
      },
    ];
  }
}
