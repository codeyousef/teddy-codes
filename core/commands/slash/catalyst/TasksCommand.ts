import * as path from "path";
import { SlashCommand } from "../../../index.js";

export const TasksCommand: SlashCommand = {
  name: "tasks",
  description: "Generate a tasks.md checklist from plan.md",
  run: async function* ({ ide, llm, input }) {
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) {
      yield "No workspace open.";
      return;
    }
    const rootDir = workspaceDirs[0];
    const planPath = path.join(rootDir, "plan.md");
    const tasksPath = path.join(rootDir, "tasks.md");

    let planContent = "";
    try {
      planContent = await ide.readFile(planPath);
    } catch (e) {
      yield "Error: `plan.md` not found. Please run `/plan` first.";
      return;
    }

    yield "Generating tasks.md...\n";

    const prompt = `You are a project manager. Convert the following implementation plan into a granular checklist of atomic tasks (tasks.md).
    
    --- PLAN.MD ---
    ${planContent}
    --- END PLAN.MD ---

    Format as a markdown checklist:
    - [ ] Task 1
    - [ ] Task 2

    Output ONLY the markdown content for the file.`;

    const gen = llm.streamComplete(prompt, new AbortController().signal);
    let content = "";
    for await (const chunk of gen) {
      content += chunk;
      yield chunk;
    }

    await ide.writeFile(tasksPath, content);
    await ide.openFile(tasksPath);
    yield "\n\n`tasks.md` has been created and opened.";
  },
};
