import * as path from "path";
import { SlashCommand } from "../../../index.js";

export const ImplementCommand: SlashCommand = {
  name: "implement",
  description: "Implement the next unchecked task in tasks.md",
  run: async function* ({ ide, llm, input }) {
    const workspaceDirs = await ide.getWorkspaceDirs();
    if (workspaceDirs.length === 0) {
      yield "No workspace open.";
      return;
    }
    const rootDir = workspaceDirs[0];
    const tasksPath = path.join(rootDir, "tasks.md");

    let tasksContent = "";
    try {
      tasksContent = await ide.readFile(tasksPath);
    } catch (e) {
      yield "Error: `tasks.md` not found. Please run `/tasks` first.";
      return;
    }

    // Find next unchecked task
    const lines = tasksContent.split("\n");
    const taskIndex = lines.findIndex((line) =>
      line.trim().startsWith("- [ ]"),
    );

    if (taskIndex === -1) {
      yield "All tasks appear to be completed!";
      return;
    }

    const task = lines[taskIndex].replace("- [ ]", "").trim();
    yield `Implementing task: **${task}**\n\n`;

    // Fetch context (plan, spec, relevant files could be added here)
    const prompt = `You are an expert developer. Implement the following task: "${task}".
    
    Please provide the code changes required. Use standard markdown code blocks.`;

    const gen = llm.streamComplete(prompt, new AbortController().signal);
    for await (const chunk of gen) {
      yield chunk;
    }
  },
};
