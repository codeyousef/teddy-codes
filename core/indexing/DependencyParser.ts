import * as fs from "node:fs";
import * as path from "node:path";

export interface Dependency {
  name: string;
  version: string;
}

export class DependencyParser {
  static parsePackageJson(content: string): Dependency[] {
    try {
      const json = JSON.parse(content);
      const deps = { ...json.dependencies, ...json.devDependencies };
      return Object.entries(deps).map(([name, version]) => ({
        name,
        version: version as string,
      }));
    } catch (e) {
      console.error("Error parsing package.json:", e);
      return [];
    }
  }

  static parseRequirementsTxt(content: string): Dependency[] {
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const parts = line.split("==");
        return {
          name: parts[0],
          version: parts[1] || "latest",
        };
      });
  }

  static async scanWorkspace(workspaceDirs: string[]): Promise<Dependency[]> {
    const dependencies: Dependency[] = [];
    for (const dir of workspaceDirs) {
      const packageJsonPath = path.join(dir, "package.json");
      if (fs.existsSync(packageJsonPath)) {
        const content = fs.readFileSync(packageJsonPath, "utf8");
        dependencies.push(...this.parsePackageJson(content));
      }

      const requirementsTxtPath = path.join(dir, "requirements.txt");
      if (fs.existsSync(requirementsTxtPath)) {
        const content = fs.readFileSync(requirementsTxtPath, "utf8");
        dependencies.push(...this.parseRequirementsTxt(content));
      }
    }
    // Deduplicate
    const uniqueDeps = new Map<string, Dependency>();
    dependencies.forEach((d) => uniqueDeps.set(d.name, d));
    return Array.from(uniqueDeps.values());
  }
}
