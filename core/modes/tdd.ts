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

/**
 * TDD Mode - Red-Green-Refactor cycle
 *
 * Flow:
 * 1. RED: Write a failing test first
 * 2. GREEN: Implement minimal code to pass the test
 * 3. REFACTOR: Clean up while keeping tests green
 */
export async function* tddMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any, // ILLM
): AsyncGenerator<string> {
  yield "🧪 **TDD Mode - Red-Green-Refactor Cycle**\n\n";

  // Apply cost-saving configurations
  const capabilities = getModelCapabilities(model);
  applyCachingConfig(model);

  // Initialize file cache for this session
  const fileCache = new FileCache();

  // Show model info (consistent with autonomous mode)
  const providerInfo = capabilities.isCloud ? "☁️ Cloud" : "🖥️ Local";
  const cachingInfo = capabilities.supportsCaching ? " | 💾 Caching" : "";
  yield `_Model: ${model.model || "unknown"} | ${providerInfo}${cachingInfo}_\n\n`;

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

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
