import { ChatMessage, IDE } from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import {
  applyCachingConfig,
  FileCache,
  getContentLimit,
  getModelCapabilities,
  truncateContent,
} from "./model-utils.js";

interface TestResult {
  passed: boolean;
  output: string;
  failures: string[];
}

/** TDD Phase states */
type TDDPhase = "red" | "green" | "refactor" | "complete";

/** State extracted from conversation history */
interface TDDState {
  phase: TDDPhase;
  requirement: string;
  testCode: string;
  implCode: string;
  framework: TestFramework | null;
}

/** Commands that trigger phase continuation */
const CONTINUE_COMMANDS = [
  "continue",
  "continnue", // Common typo
  "next",
  "proceed",
  "go",
  "go on",
  "skip",
  "done",
  "ok",
  "yes",
  "y",
];

/**
 * Check if user input is a continuation command
 */
function isContinueCommand(input: string): boolean {
  const normalized = input.trim().toLowerCase();
  return CONTINUE_COMMANDS.includes(normalized) || normalized.length <= 3;
}

/**
 * Extract TDD state from conversation history
 */
function extractTDDState(messages: ChatMessage[]): TDDState {
  const state: TDDState = {
    phase: "red",
    requirement: "",
    testCode: "",
    implCode: "",
    framework: null,
  };

  // Look through assistant messages for TDD markers
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    const content =
      typeof msg.content === "string"
        ? msg.content
        : JSON.stringify(msg.content);

    // Check for requirement
    const reqMatch = content.match(/_Requirement: "([^"]+)"/);
    if (reqMatch && reqMatch[1] && !reqMatch[1].includes("...")) {
      state.requirement = reqMatch[1];
    }

    // Check for framework
    const fwMatch = content.match(/📋 \*\*Framework:\*\* ([^\n]+)/);
    if (fwMatch) {
      const fwName = fwMatch[1].trim();
      state.framework = inferFrameworkFromName(fwName);
    }

    // Check phases and extract code
    if (content.includes("🔴 **Phase 1: RED**")) {
      // Extract test code from RED phase
      const testMatch = content.match(
        /🔴 \*\*Phase 1: RED\*\*[\s\S]*?```[\w-]*\n([\s\S]*?)```/,
      );
      if (testMatch) {
        state.testCode = testMatch[1].trim();
      }

      // Determine current phase based on what's complete
      if (content.includes("🟢 **Phase 2: GREEN**")) {
        const implMatch = content.match(
          /🟢 \*\*Phase 2: GREEN\*\*[\s\S]*?```[\w-]*\n([\s\S]*?)```/,
        );
        if (implMatch) {
          state.implCode = implMatch[1].trim();
        }

        if (content.includes("🔵 **Phase 3: REFACTOR**")) {
          if (content.includes("✅ **TDD Cycle Complete!**")) {
            state.phase = "complete";
          } else {
            state.phase = "refactor";
          }
        } else {
          state.phase = "refactor";
        }
      } else {
        state.phase = "green";
      }
    }
  }

  return state;
}

/**
 * Infer framework details from name
 */
function inferFrameworkFromName(name: string): TestFramework {
  const lowerName = name.toLowerCase();
  if (lowerName.includes("cargo") || lowerName.includes("rust")) {
    return {
      name: "cargo test",
      command: "cargo test",
      language: "rust",
      testPattern: "*_test.rs",
    };
  }
  if (lowerName.includes("pytest") || lowerName.includes("python")) {
    return {
      name: "pytest",
      command: "pytest",
      language: "python",
      testPattern: "test_*.py",
    };
  }
  if (lowerName.includes("go test") || lowerName.includes("golang")) {
    return {
      name: "go test",
      command: "go test ./...",
      language: "go",
      testPattern: "*_test.go",
    };
  }
  if (lowerName.includes("vitest")) {
    return {
      name: "Vitest",
      command: "npx vitest",
      language: "typescript",
      testPattern: "*.test.ts",
    };
  }
  // Default to Jest
  return {
    name: "Jest",
    command: "npm test",
    language: "typescript",
    testPattern: "*.test.ts",
  };
}

/**
 * TDD Mode - Red-Green-Refactor cycle
 *
 * Flow:
 * 1. RED: Write a failing test first
 * 2. GREEN: Implement minimal code to pass the test
 * 3. REFACTOR: Clean up while keeping tests green
 *
 * Supports continuation commands like "continue", "next", etc.
 */
export async function* tddMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any, // ILLM
): AsyncGenerator<string> {
  // Apply cost-saving configurations
  const capabilities = getModelCapabilities(model);
  applyCachingConfig(model);

  // Initialize file cache for this session
  const fileCache = new FileCache();

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

  // Check if this is a continuation command
  const isContinuation = isContinueCommand(userRequest);

  // Extract state from previous messages
  const previousState = extractTDDState(messages.slice(0, -1));

  // Determine what to do
  if (isContinuation && previousState.requirement) {
    // User wants to continue from previous state
    yield* handleContinuation(
      model,
      capabilities,
      previousState,
      ide,
      fileCache,
    );
    return;
  }

  // New TDD cycle
  yield "🧪 **TDD Mode - Red-Green-Refactor Cycle**\n\n";

  // Show model info (consistent with autonomous mode)
  const providerInfo = capabilities.isCloud ? "☁️ Cloud" : "🖥️ Local";
  const cachingInfo = capabilities.supportsCaching ? " | 💾 Caching" : "";
  yield `_Model: ${model.model || "unknown"} | ${providerInfo}${cachingInfo}_\n\n`;

  // Show requirement
  const truncatedRequest =
    userRequest.length > 100 ? userRequest.slice(0, 100) + "..." : userRequest;
  yield `_Requirement: "${truncatedRequest}"_\n\n`;

  const workspaceDirs = await ide.getWorkspaceDirs();
  const rootPath = workspaceDirs[0] || "";

  // Detect test framework (with caching)
  const testFramework = await detectTestFramework(
    ide,
    rootPath,
    fileCache,
    userRequest,
  );
  yield `📋 **Framework:** ${testFramework.name}\n`;
  yield `   _Command:_ \`${testFramework.command}\`\n\n`;

  // Phase 1: RED - Write failing test
  yield "<details>\n<summary>🔴 **Phase 1: RED** - Writing failing test...</summary>\n\n";

  const testPrompt = `You are a TDD expert. Write a failing test case for the following requirement.

Framework: ${testFramework.name}
Requirement: ${userRequest}

Guidelines:
1. Start with the simplest test case
2. Use descriptive test names
3. Follow ${testFramework.name} conventions
4. Include assertions that will initially fail

Respond with ONLY the raw test code. Do not use markdown code blocks.`;

  let testCode = "";
  let buffer = "";
  let determined = false;
  let isCodeBlock = false;

  for await (const chunk of model.streamComplete(testPrompt)) {
    testCode += chunk;
    if (!determined) {
      buffer += chunk;
      const trimmed = buffer.trimStart();
      if (trimmed.startsWith("```")) {
        isCodeBlock = true;
        determined = true;
        yield buffer;
        buffer = "";
      } else if (
        trimmed.length >= 3 ||
        (trimmed.length > 0 && !trimmed.startsWith("`"))
      ) {
        isCodeBlock = false;
        determined = true;
        yield "```" + testFramework.language + "\n";
        yield buffer;
        buffer = "";
      }
    } else {
      yield chunk;
    }
  }

  if (!determined) {
    if (buffer.trimStart().startsWith("```")) {
      yield buffer;
    } else {
      yield "```" + testFramework.language + "\n";
      yield buffer;
      yield "\n```\n\n";
    }
  } else {
    if (!isCodeBlock) {
      yield "\n```\n\n";
    } else {
      yield "\n\n";
    }
  }

  // Suggest test file location
  const testFilename = suggestTestFilename(userRequest, testFramework);
  yield `💡 **Suggested file:** \`${testFilename}\`\n\n`;
  yield `⚡ _Run \`${testFramework.command}\` to verify the test fails._\n\n`;

  yield "</details>\n\n";

  // Phase 2: GREEN - Implement to pass
  yield "<details>\n<summary>🟢 **Phase 2: GREEN** - Implementing minimal code...</summary>\n\n";

  // Apply context limits based on model capabilities
  const contextLimit = getContentLimit(capabilities, "context");
  const truncatedTestCode = truncateContent(
    stripCodeBlock(testCode),
    contextLimit,
  );

  const implPrompt = `Write the MINIMAL implementation code to make this test pass. No extra features, just enough to pass the test.

Test code:
\`\`\`${testFramework.language}
${truncatedTestCode}
\`\`\`

Guidelines:
1. Keep it simple - minimal code only
2. Don't anticipate future requirements
3. Focus on making the test green

Respond with ONLY the raw implementation code. Do not use markdown code blocks.`;

  let implCode = "";
  buffer = "";
  determined = false;
  isCodeBlock = false;

  for await (const chunk of model.streamComplete(implPrompt)) {
    implCode += chunk;
    if (!determined) {
      buffer += chunk;
      const trimmed = buffer.trimStart();
      if (trimmed.startsWith("```")) {
        isCodeBlock = true;
        determined = true;
        yield buffer;
        buffer = "";
      } else if (
        trimmed.length >= 3 ||
        (trimmed.length > 0 && !trimmed.startsWith("`"))
      ) {
        isCodeBlock = false;
        determined = true;
        yield "```" + testFramework.language + "\n";
        yield buffer;
        buffer = "";
      }
    } else {
      yield chunk;
    }
  }

  if (!determined) {
    if (buffer.trimStart().startsWith("```")) {
      yield buffer;
    } else {
      yield "```" + testFramework.language + "\n";
      yield buffer;
      yield "\n```\n\n";
    }
  } else {
    if (!isCodeBlock) {
      yield "\n```\n\n";
    } else {
      yield "\n\n";
    }
  }

  yield `⚡ _Run \`${testFramework.command}\` to verify the test passes._\n\n`;

  yield "</details>\n\n";

  // Phase 3: REFACTOR
  yield "<details>\n<summary>🔵 **Phase 3: REFACTOR** - Suggesting improvements...</summary>\n\n";

  // Truncate for refactor prompt if needed
  const truncatedImplCode = truncateContent(
    stripCodeBlock(implCode),
    contextLimit,
  );

  const refactorPrompt = `Review this implementation and suggest refactoring improvements while keeping tests passing.

Test:
\`\`\`${testFramework.language}
${truncatedTestCode}
\`\`\`

Implementation:
\`\`\`${testFramework.language}
${truncatedImplCode}
\`\`\`

Suggest improvements for:
1. Code clarity
2. Naming
3. Duplication removal
4. Design patterns (if applicable)

Be concise.`;

  for await (const chunk of model.streamComplete(refactorPrompt)) {
    yield chunk;
  }
  yield "\n\n";

  yield "</details>\n\n";

  yield "---\n\n";
  yield "✅ **TDD Cycle Complete!**\n\n";
  yield "📋 **Next steps:**\n";
  yield "1. Run tests to verify everything passes\n";
  yield "2. Apply suggested refactoring\n";
  yield "3. Re-run tests after each change\n";
  yield "4. Repeat the cycle for additional requirements\n";
}

/**
 * Handle continuation from a previous TDD state
 */
async function* handleContinuation(
  model: any,
  capabilities: any,
  state: TDDState,
  ide: IDE,
  fileCache: FileCache,
): AsyncGenerator<string> {
  const framework = state.framework || {
    name: "Jest",
    command: "npm test",
    language: "typescript",
    testPattern: "*.test.ts",
  };

  yield "🧪 **TDD Mode - Continuing...**\n\n";

  const providerInfo = capabilities.isCloud ? "☁️ Cloud" : "🖥️ Local";
  const cachingInfo = capabilities.supportsCaching ? " | 💾 Caching" : "";
  yield `_Model: ${model.model || "unknown"} | ${providerInfo}${cachingInfo}_\n\n`;

  yield `_Requirement: "${state.requirement}"_\n`;
  yield `_Resuming from: **${state.phase.toUpperCase()}** phase_\n\n`;

  const contextLimit = getContentLimit(capabilities, "context");

  if (state.phase === "green") {
    // Continue to GREEN phase
    yield "<details>\n<summary>🟢 **Phase 2: GREEN** - Implementing minimal code...</summary>\n\n";

    const truncatedTestCode = truncateContent(state.testCode, contextLimit);

    const implPrompt = `Write the MINIMAL implementation code to make this test pass. No extra features, just enough to pass the test.

Test code:
\`\`\`${framework.language}
${truncatedTestCode}
\`\`\`

Guidelines:
1. Keep it simple - minimal code only
2. Don't anticipate future requirements
3. Focus on making the test green

Respond with ONLY the raw implementation code. Do not use markdown code blocks.`;

    let implCode = "";
    yield "```" + framework.language + "\n";
    for await (const chunk of model.streamComplete(implPrompt)) {
      const cleanChunk = stripCodeBlock(chunk);
      implCode += cleanChunk;
      yield cleanChunk;
    }
    yield "\n```\n\n";

    yield `⚡ _Run \`${framework.command}\` to verify the test passes._\n\n`;
    yield "</details>\n\n";

    // Continue to REFACTOR
    yield "<details>\n<summary>🔵 **Phase 3: REFACTOR** - Suggesting improvements...</summary>\n\n";

    const truncatedImplCode = truncateContent(implCode, contextLimit);

    const refactorPrompt = `Review this implementation and suggest refactoring improvements while keeping tests passing.

Test:
\`\`\`${framework.language}
${truncatedTestCode}
\`\`\`

Implementation:
\`\`\`${framework.language}
${truncatedImplCode}
\`\`\`

Suggest improvements for:
1. Code clarity
2. Naming
3. Duplication removal
4. Design patterns (if applicable)

Be concise.`;

    for await (const chunk of model.streamComplete(refactorPrompt)) {
      yield chunk;
    }
    yield "\n\n";
    yield "</details>\n\n";
  } else if (state.phase === "refactor") {
    // Continue to REFACTOR phase only
    yield "<details>\n<summary>🔵 **Phase 3: REFACTOR** - Suggesting improvements...</summary>\n\n";

    const truncatedTestCode = truncateContent(state.testCode, contextLimit);
    const truncatedImplCode = truncateContent(state.implCode, contextLimit);

    const refactorPrompt = `Review this implementation and suggest refactoring improvements while keeping tests passing.

Test:
\`\`\`${framework.language}
${truncatedTestCode}
\`\`\`

Implementation:
\`\`\`${framework.language}
${truncatedImplCode}
\`\`\`

Suggest improvements for:
1. Code clarity
2. Naming
3. Duplication removal
4. Design patterns (if applicable)

Be concise.`;

    for await (const chunk of model.streamComplete(refactorPrompt)) {
      yield chunk;
    }
    yield "\n\n";
    yield "</details>\n\n";
  } else if (state.phase === "complete") {
    yield "✅ The previous TDD cycle is already complete!\n\n";
    yield "To start a new cycle, describe your next requirement.\n";
    return;
  }

  yield "---\n\n";
  yield "✅ **TDD Cycle Complete!**\n\n";
  yield "📋 **Next steps:**\n";
  yield "1. Run tests to verify everything passes\n";
  yield "2. Apply suggested refactoring\n";
  yield "3. Re-run tests after each change\n";
  yield "4. Repeat the cycle for additional requirements\n";
}

interface TestFramework {
  name: string;
  command: string;
  language: string;
  testPattern: string;
}

/**
 * Detect the test framework used in the project
 */
async function detectTestFramework(
  ide: IDE,
  rootPath: string,
  fileCache?: FileCache,
  userRequest?: string,
): Promise<TestFramework> {
  // Check for common test frameworks by looking for config files
  const frameworks: Array<{
    files: string[];
    framework: TestFramework;
  }> = [
    {
      files: ["jest.config.js", "jest.config.ts", "jest.config.json"],
      framework: {
        name: "Jest",
        command: "npm test",
        language: "typescript",
        testPattern: "*.test.ts",
      },
    },
    {
      files: ["vitest.config.ts", "vitest.config.js"],
      framework: {
        name: "Vitest",
        command: "npx vitest",
        language: "typescript",
        testPattern: "*.test.ts",
      },
    },
    {
      files: ["pytest.ini", "pyproject.toml", "setup.py"],
      framework: {
        name: "pytest",
        command: "pytest",
        language: "python",
        testPattern: "test_*.py",
      },
    },
    {
      files: ["Cargo.toml"],
      framework: {
        name: "cargo test",
        command: "cargo test",
        language: "rust",
        testPattern: "*_test.rs",
      },
    },
    {
      files: ["go.mod"],
      framework: {
        name: "go test",
        command: "go test ./...",
        language: "go",
        testPattern: "*_test.go",
      },
    },
  ];

  for (const { files, framework } of frameworks) {
    for (const file of files) {
      const exists = await ide.fileExists(rootPath + "/" + file);
      if (exists) {
        return framework;
      }
    }
  }

  // Check package.json for test script (with caching)
  try {
    const pkgJsonPath = rootPath + "/package.json";
    let pkgJson: string;
    if (fileCache) {
      pkgJson = await fileCache.readFile(ide, pkgJsonPath);
    } else {
      pkgJson = await ide.readFile(pkgJsonPath);
    }
    const pkg = JSON.parse(pkgJson);
    if (pkg.scripts?.test) {
      return {
        name: "npm test",
        command: "npm test",
        language: "typescript",
        testPattern: "*.test.ts",
      };
    }
  } catch {
    // No package.json
  }

  // Try to infer from user request
  if (userRequest) {
    const lowerRequest = userRequest.toLowerCase();
    if (lowerRequest.includes("rust") || lowerRequest.includes(".rs")) {
      return {
        name: "cargo test",
        command: "cargo test",
        language: "rust",
        testPattern: "*_test.rs",
      };
    }
    if (lowerRequest.includes("python") || lowerRequest.includes(".py")) {
      return {
        name: "pytest",
        command: "pytest",
        language: "python",
        testPattern: "test_*.py",
      };
    }
    if (
      lowerRequest.includes("golang") ||
      lowerRequest.includes(".go") ||
      lowerRequest.includes("go test")
    ) {
      return {
        name: "go test",
        command: "go test ./...",
        language: "go",
        testPattern: "*_test.go",
      };
    }
  }

  // Try to infer from current file
  const currentFile = await ide.getCurrentFile();
  if (currentFile?.path) {
    if (currentFile.path.endsWith(".rs")) {
      return {
        name: "cargo test",
        command: "cargo test",
        language: "rust",
        testPattern: "*_test.rs",
      };
    }
    if (currentFile.path.endsWith(".py")) {
      return {
        name: "pytest",
        command: "pytest",
        language: "python",
        testPattern: "test_*.py",
      };
    }
    if (currentFile.path.endsWith(".go")) {
      return {
        name: "go test",
        command: "go test ./...",
        language: "go",
        testPattern: "*_test.go",
      };
    }

    // Try to infer from content
    const content = currentFile.contents.toLowerCase();
    if (content.includes("fn main") || content.includes("use std::")) {
      return {
        name: "cargo test",
        command: "cargo test",
        language: "rust",
        testPattern: "*_test.rs",
      };
    }
    if (content.includes("def ") || content.includes("import ")) {
      return {
        name: "pytest",
        command: "pytest",
        language: "python",
        testPattern: "test_*.py",
      };
    }
    if (content.includes("package main") || content.includes("func main")) {
      return {
        name: "go test",
        command: "go test ./...",
        language: "go",
        testPattern: "*_test.go",
      };
    }
  }

  // Default to Jest
  return {
    name: "Jest (default)",
    command: "npm test",
    language: "typescript",
    testPattern: "*.test.ts",
  };
}

/**
 * Suggest a test filename based on the requirement
 */
function suggestTestFilename(
  requirement: string,
  framework: TestFramework,
): string {
  // Clean requirement of code blocks and special chars
  const cleanRequirement = requirement
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/[^a-zA-Z0-9\s]/g, " "); // Keep only text

  // Extract key words from requirement
  const words = cleanRequirement
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 2);

  const baseName = words.join("-") || "feature";

  switch (framework.language) {
    case "python":
      return `tests/test_${baseName.replace(/-/g, "_")}.py`;
    case "rust":
      return `src/${baseName.replace(/-/g, "_")}_test.rs`;
    case "go":
      return `${baseName.replace(/-/g, "_")}_test.go`;
    default:
      return `__tests__/${baseName}.test.ts`;
  }
}

function stripCodeBlock(code: string): string {
  return code
    .replace(/^```[\w-]*\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();
}
