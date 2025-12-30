import * as path from "path";
import { SlashCommand } from "../../../index.js";

export const PlanCommand: SlashCommand = {
  name: "plan",
  description: "Generate a plan.md based on spec.md and CATALYST.md",
  run: async function* ({ ide, llm, input }) {
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) {
      yield "No workspace open.";
      return;
    }
    const rootDir = workspaceDirs[0];
    const specPath = path.join(rootDir, "spec.md");
    const catalystPath = path.join(rootDir, "CATALYST.md");
    const planPath = path.join(rootDir, "plan.md");

    let specContent = "";
    try {
      specContent = await ide.readFile(specPath);
    } catch (e) {
      yield "Error: `spec.md` not found. Please run `/specify` first.";
      return;
    }

    let catalystContent = "";
    try {
      catalystContent = await ide.readFile(catalystPath);
    } catch (e) {
      // Optional
    }

    yield "Generating plan.md...\n";

    const prompt = `You are an expert software architect. Create a detailed implementation plan (plan.md) based on the following specification:
    
    --- SPEC.MD ---
    ${specContent}
    --- END SPEC.MD ---

    ${
      catalystContent
        ? `
    --- ARCHITECTURAL RULES (CATALYST.md) ---
    ${catalystContent}
    --- END RULES ---
    `
        : ""
    }

    The plan should include:
    1.  **Architecture**: High-level design.
    2.  **Tech Stack**: Libraries and tools (adhering to rules).
    3.  **File Structure**: List of files to create or modify.
    4.  **Step-by-Step Implementation**: Logical order of operations.

    Output ONLY the markdown content for the file.`;

    const gen = llm.streamComplete(prompt, new AbortController().signal);
    let content = "";
    for await (const chunk of gen) {
      content += chunk;
      yield chunk;
    }

    await ide.writeFile(planPath, content);
    await ide.openFile(planPath);
    yield "\n\n`plan.md` has been created and opened.";
  },
};
