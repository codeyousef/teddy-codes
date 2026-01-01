import { ChatMessage, IDE, MessagePart } from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import {
  FileSnapshot,
  TaskAnalyzer,
  VerificationContext,
  VerificationEngine,
} from "./verification/index.js";

// Verification settings
const MAX_VERIFICATION_ATTEMPTS = 10; // High limit as safety valve, not primary stopping condition
const VERIFICATION_ENABLED = true;

interface PlanStep {
  id: number;
  description: string;
  type: "create_file" | "edit_file" | "run_command" | "analyze" | "insert_code";
  target?: string;
  content?: string;
  codeBlock?: string;
}

interface ExtractedContent {
  contextContent: string;
  userInstruction: string;
  fullContent: string;
}

interface PlanDetection {
  isPlanDocument: boolean;
  steps: PlanStep[];
  format: "teddy_spec" | "numbered_steps" | "simple" | null;
}

// ============================================================================
// CONTENT EXTRACTION
// ============================================================================

function extractTextContent(message: ChatMessage): ExtractedContent {
  if (!message || !message.content) {
    return { contextContent: "", userInstruction: "", fullContent: "" };
  }

  if (typeof message.content === "string") {
    return {
      contextContent: "",
      userInstruction: message.content,
      fullContent: message.content,
    };
  }

  if (Array.isArray(message.content)) {
    const parts = message.content as MessagePart[];
    const textParts = parts
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text);

    if (textParts.length === 0) {
      return { contextContent: "", userInstruction: "", fullContent: "" };
    }

    if (textParts.length === 1) {
      return {
        contextContent: "",
        userInstruction: textParts[0],
        fullContent: textParts[0],
      };
    }

    const contextParts = textParts.slice(0, -1);
    const instructionPart = textParts[textParts.length - 1];

    return {
      contextContent: contextParts.join("\n\n"),
      userInstruction: instructionPart,
      fullContent: textParts.join("\n\n"),
    };
  }

  return { contextContent: "", userInstruction: "", fullContent: "" };
}

// ============================================================================
// PLAN DOCUMENT DETECTION & PARSING
// ============================================================================

/**
 * Detect if the context is a structured plan document with executable steps
 */
function detectPlanDocument(content: string): PlanDetection {
  if (!content || content.length < 100) {
    return { isPlanDocument: false, steps: [], format: null };
  }

  // Check for Teddy spec format markers
  const teddyMarkers = [
    /\*\*Target(?:\s*File)?:\*\*/i,
    /\*\*Action:\*\*/i,
    /\*\*Implementation Logic:\*\*/i,
    /\*\*Goal:\*\*/i,
    /##\s*Step\s*\d+/i,
    /###\s*Task\s*[A-Z]:/i,
  ];

  const hasTeddyFormat =
    teddyMarkers.filter((r) => r.test(content)).length >= 2;

  // Check for numbered implementation steps
  const hasNumberedSteps =
    /^\s*\d+\.\s*\*\*[^*]+\*\*/.test(content) ||
    /^\s*\d+\.\s*\*\*(?:Locate|Create|Add|Modify|Update|Insert|Remove)/im.test(
      content,
    );

  // Check for simple CREATE_FILE format
  const hasSimpleFormat = /(CREATE_FILE|EDIT_FILE|RUN_COMMAND):\s*[^\n]+/i.test(
    content,
  );

  // Check for code blocks that should be inserted
  const hasCodeBlocks = /```\w+\n[\s\S]+?```/.test(content);

  if (hasTeddyFormat || (hasNumberedSteps && hasCodeBlocks)) {
    const steps = parseTeddySpecSteps(content);
    if (steps.length > 0) {
      return { isPlanDocument: true, steps, format: "teddy_spec" };
    }
  }

  if (hasSimpleFormat) {
    const steps = parseSimplePlanSteps(content);
    if (steps.length > 0) {
      return { isPlanDocument: true, steps, format: "simple" };
    }
  }

  return { isPlanDocument: false, steps: [], format: null };
}

/**
 * Parse Teddy spec format - extracts steps from structured markdown
 * AGGRESSIVE parsing - if there's a code block, it's actionable
 */
function parseTeddySpecSteps(content: string): PlanStep[] {
  const steps: PlanStep[] = [];
  let stepNum = 0;
  const processedRanges: Array<{ start: number; end: number }> = [];

  // Helper: Check if position was already processed
  const isProcessed = (pos: number) =>
    processedRanges.some((r) => pos >= r.start && pos < r.end);

  // ==========================================================================
  // PATTERN 1: ## Step N: Title sections (highest priority)
  // ==========================================================================
  const stepHeaderPattern =
    /##\s*Step\s*(\d+):\s*([^\n]+)\n([\s\S]*?)(?=##\s*Step\s*\d|##\s*Acceptance|$)/gi;
  let match;

  while ((match = stepHeaderPattern.exec(content)) !== null) {
    const stepTitle = match[2].trim();
    const stepContent = match[3];
    const startPos = match.index;
    const endPos = startPos + match[0].length;

    // Extract target from **Target File:** pattern
    const targetMatch = stepContent.match(
      /\*\*Target(?:\s*File)?:\*\*\s*(?:`([^`]+)`|(\S+\.\w+))/i,
    );
    const target = targetMatch ? targetMatch[1] || targetMatch[2] : undefined;

    // Extract ALL code blocks in this section
    const codeBlocks = [...stepContent.matchAll(/```(\w*)\n([\s\S]*?)```/g)];

    if (codeBlocks.length > 0) {
      for (const codeBlock of codeBlocks) {
        const lang = codeBlock[1]?.toLowerCase() || "";
        const code = codeBlock[2].trim();

        stepNum++;

        // Bash/shell commands
        if (lang === "bash" || lang === "sh" || lang === "shell") {
          steps.push({
            id: stepNum,
            type: "run_command",
            target: code.split("\n")[0], // First line is the command
            description: stepTitle,
            codeBlock: code,
          });
        }
        // Code for a target file - check if modification or new code
        else if (target) {
          // Use edit_file for modifications, insert_code for additions
          const stepType = isModificationStep(stepTitle)
            ? "edit_file"
            : "insert_code";
          steps.push({
            id: stepNum,
            type: stepType,
            target,
            description: stepTitle,
            codeBlock: code,
          });
        }
        // Code without explicit target - try to infer
        else {
          const inferredTarget = inferTargetFromCode(code, lang);
          if (inferredTarget) {
            const stepType = isModificationStep(stepTitle)
              ? "edit_file"
              : "insert_code";
            steps.push({
              id: stepNum,
              type: stepType,
              target: inferredTarget,
              description: stepTitle,
              codeBlock: code,
            });
          }
        }
      }
      processedRanges.push({ start: startPos, end: endPos });
    }
  }

  // ==========================================================================
  // PATTERN 2: **Target File:** `path` blocks
  // ==========================================================================
  const targetFilePattern =
    /\*\*Target(?:\s*File)?:\*\*\s*(?:`([^`]+)`|(\S+\.\w+))([\s\S]*?)(?=\*\*Target|##\s*Step|$)/gi;

  while ((match = targetFilePattern.exec(content)) !== null) {
    if (isProcessed(match.index)) continue;

    const target = match[1] || match[2];
    const sectionContent = match[3];

    // Extract action from the section (look for **Action:** pattern)
    const actionMatch = sectionContent.match(/\*\*Action:\*\*\s*([^\n]+)/i);
    const actionDesc = actionMatch ? actionMatch[1].trim() : `Modify ${target}`;

    // Find code blocks after this target
    const codeMatch = sectionContent.match(/```(\w*)\n([\s\S]*?)```/);

    if (codeMatch) {
      const lang = codeMatch[1]?.toLowerCase() || "";
      const code = codeMatch[2].trim();

      // Skip if bash - will be handled as command
      if (lang !== "bash" && lang !== "sh") {
        stepNum++;
        // Use edit_file for modifications, insert_code for additions
        const stepType = isModificationStep(actionDesc)
          ? "edit_file"
          : "insert_code";
        steps.push({
          id: stepNum,
          type: stepType,
          target,
          description: actionDesc,
          codeBlock: code,
        });
        processedRanges.push({
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }

  // ==========================================================================
  // PATTERN 3: Standalone ```bash blocks (commands to run)
  // ==========================================================================
  const bashPattern = /```(?:bash|sh|shell)\n([\s\S]*?)```/gi;

  while ((match = bashPattern.exec(content)) !== null) {
    if (isProcessed(match.index)) continue;

    const commands = match[1].trim();
    // Split into individual commands
    const cmdLines = commands
      .split("\n")
      .filter((l) => l.trim() && !l.trim().startsWith("#"));

    for (const cmd of cmdLines) {
      stepNum++;
      steps.push({
        id: stepNum,
        type: "run_command",
        target: cmd.trim(),
        description: `Run: ${cmd.trim().slice(0, 50)}`,
        codeBlock: cmd.trim(),
      });
    }
    processedRanges.push({
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  // ==========================================================================
  // PATTERN 4: Numbered instruction steps with inline code targets
  // ==========================================================================
  const numberedPattern =
    /^\s*(\d+)\.\s*\*\*([^*]+)\*\*[:\s]*([^\n]*(?:\n(?!\s*\d+\.\s*\*\*)[^\n]*)*)/gm;

  while ((match = numberedPattern.exec(content)) !== null) {
    if (isProcessed(match.index)) continue;

    const title = match[2].trim();
    const details = match[3].trim();
    const fullSection = match[0];

    // Look for code blocks in this numbered section
    const codeMatch = fullSection.match(/```(\w*)\n([\s\S]*?)```/);

    // Extract target file from details
    const fileMatch = details.match(
      /(?:in|to|at|from|file)\s+(?:`([^`]+)`|(\S+\.\w+))/i,
    );
    const target = fileMatch ? fileMatch[1] || fileMatch[2] : undefined;

    // If has code block, it's actionable
    if (codeMatch) {
      const lang = codeMatch[1]?.toLowerCase() || "";
      const code = codeMatch[2].trim();

      stepNum++;

      if (lang === "bash" || lang === "sh" || lang === "shell") {
        steps.push({
          id: stepNum,
          type: "run_command",
          target: code.split("\n")[0],
          description: title,
          codeBlock: code,
        });
      } else if (target) {
        // Use edit_file for modifications, insert_code for additions
        const stepType = isModificationStep(title)
          ? "edit_file"
          : "insert_code";
        steps.push({
          id: stepNum,
          type: stepType,
          target,
          description: title,
          codeBlock: code,
        });
      } else {
        const inferredTarget = inferTargetFromCode(code, lang);
        const stepType = isModificationStep(title)
          ? "edit_file"
          : inferredTarget
            ? "insert_code"
            : "analyze";
        steps.push({
          id: stepNum,
          type: stepType,
          target: inferredTarget,
          description: title,
          codeBlock: code,
        });
      }
    }
    // No code block but has clear action verb + target
    else if (target && hasActionVerb(title)) {
      stepNum++;
      steps.push({
        id: stepNum,
        type: "edit_file",
        target,
        description: `${title}: ${details.slice(0, 150)}`,
      });
    }
    // Skip pure informational steps (no code, no clear target)
  }

  return steps;
}

/**
 * Check if title contains an action verb indicating modification
 */
function hasActionVerb(title: string): boolean {
  const lower = title.toLowerCase();
  const actionVerbs = [
    "add",
    "insert",
    "create",
    "modify",
    "update",
    "change",
    "edit",
    "implement",
    "fix",
    "remove",
    "delete",
    "replace",
    "refactor",
  ];
  return actionVerbs.some((v) => lower.includes(v));
}

/**
 * Detect if a step description indicates modification of existing code vs new code
 */
function isModificationStep(description: string): boolean {
  const lower = description.toLowerCase();
  const modifyKeywords = [
    "modify",
    "update",
    "change",
    "edit",
    "fix",
    "replace",
    "refactor",
    "remove",
    "delete",
    "rename",
    "move",
    "convert",
    "transform",
    "rewrite",
  ];
  // If the description indicates modification of existing code
  return modifyKeywords.some((k) => lower.includes(k));
}

/**
 * Try to infer target file from code content
 */
function inferTargetFromCode(code: string, lang: string): string | undefined {
  // Check for file path in first comment
  const commentMatch = code.match(
    /^(?:\/\/|#|--)\s*(?:file:|in:?)?\s*(\S+\.\w+)/i,
  );
  if (commentMatch) return commentMatch[1];

  // Check for module/package declaration
  if (lang === "rust" || lang === "rs") {
    const modMatch = code.match(/mod\s+(\w+)/);
    if (modMatch) return `${modMatch[1]}.rs`;
  }

  // Check for class/function that implies file
  if (lang === "typescript" || lang === "ts") {
    const classMatch = code.match(/(?:class|interface)\s+(\w+)/);
    if (classMatch) return `${classMatch[1]}.ts`;
  }

  return undefined;
}

/**
 * Parse simple format: CREATE_FILE: path | description
 */
function parseSimplePlanSteps(content: string): PlanStep[] {
  const steps: PlanStep[] = [];
  const lines = content.split("\n");
  let stepNum = 0;

  for (const line of lines) {
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

      // Parse target and description - support both "|" and " - " separators
      let target: string;
      let description: string;

      if (rest.includes("|")) {
        const parts = rest.split("|").map((s) => s.trim());
        target = parts[0];
        description = parts[1] || parts[0];
      } else if (rest.includes(" - ")) {
        const dashIdx = rest.indexOf(" - ");
        target = rest.slice(0, dashIdx).trim();
        description = rest.slice(dashIdx + 3).trim();
      } else {
        // No separator - entire thing is target, use as description too
        target = rest.trim();
        description = rest.trim();
      }

      // Clean up target path - remove any trailing description artifacts
      target = target.replace(/\s+[A-Z].*$/, "").trim();
      // Remove backticks if present
      target = target.replace(/^`|`$/g, "");

      steps.push({
        id: stepNum,
        type,
        target,
        description,
      });
    }
  }

  return steps;
}

/**
 * Check if instruction indicates user wants to execute a plan
 */
function wantsExecution(instruction: string): boolean {
  const lower = instruction.toLowerCase();
  const executionPhrases = [
    /\bexecute\b/,
    /\bimplement\b/,
    /\bfix\s+the\s+(next\s+)?(immediate\s+)?steps?\b/,
    /\bdo\s+(the\s+)?(next\s+)?steps?\b/,
    /\brun\s+(the\s+)?steps?\b/,
    /\bcarry\s+out\b/,
    /\bfollow\s+(this|the)\s+plan\b/,
    /\bapply\s+(these\s+)?steps?\b/,
    /\bstart\s+(the\s+)?implementation\b/,
    /\bperform\s+(the\s+)?steps?\b/,
  ];
  return executionPhrases.some((r) => r.test(lower));
}

// ============================================================================
// MAIN AUTONOMOUS MODE
// ============================================================================

export async function* autonomousMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any,
): AsyncGenerator<string> {
  yield "🤖 **Autonomous Mode - Zero Confirmation Execution**\n\n";

  // Extract user message content
  let extracted: ExtractedContent = {
    contextContent: "",
    userInstruction: "",
    fullContent: "",
  };
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user") {
      extracted = extractTextContent(msg);
      break;
    }
  }

  const { contextContent, userInstruction } = extracted;
  const hasContext = contextContent.length > 50;

  // Get workspace info
  const workspaceDirs = await ide.getWorkspaceDirs();
  const rootPath = workspaceDirs[0] || "";
  let rootDir = rootPath.replace(/^file:\/\//, "");

  // =========================================================================
  // PHASE 0: Detect Plan Document Execution
  // =========================================================================

  const planDetection = detectPlanDocument(contextContent);
  const userWantsExecution = wantsExecution(userInstruction);

  if (planDetection.isPlanDocument && userWantsExecution) {
    yield `## 🚀 **Plan Execution Mode**\n\n`;
    yield `_Detected **${planDetection.steps.length}** executable steps (format: ${planDetection.format})_\n`;
    yield `_Instruction: "${userInstruction}"_\n\n`;

    if (planDetection.steps.length === 0) {
      yield "⚠️ Could not parse actionable steps from the plan.\n";
      return;
    }

    // Execute each step with verification
    yield* executeStepsWithVerification(
      planDetection.steps,
      ide,
      model,
      rootDir,
      userInstruction,
    );
    return;
  }

  // =========================================================================
  // PHASE 1: Standard Autonomous Flow (Generate Spec → Plan → Execute)
  // =========================================================================

  if (!userInstruction || userInstruction.trim().length < 3) {
    yield "⚠️ **No instruction provided.**\n\n";
    yield "Usage examples:\n";
    yield "- `Create a REST API for users`\n";
    yield "- `implement the steps @PlanDocument.md`\n";
    yield "- `fix the next immediate steps @CurrentFile`\n";
    return;
  }

  yield `_Instruction: "${userInstruction.slice(0, 100)}..."_\n\n`;

  // Ensure .teddy directory
  try {
    await ide.writeFile(rootPath + "/.teddy/.gitkeep", "");
  } catch {
    /* ignore */
  }

  // Phase 1: Generate Spec
  yield "<details>\n<summary>📋 **Phase 1: Analyzing task...**</summary>\n\n";

  // Detect if this is a fix/edit task vs a create task
  const isEditTask = isModificationStep(userInstruction);

  const specPrompt = isEditTask
    ? `You are an expert developer. Analyze and create a CONCISE fix/edit spec for:

"${userInstruction}"

${hasContext ? `File/Context to fix:\n\`\`\`\n${contextContent.slice(0, 3000)}\n\`\`\`\n` : ""}

Include ONLY:
1. **Goal**: One sentence describing what needs to be fixed/changed
2. **Issues Found**: List each issue/error to fix
3. **Files to Edit**: List each file that needs modification
4. **Changes Required**: Describe the specific changes for each file

Be specific about WHAT to change and HOW.`
    : `You are an expert architect. Create a CONCISE implementation spec for:

"${userInstruction}"

${hasContext ? `Context:\n${contextContent.slice(0, 2000)}\n` : ""}

Include ONLY:
1. **Goal**: One sentence
2. **Files to Create/Edit**: List each file with purpose (max 5-7)
3. **Key Code**: Main interfaces/functions

Be practical. Focus on working MVP.`;

  let spec = "";
  for await (const chunk of model.streamComplete(specPrompt)) {
    spec += chunk;
    yield chunk;
  }
  yield "\n</details>\n\n";

  try {
    await ide.writeFile(rootPath + "/.teddy/spec.md", spec);
  } catch {
    /* ignore */
  }

  // Phase 2: Generate Plan
  yield "<details>\n<summary>📝 **Phase 2: Creating execution plan...**</summary>\n\n";

  const planPrompt = isEditTask
    ? `Based on this spec, create an executable plan to FIX/EDIT existing files.

Spec:
${spec}

Rules:
1. Use: EDIT_FILE: filepath | description of changes
2. Use: CREATE_FILE: filepath | description (only for new files if needed)
3. List in logical order
4. Max 7 steps
5. Use relative paths

Example:
1. EDIT_FILE: src/utils.ts | Fix null check in processData function
2. EDIT_FILE: src/main.ts | Update error handling
3. CREATE_FILE: src/types.ts | Add missing interface (only if new file needed)

Plan:`
    : `Based on this spec, create an executable plan.

Spec:
${spec}

Rules:
1. Use: CREATE_FILE: filepath | description (for new files)
2. Use: EDIT_FILE: filepath | description (for modifying existing files)
3. List in dependency order
4. Max 7 steps
5. Use relative paths

Example:
1. CREATE_FILE: src/types.ts | Core interfaces
2. CREATE_FILE: src/main.ts | Entry point
3. EDIT_FILE: src/config.ts | Update configuration

Plan:`;

  let plan = "";
  for await (const chunk of model.streamComplete(planPrompt)) {
    plan += chunk;
    yield chunk;
  }
  yield "\n</details>\n\n";

  try {
    await ide.writeFile(rootPath + "/.teddy/plan.md", plan);
  } catch {
    /* ignore */
  }

  const steps = parseSimplePlanSteps(plan);

  if (steps.length === 0) {
    yield "⚠️ No actionable steps parsed. Try again with clearer request.\n";
    return;
  }

  // Phase 3: Execute ALL steps without confirmation
  yield `## 🚀 Executing ${steps.length} steps...\n\n`;

  yield* executeStepsWithVerification(
    steps,
    ide,
    model,
    rootDir,
    userInstruction,
    spec,
  );
}

// ============================================================================
// STEP EXECUTION ENGINE WITH VERIFICATION
// ============================================================================

async function* executeStepsWithVerification(
  steps: PlanStep[],
  ide: IDE,
  model: any,
  rootDir: string,
  userInstruction: string,
  contextSpec?: string,
): AsyncGenerator<string> {
  // Skip verification if disabled
  if (!VERIFICATION_ENABLED) {
    yield* executeSteps(steps, ide, model, rootDir, contextSpec);
    return;
  }

  // Phase A: Capture file snapshots BEFORE execution
  const snapshots = new Map<string, Partial<FileSnapshot>>();
  const targetFiles = steps
    .filter(
      (s) => s.target && (s.type === "edit_file" || s.type === "insert_code"),
    )
    .map((s) => s.target!);

  for (const target of targetFiles) {
    const filePath = rootDir + "/" + target;
    try {
      const content = await ide.readFile(filePath);
      snapshots.set(target, VerificationEngine.createSnapshot(target, content));
    } catch {
      // File doesn't exist yet, will be created
      snapshots.set(target, VerificationEngine.createSnapshot(target, ""));
    }
  }

  // Phase B: Analyze task to extract success criteria
  const allBeforeContent = Array.from(snapshots.values())
    .map((s) => s.beforeContent || "")
    .join("\n");
  const criteria = TaskAnalyzer.analyze(userInstruction, allBeforeContent);

  // Phase C: Execute with verification loop
  let attempt = 0;
  let verificationPassed = false;
  const previousResults: any[] = [];
  let lastFailedCount = Infinity;
  let stuckCount = 0; // Track how many times we've made no progress

  while (attempt < MAX_VERIFICATION_ATTEMPTS && !verificationPassed) {
    attempt++;

    if (attempt > 1) {
      yield `\n🔄 **Retry ${attempt}** - fixing remaining issues...\n\n`;
    }

    // Execute the steps
    yield* executeSteps(steps, ide, model, rootDir, contextSpec);

    // Phase D: Capture AFTER snapshots
    yield "\n_Verifying changes..._\n";

    const completedSnapshots = new Map<string, FileSnapshot>();
    for (const [target, beforeSnapshot] of snapshots) {
      const filePath = rootDir + "/" + target;
      try {
        const afterContent = await ide.readFile(filePath);
        completedSnapshots.set(
          target,
          VerificationEngine.completeSnapshot(beforeSnapshot, afterContent),
        );
      } catch {
        // File still doesn't exist
        completedSnapshots.set(
          target,
          VerificationEngine.completeSnapshot(beforeSnapshot, ""),
        );
      }
    }

    // Phase E: Run verification
    const verificationContext: VerificationContext = {
      instruction: userInstruction,
      criteria,
      snapshots: completedSnapshots,
      startTime: Date.now(),
      attempt,
      maxAttempts: MAX_VERIFICATION_ATTEMPTS,
      previousResults,
    };

    const engine = new VerificationEngine({ useLLM: false }); // Start with fast heuristics
    const result = await engine.verify(verificationContext);
    previousResults.push(result);

    // Display verification results - compact format
    if (result.passed) {
      verificationPassed = true;
      yield "\n✅ **Verified complete!**\n";
    } else {
      // Track progress - are we making improvements?
      const failedCriteria = result.criteriaResults.filter((c) => !c.passed);
      const currentFailedCount = failedCriteria.length;

      if (currentFailedCount >= lastFailedCount) {
        stuckCount++;
      } else {
        stuckCount = 0; // Reset if we made progress
      }
      lastFailedCount = currentFailedCount;

      yield `\n⚠️ ${currentFailedCount} issue(s) remaining`;

      // Stop if: hit max attempts OR stuck for 2 consecutive attempts with no progress
      const shouldStop =
        attempt >= MAX_VERIFICATION_ATTEMPTS || stuckCount >= 2;

      if (!shouldStop) {
        yield ` - retrying...\n`;
        // Regenerate steps with feedback for next iteration
        steps = await regenerateStepsWithFeedback(
          model,
          userInstruction,
          result.suggestions,
          completedSnapshots,
        );
      } else {
        yield `\n\n<details>\n<summary>Issues requiring manual review</summary>\n\n`;
        for (const criterion of failedCriteria) {
          yield `- ${criterion.name}: ${criterion.explanation}\n`;
        }
        yield `\n</details>\n`;
        break; // Exit the while loop
      }
    }
  }

  // Final summary
  yield "\n---\n\n";
  if (verificationPassed) {
    yield `✅ **Done!** Completed in ${attempt} attempt(s)\n`;
  } else {
    yield `⚠️ **Partially completed** after ${attempt} attempts - manual review recommended\n`;
  }
}

/**
 * Regenerate steps based on verification feedback
 */
async function regenerateStepsWithFeedback(
  model: any,
  instruction: string,
  suggestions: string[],
  snapshots: Map<string, FileSnapshot>,
): Promise<PlanStep[]> {
  // Extract actual file paths from snapshots
  const filePaths = Array.from(snapshots.keys());
  const primaryFile = filePaths[0] || "unknown";

  const feedbackPrompt = `The previous attempt to "${instruction}" was incomplete.

File to edit: ${primaryFile}

Remaining issues:
${suggestions.map((s) => `- ${s}`).join("\n")}

Current file content:
${Array.from(snapshots.entries())
  .map(([path, snap]) => `\`\`\`\n${snap.afterContent.slice(0, 2000)}\n\`\`\``)
  .join("\n\n")}

Generate steps to FIX THE REMAINING ISSUES in the file above.

IMPORTANT FORMAT - use EXACTLY this format:
1. EDIT_FILE: ${primaryFile} | specific change description
2. EDIT_FILE: ${primaryFile} | another specific change

Rules:
- Use the EXACT file path: ${primaryFile}
- Separate path and description with | (pipe character)
- Focus on fixing the remaining issues listed above
- Do NOT include the description in the file path

Output ONLY numbered steps:`;

  let response = "";
  for await (const chunk of model.streamComplete(feedbackPrompt)) {
    response += chunk;
  }

  const steps = parseSimplePlanSteps(response);

  // Validate and fix any malformed targets
  for (const step of steps) {
    if (step.target && step.target.includes(" ")) {
      // Target has spaces - likely includes description, use primary file
      step.target = primaryFile;
    }
  }

  return steps;
}

// ============================================================================
// ORIGINAL STEP EXECUTION (no verification)
// ============================================================================

async function* executeSteps(
  steps: PlanStep[],
  ide: IDE,
  model: any,
  rootDir: string,
  contextSpec?: string,
): AsyncGenerator<string> {
  let successCount = 0;
  let failCount = 0;

  for (const step of steps) {
    // Compact step header - single line with icon
    const icon =
      step.type === "create_file"
        ? "📄"
        : step.type === "edit_file"
          ? "✏️"
          : step.type === "run_command"
            ? "⚡"
            : "📋";
    yield `${icon} **Step ${step.id}:** ${step.target ? `\`${step.target}\`` : ""} - ${step.description.slice(0, 80)}${step.description.length > 80 ? "..." : ""}\n\n`;

    try {
      switch (step.type) {
        case "create_file":
          yield* handleCreateFile(step, ide, model, rootDir, contextSpec);
          successCount++;
          break;

        case "insert_code":
          yield* handleInsertCode(step, ide, rootDir);
          successCount++;
          break;

        case "edit_file":
          yield* handleEditFile(step, ide, model, rootDir);
          successCount++;
          break;

        case "run_command":
          yield* handleRunCommand(step, ide);
          successCount++;
          break;

        case "analyze":
          yield `  _Skipped (analysis)_\n`;
          break;

        default:
          yield `  _Skipped (unknown type)_\n`;
      }
    } catch (e) {
      failCount++;
      yield `  ❌ Failed: ${e}\n`;
    }
  }

  // Compact summary - only show if there were failures
  if (failCount > 0) {
    yield `\n⚠️ ${successCount}/${steps.length} steps succeeded, ${failCount} failed\n`;
  }
}

async function* handleCreateFile(
  step: PlanStep,
  ide: IDE,
  model: any,
  rootDir: string,
  contextSpec?: string,
): AsyncGenerator<string> {
  if (!step.target) {
    yield "⚠️ No target file specified\n";
    return;
  }

  const prompt = `Generate complete code for:

File: ${step.target}
Purpose: ${step.description}
${contextSpec ? `Context:\n${contextSpec.slice(0, 1500)}` : ""}

Rules:
1. Write COMPLETE, WORKING code
2. Include all imports
3. No placeholders or TODOs
4. Production ready

Output ONLY code, no markdown fences:`;

  let content = "";
  // Stream silently - don't output code to chat
  for await (const chunk of model.streamComplete(prompt)) {
    content += chunk;
  }

  content = cleanCodeContent(content);

  const filePath = rootDir + "/" + step.target;
  await ide.writeFile(filePath, content);
  await ide.openFile(filePath);

  yield `✅ **Created:** [${step.target}](${step.target})\n\n`;
}

async function* handleInsertCode(
  step: PlanStep,
  ide: IDE,
  rootDir: string,
): AsyncGenerator<string> {
  if (!step.target || !step.codeBlock) {
    yield "⚠️ Missing target or code block\n";
    return;
  }

  // Validate target is a valid file path (not a description)
  if (step.target.includes(" - ") || step.target.length > 200) {
    yield `⚠️ Invalid target path detected: "${step.target.slice(0, 50)}..."\n`;
    yield `_This appears to be a malformed path. Skipping step._\n`;
    return;
  }

  const filePath = rootDir + "/" + step.target;

  // Check if file exists
  let existingContent = "";
  try {
    existingContent = await ide.readFile(filePath);
  } catch {
    // File doesn't exist, create it with the code block
    await ide.writeFile(filePath, step.codeBlock);
    await ide.openFile(filePath);
    yield `✅ **Created:** [${step.target}](${step.target})\n\n`;
    return;
  }

  const desc = step.description.toLowerCase();
  let newContent: string;
  let insertionMethod = "appended at end";

  // Strategy 1: Insert at the very top
  if (
    desc.includes("at the top") ||
    desc.includes("at the beginning") ||
    desc.includes("first line")
  ) {
    newContent = step.codeBlock + "\n\n" + existingContent;
    insertionMethod = "inserted at top";
  }
  // Strategy 2: Insert after imports
  else if (desc.includes("after import") || desc.includes("after the import")) {
    const lastImportMatch = existingContent.match(
      /^((?:import|use|from|require|#include).*\n)+/m,
    );
    if (lastImportMatch) {
      const insertPos = lastImportMatch.index! + lastImportMatch[0].length;
      newContent =
        existingContent.slice(0, insertPos) +
        "\n" +
        step.codeBlock +
        "\n" +
        existingContent.slice(insertPos);
      insertionMethod = "inserted after imports";
    } else {
      newContent = step.codeBlock + "\n\n" + existingContent;
      insertionMethod = "inserted at top (no imports found)";
    }
  }
  // Strategy 3: Insert in a specific method/function
  else {
    const methodMatch = desc.match(
      /(?:in|into|to|inside|within)\s+(?:the\s+)?[`']?(\w+)(?:\s*\(|\s+method|\s+function)?/i,
    );
    const afterMatch = desc.match(
      /(?:after|following)\s+(?:the\s+)?[`']?(\w+)/i,
    );
    const lineMatch = desc.match(/(?:line|around line)\s*(\d+)/i);

    if (lineMatch) {
      // Insert at specific line number
      const lineNum = parseInt(lineMatch[1], 10);
      const lines = existingContent.split("\n");
      const insertIdx = Math.min(lineNum - 1, lines.length);
      lines.splice(insertIdx, 0, step.codeBlock);
      newContent = lines.join("\n");
      insertionMethod = `inserted at line ${lineNum}`;
    } else if (methodMatch) {
      // Find the method and insert after its opening brace
      const methodName = methodMatch[1];
      // Try multiple patterns for different languages
      const patterns = [
        // Rust/C-style: fn name(...) { or func name(...) {
        new RegExp(
          `((?:fn|func|fun|def|function)\\s+${methodName}\\s*\\([^)]*\\)[^{]*\\{)`,
          "i",
        ),
        // Method in class: name(...) {
        new RegExp(
          `(${methodName}\\s*\\([^)]*\\)\\s*(?:->\\s*[^{]+)?\\s*\\{)`,
          "i",
        ),
        // Seen language style: fun name(...) r: Type {
        new RegExp(
          `(fun\\s+${methodName}\\s*\\([^)]*\\)\\s*\\w*:\\s*\\w+\\s*\\{)`,
          "i",
        ),
      ];

      let found = false;
      for (const pattern of patterns) {
        const match = existingContent.match(pattern);
        if (match && match.index !== undefined) {
          const insertPos = match.index + match[0].length;
          newContent =
            existingContent.slice(0, insertPos) +
            "\n" +
            step.codeBlock +
            existingContent.slice(insertPos);
          insertionMethod = `inserted in method '${methodName}'`;
          found = true;
          break;
        }
      }

      if (!found) {
        // Fallback: try to find the method name anywhere and insert after next {
        const simpleMatch = existingContent.indexOf(methodName);
        if (simpleMatch !== -1) {
          const braceAfter = existingContent.indexOf("{", simpleMatch);
          if (braceAfter !== -1) {
            newContent =
              existingContent.slice(0, braceAfter + 1) +
              "\n" +
              step.codeBlock +
              existingContent.slice(braceAfter + 1);
            insertionMethod = `inserted after '${methodName}' opening brace`;
          } else {
            newContent = existingContent + "\n\n" + step.codeBlock;
            insertionMethod = "appended (couldn't find insertion point)";
          }
        } else {
          newContent = existingContent + "\n\n" + step.codeBlock;
          insertionMethod = "appended (method not found)";
        }
      }
    } else if (afterMatch) {
      // Insert after a specific function/section
      const afterName = afterMatch[1];
      const idx = existingContent.indexOf(afterName);
      if (idx !== -1) {
        // Find the end of this block (matching braces)
        let braceCount = 0;
        let startBrace = existingContent.indexOf("{", idx);
        if (startBrace !== -1) {
          let endPos = startBrace;
          for (let i = startBrace; i < existingContent.length; i++) {
            if (existingContent[i] === "{") braceCount++;
            else if (existingContent[i] === "}") braceCount--;
            if (braceCount === 0) {
              endPos = i + 1;
              break;
            }
          }
          newContent =
            existingContent.slice(0, endPos) +
            "\n\n" +
            step.codeBlock +
            existingContent.slice(endPos);
          insertionMethod = `inserted after '${afterName}'`;
        } else {
          newContent = existingContent + "\n\n" + step.codeBlock;
          insertionMethod = "appended (no block found)";
        }
      } else {
        newContent = existingContent + "\n\n" + step.codeBlock;
        insertionMethod = "appended (reference not found)";
      }
    } else {
      // Default: append at end
      newContent = existingContent + "\n\n" + step.codeBlock;
    }
  }

  await ide.writeFile(filePath, newContent!);
  await ide.openFile(filePath);

  yield `✅ **Modified:** [${step.target}](${step.target})\n\n`;
}

async function* handleEditFile(
  step: PlanStep,
  ide: IDE,
  model: any,
  rootDir: string,
): AsyncGenerator<string> {
  if (!step.target) {
    yield "⚠️ No target file specified\n";
    return;
  }

  // Validate target is a valid file path (not a description)
  if (step.target.includes(" - ") || step.target.length > 200) {
    yield `⚠️ Invalid target path detected: "${step.target.slice(0, 50)}..."\n`;
    yield `_This appears to be a malformed path. Skipping step._\n`;
    return;
  }

  const filePath = rootDir + "/" + step.target;

  let existingContent: string;
  try {
    existingContent = await ide.readFile(filePath);
  } catch {
    // File doesn't exist - if we have a code block, create the file
    if (step.codeBlock) {
      await ide.writeFile(filePath, step.codeBlock);
      await ide.openFile(filePath);
      yield `✅ **Created:** [${step.target}](${step.target})\n\n`;
      return;
    }
    yield `⚠️ File not found: ${step.target}\n\n`;
    return;
  }

  // Build prompt with optional code block reference
  const codeBlockSection = step.codeBlock
    ? `\nReference code (use this as guidance for the changes):\n\`\`\`\n${step.codeBlock}\n\`\`\`\n`
    : "";

  // Detect if this is a refactoring task that needs complete rewrite
  const isRefactorTask = step.description
    .toLowerCase()
    .match(/refactor|convert|rewrite|transform|callback.*async|async.*await/);

  const prompt = isRefactorTask
    ? `Completely refactor this file based on the instruction.

File: ${step.target}
Instruction: ${step.description}
${codeBlockSection}
Current file content:
\`\`\`
${existingContent}
\`\`\`

IMPORTANT:
1. Output the COMPLETE refactored file
2. Apply the changes to ALL relevant code (not just the first occurrence)
3. Maintain consistent style throughout
4. Include all imports, functions, and exports
5. Do NOT leave any code in the old style

Output ONLY the complete refactored code, no explanations:`
    : `Edit this file based on the instruction.

File: ${step.target}
Instruction: ${step.description}
${codeBlockSection}
Current file content:
\`\`\`
${existingContent.slice(0, 4000)}
\`\`\`

Output the COMPLETE modified file content. Include ALL code from the file with your changes applied. No explanations, just the code:`;

  let newContent = "";
  // Stream silently - don't output code to chat
  for await (const chunk of model.streamComplete(prompt)) {
    newContent += chunk;
  }

  newContent = cleanCodeContent(newContent);

  // Validate that we got meaningful content (not empty or too short)
  if (newContent.length < 10) {
    yield "⚠️ Generated content too short, keeping original file\n";
    return;
  }

  await ide.writeFile(filePath, newContent);
  await ide.openFile(filePath);

  yield `✅ **Modified:** [${step.target}](${step.target})\n\n`;
}

async function* handleRunCommand(
  step: PlanStep,
  ide: IDE,
): AsyncGenerator<string> {
  if (!step.target) {
    yield "⚠️ No command specified\n\n";
    return;
  }

  try {
    await ide.runCommand(step.target);
    yield `✅ **Ran:** \`${step.target}\`\n\n`;
  } catch (e) {
    yield `⚠️ Command failed: ${e}\n\n`;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function cleanCodeContent(content: string): string {
  let cleaned = content.trim();

  // Remove markdown fences
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.substring(firstNewline + 1);
    }
  }

  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3).trimEnd();
  }

  return cleaned;
}
