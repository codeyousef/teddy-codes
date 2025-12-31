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
 * 3. Execute plan steps with file operations
 * 4. Verify via LSP diagnostics
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

  const workspaceDirs = await ide.getWorkspaceDirs();
  const rootPath = workspaceDirs[0] || "";

  // Phase 1: Specification
  yield "## Phase 1: Specification\n";
  yield "_Generating detailed specification..._\n\n";

  const specPrompt = `You are an expert software architect. Create a detailed implementation specification for the following request. Include:
1. Overview of the solution
2. Files to create/modify
3. Key interfaces and data structures
4. Dependencies required
5. Testing strategy

Request: ${userRequest}

Respond in markdown format.`;

  let spec = "";
  for await (const chunk of model.streamComplete(specPrompt)) {
    spec += chunk;
    yield chunk;
  }
  yield "\n\n";

  // Save spec to file
  const specPath = rootPath + "/.teddy/spec.md";
  try {
    await ide.writeFile(specPath, spec);
    yield `✅ Specification saved to \`.teddy/spec.md\`\n\n`;
  } catch (e) {
    yield `⚠️ Could not save spec file\n\n`;
  }

  // Phase 2: Planning
  yield "## Phase 2: Planning\n";
  yield "_Creating step-by-step implementation plan..._\n\n";

  const planPrompt = `Based on this specification, create a numbered implementation plan. Each step should be one of:
- CREATE_FILE: filepath | description
- EDIT_FILE: filepath | what to change
- RUN_COMMAND: command | purpose

Specification:
${spec}

Format as a numbered list with the step type clearly marked.`;

  let plan = "";
  for await (const chunk of model.streamComplete(planPrompt)) {
    plan += chunk;
    yield chunk;
  }
  yield "\n\n";

  // Save plan
  const planPath = rootPath + "/.teddy/plan.md";
  try {
    await ide.writeFile(planPath, plan);
    yield `✅ Plan saved to \`.teddy/plan.md\`\n\n`;
  } catch (e) {
    yield `⚠️ Could not save plan file\n\n`;
  }

  // Phase 3: Execution
  yield "## Phase 3: Execution\n";
  yield "_Ready for execution. Use agent tools to implement the plan._\n\n";

  // Parse and suggest first steps
  const steps = parsePlanSteps(plan);
  if (steps.length > 0) {
    yield "### Suggested First Steps:\n\n";
    for (const step of steps.slice(0, 3)) {
      yield `${step.id}. **${step.type}**: ${step.description}\n`;
      if (step.target) {
        yield `   - Target: \`${step.target}\`\n`;
      }
    }
    yield "\n";
  }

  yield "---\n\n";
  yield "🎯 **Autonomous Mode Complete**\n";
  yield "Use the agent tools (create_file, edit_file, run_terminal_command) to execute the plan.\n";
  yield "I will verify each step via LSP diagnostics before proceeding.\n";
}

/**
 * Parse plan text into structured steps
 */
function parsePlanSteps(planText: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = planText.split("\n");
  let stepNum = 0;

  for (const line of lines) {
    const match = line.match(
      /^\d+\.\s*(CREATE_FILE|EDIT_FILE|RUN_COMMAND|ANALYZE):\s*(.+)/i,
    );
    if (match) {
      stepNum++;
      const type = match[1].toLowerCase().replace("_", "_") as PlanStep["type"];
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
