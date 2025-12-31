import { IDE } from "..";
import { getSymbolsForManyFiles } from "../util/treeSitter";
import { walkDir } from "./walkDir";

export class RepoMap {
  private ide: IDE;

  constructor(ide: IDE) {
    this.ide = ide;
  }

  async generate(): Promise<string> {
    const workspaceDirs = await this.ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) return "";

    const root = workspaceDirs[0];
    // walkDir might return absolute paths
    const files = await walkDir(root, this.ide);

    // Filter for supported extensions (simplified)
    const sourceFiles = files.filter(
      (f) =>
        f.endsWith(".ts") ||
        f.endsWith(".tsx") ||
        f.endsWith(".js") ||
        f.endsWith(".jsx") ||
        f.endsWith(".py") ||
        f.endsWith(".java") ||
        f.endsWith(".go") ||
        f.endsWith(".rs") ||
        f.endsWith(".cpp") ||
        f.endsWith(".c") ||
        f.endsWith(".h"),
    );

    // Limit to top 100 files for now to avoid blowing up
    const limitedFiles = sourceFiles.slice(0, 100);

    const symbolMap = await getSymbolsForManyFiles(limitedFiles, this.ide);

    let map = "# Repo Map\n\n";

    for (const [file, symbols] of Object.entries(symbolMap)) {
      const relativePath = file.replace(root, "").replace(/^\//, "");
      map += `## ${relativePath}\n`;
      for (const symbol of symbols) {
        map += `- ${symbol.name} (${symbol.type})\n`;
      }
      map += "\n";
    }

    return map;
  }
}
