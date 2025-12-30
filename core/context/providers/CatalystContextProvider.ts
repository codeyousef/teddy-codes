import * as fs from "fs";
import * as path from "path";
import {
  ContextItem,
  ContextProviderDescription,
  ContextProviderExtras,
  ContextSubmenuItem,
  LoadSubmenuItemsArgs,
} from "../../index.js";
import { BaseContextProvider } from "../index.js";

export class CatalystContextProvider extends BaseContextProvider {
  static description: ContextProviderDescription = {
    title: "catalyst",
    displayTitle: "Catalyst Constitution",
    description: "Project Constitution (CATALYST.md)",
    type: "normal",
  };

  async getContextItems(
    query: string,
    extras: ContextProviderExtras,
  ): Promise<ContextItem[]> {
    const workspaceDirs = await extras.ide.getWorkspaceDirs();
    const items: ContextItem[] = [];

    for (const dir of workspaceDirs) {
      const catalystPath = path.join(dir, "CATALYST.md");
      try {
        if (fs.existsSync(catalystPath)) {
          const content = fs.readFileSync(catalystPath, "utf8");
          items.push({
            name: "CATALYST.md",
            description: "Project Constitution",
            content: `You are Catalyst. You must follow these architectural rules:\n\n${content}`,
            uri: {
              type: "file",
              value: catalystPath,
            },
          });
        }
      } catch (e) {
        console.error(`Error reading CATALYST.md in ${dir}:`, e);
      }
    }

    return items;
  }

  async loadSubmenuItems(
    args: LoadSubmenuItemsArgs,
  ): Promise<ContextSubmenuItem[]> {
    return [];
  }
}
