import { join } from "path";
import * as YAML from "yaml";
import { IDE } from "../index.js";
import { IAgentSkill, SkillFrontmatter } from "./types.js";

export class SkillService {
  private static instance: SkillService;
  private skills: Map<string, IAgentSkill> = new Map();
  private ide: IDE | undefined;

  private constructor() {}

  public static getInstance(): SkillService {
    if (!SkillService.instance) {
      SkillService.instance = new SkillService();
    }
    return SkillService.instance;
  }

  public setIde(ide: IDE) {
    this.ide = ide;
  }

  private async scanSkills() {
    if (!this.ide) return;

    this.skills.clear();

    // We look for .teddy/skills in workspace directories
    const workspaceDirs = await this.ide.getWorkspaceDirs();

    for (const dir of workspaceDirs) {
      const skillsDir = join(dir, ".teddy", "skills");
      try {
        const entries = await this.ide.listDir(skillsDir);
        for (const [name, type] of entries) {
          // type 2 is Directory (FileType.Directory)
          if (type === 2) {
            const skillFile = join(skillsDir, name, "SKILL.md");
            if (await this.ide.fileExists(skillFile)) {
              const content = await this.ide.readFile(skillFile);
              const { frontmatter, body } = this.parseSkill(content);

              if (frontmatter.name && frontmatter.description) {
                this.skills.set(name, {
                  id: name,
                  name: frontmatter.name,
                  description: frontmatter.description,
                  content: body,
                });
              }
            }
          }
        }
      } catch (e) {
        // Ignore if directory doesn't exist or other errors
      }
    }
  }

  private parseSkill(content: string): {
    frontmatter: SkillFrontmatter;
    body: string;
  } {
    const normalizedContent = content.replace(/\r\n/g, "\n");
    const parts = normalizedContent.split(/^---\s*$/m);
    if (parts.length >= 3) {
      const frontmatterStr = parts[1];
      const body = parts.slice(2).join("---").trim();
      try {
        const frontmatter = YAML.parse(frontmatterStr) as SkillFrontmatter;
        return { frontmatter, body };
      } catch (e) {
        return { frontmatter: { name: "", description: "" }, body: content };
      }
    }
    return { frontmatter: { name: "", description: "" }, body: content };
  }

  public async getSystemPromptSnippet(ide: IDE): Promise<string> {
    this.setIde(ide);
    await this.scanSkills();

    if (this.skills.size === 0) return "";

    let snippet = "\n\n<available_skills>\n";
    for (const skill of this.skills.values()) {
      snippet += `- ${skill.name} (ID: ${skill.id}): ${skill.description}\n`;
    }
    snippet += "</available_skills>\n";
    snippet +=
      "To activate a skill, use the activate_skill tool with the skill ID.";

    return snippet;
  }

  public async activateSkill(id: string, ide: IDE): Promise<string> {
    this.setIde(ide);
    // Optional: rescan if not found? Or assume scan happened at prompt generation.
    // Let's try to get it from cache first.
    let skill = this.skills.get(id);

    if (!skill) {
      // Try scanning again just in case
      await this.scanSkills();
      skill = this.skills.get(id);
    }

    if (!skill) {
      return `Skill with ID "${id}" not found.`;
    }

    return `<skill id="${skill.id}">\n${skill.content}\n</skill>`;
  }
}
