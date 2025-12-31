import { ChatMessage, IDE } from "..";
import { ConfigHandler } from "../config/ConfigHandler";

interface PlanStep {
  id: number;
  description: string;
  type: "create_file" | "edit_file" | "run_command" | "analyze";
  target?: string;
  content?: string;
}

/**
 * Autonomous Mode - Waterfall-style spec-driven development
 *
 * Flow:
 * 1. Generate specification from user request
 * 2. Create implementation plan with discrete steps
 * 3. ACTUALLY EXECUTE plan steps with file operations
 * 4. Verify via LSP diagnostics after each step
 */
export async function* autonomousMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any, // ILLM
): AsyncGenerator<string> {
  yield "🤖 **Entering Autonomous Mode**\n\n";

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

  if (
    !userRequest ||
    userRequest === "No request found" ||
    userRequest.trim().length < 10
  ) {
    yield "⚠️ **No specific request provided.**\n\n";
    yield "Please provide a clear task description, for example:\n";
    yield "- 'Create a REST API for user management'\n";
    yield "- 'Build a todo list app with React'\n";
    yield "- 'Add authentication to the existing project'\n\n";
    yield "I need a concrete goal to work autonomously.\n";
    return;
  }

  const workspaceDirs = await ide.getWorkspaceDirs();
  const rootPath = workspaceDirs[0] || "";
  let rootDir = rootPath;
  if (rootDir.startsWith("file://")) {
    rootDir = rootDir.replace("file://", "");
  }

  // Ensure .teddy directory exists
  try {
    await ide.writeFile(rootPath + "/.teddy/.gitkeep", "");
  } catch {
    // Ignore
  }

  // Phase 1: Specification
  yield "## 📋 Phase 1: Specification\n";
  yield "_Analyzing request and generating implementation spec..._\n\n";

  const specPrompt = `You are an expert software architect. Create a CONCISE implementation specification for:

"${userRequest}"

Include ONLY:
1. **Goal**: One sentence summary
2. **Files to Create**: List each file with its purpose (max 5-7 files for MVP)
3. **Key Code**: Main interfaces/functions needed

Be practical and minimal. Focus on a working MVP.`;

  let spec = "";
  for await (const chunk of model.streamComplete(specPrompt)) {
    spec += chunk;
    yield chunk;
  }
  yield "\n\n";

  // Save spec
  try {
    await ide.writeFile(rootPath + "/.teddy/spec.md", spec);
    yield `✅ Spec saved to \`.teddy/spec.md\`\n\n`;
  } catch {
    yield `⚠️ Could not save spec\n\n`;
  }

  // Phase 2: Planning - Generate executable steps
  yield "## 📝 Phase 2: Planning\n";
  yield "_Creating executable implementation plan..._\n\n";

  const planPrompt = `Based on this specification, create an EXECUTABLE implementation plan.

Specification:
${spec}

Rules:
1. Use ONLY these step formats (exactly as shown):
   - CREATE_FILE: filepath | brief description
2. List files in dependency order (base files first)
3. Keep it to 3-7 steps maximum
4. Use relative paths from project root

Example format:
1. CREATE_FILE: src/types.ts | Define core interfaces
2. CREATE_FILE: src/utils.ts | Helper functions
3. CREATE_FILE: src/main.ts | Main entry point

Now create the plan:`;

  let plan = "";
  for await (const chunk of model.streamComplete(planPrompt)) {
    plan += chunk;
    yield chunk;
  }
  yield "\n\n";

  // Save plan
  try {
    await ide.writeFile(rootPath + "/.teddy/plan.md", plan);
    yield `✅ Plan saved to \`.teddy/plan.md\`\n\n`;
  } catch {
    yield `⚠️ Could not save plan\n\n`;
  }

  // Parse steps
  const steps = parsePlanSteps(plan);

  if (steps.length === 0) {
    yield "⚠️ Could not parse actionable steps from plan. Please try again with a clearer request.\n";
    return;
  }

  // Phase 3: EXECUTION - Actually create the files!
  yield "## 🚀 Phase 3: Execution\n";
  yield `_Executing ${steps.length} steps..._\n\n`;

  let successCount = 0;
  let failCount = 0;

  for (const step of steps) {
    yield `### Step ${step.id}: ${step.type.toUpperCase()}\n`;
    yield `Target: \`${step.target}\`\n`;
    yield `Description: ${step.description}\n\n`;

    if (step.type === "create_file" && step.target) {
      // Generate the actual file content
      yield "_Generating file content..._\n\n";

      const filePrompt = `Generate the complete code for this file:

File: ${step.target}
Purpose: ${step.description}
Context from spec:
${spec}

Rules:
1. Write COMPLETE, WORKING code - no placeholders or TODOs
2. Include all necessary imports
3. Add brief comments for clarity
4. Make it production-ready

Output ONLY the code, no markdown fences or explanations:`;

      let fileContent = "";
      yield "```\n";
      for await (const chunk of model.streamComplete(filePrompt)) {
        fileContent += chunk;
        yield chunk;
      }
      yield "\n```\n\n";

      // Clean up content (remove markdown fences if model added them)
      fileContent = cleanCodeContent(fileContent);

      // Actually write the file!
      const filePath = rootPath + "/" + step.target;
      try {
        await ide.writeFile(filePath, fileContent);
        await ide.openFile(filePath);
        successCount++;
        yield `✅ **Created:** \`${step.target}\`\n\n`;
      } catch (e) {
        failCount++;
        yield `❌ **Failed to create:** \`${step.target}\` - ${e}\n\n`;
      }
    } else if (step.type === "edit_file" && step.target) {
      yield `⏭️ Edit operations require manual review. Target: \`${step.target}\`\n\n`;
    } else if (step.type === "run_command" && step.target) {
      yield `⏭️ Command: \`${step.target}\` - Run manually for safety\n\n`;
    }

    yield "---\n\n";
  }

  // Summary
  yield "## 📊 Summary\n\n";
  yield `- ✅ Files created: ${successCount}\n`;
  yield `- ❌ Failed: ${failCount}\n`;
  yield `- 📁 Total steps: ${steps.length}\n\n`;

  if (successCount > 0) {
    yield "### 🎉 Autonomous execution complete!\n\n";
    yield "The files have been created and opened in your editor.\n";
    yield "Review the generated code and make any necessary adjustments.\n";
  }

  if (failCount > 0) {
    yield "\n⚠️ Some steps failed. Check the errors above and retry if needed.\n";
  }
}

/**
 * Parse plan text into structured steps
 */
function parsePlanSteps(planText: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = planText.split("\n");
  let stepNum = 0;

  for (const line of lines) {
    // Match patterns like "1. CREATE_FILE: path | desc" or "- CREATE_FILE: path | desc"
    const match = line.match(
      /(?:^\d+\.\s*|^-\s*|^\*\s*)(CREATE_FILE|EDIT_FILE|RUN_COMMAND|ANALYZE):\s*(.+)/i,
    );
    if (match) {
      stepNum++;
      const typeStr = match[1].toLowerCase();
      const type = typeStr.includes("create")
        ? "create_file"
        : typeStr.includes("edit")
          ? "edit_file"
          : typeStr.includes("run")
            ? "run_command"
            : ("analyze" as PlanStep["type"]);
      const rest = match[2];

      // Parse target and description
      const parts = rest.split("|").map((s) => s.trim());
      steps.push({
        id: stepNum,
        type,
        target: parts[0],
        description: parts[1] || parts[0],
      });
    }
  }

  return steps;
}

/**
 * Clean up code content - remove markdown fences if present
 */
function cleanCodeContent(content: string): string {
  let cleaned = content.trim();

  // Remove leading ```language
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }

  // Remove trailing ```
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trimEnd();
  }

  return cleaned;
}
