import * as path from "path";
import { SlashCommand } from "../../../index.js";

export const SpecifyCommand: SlashCommand = {
  name: "specify",
  description: "Generate a technology-agnostic spec.md file",
  run: async function* ({ ide, llm, input }) {
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) {
      yield "No workspace open.";
      return;
    }
    const rootDir = workspaceDirs[0];
    const specPath = path.join(rootDir, "spec.md");

    yield "Generating spec.md based on your request...\n";

    const prompt = `You are an expert software architect. Create a detailed, technology-agnostic specification (spec.md) for the following feature request: "${input}".
    
    The spec should include:
    1.  **Goal**: High-level objective.
    2.  **User Stories**: Functional requirements.
    3.  **Non-Functional Requirements**: Performance, security, etc.
    4.  **Edge Cases**: Potential pitfalls.
    
    Do not include implementation details or code. Output ONLY the markdown content for the file.`;

    const gen = llm.streamComplete(prompt, new AbortController().signal);
    let content = "";
    for await (const chunk of gen) {
      content += chunk;
      yield chunk;
    }

    await ide.writeFile(specPath, content);
    await ide.openFile(specPath);
    yield "\n\n`spec.md` has been created and opened.";
  },
};
