import { ChatMessage, IDE } from "..";
import { ConfigHandler } from "../config/ConfigHandler";

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
  yield "🧪 **Entering TDD Mode**\n\n";

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

  const workspaceDirs = await ide.getWorkspaceDirs();
  const rootPath = workspaceDirs[0] || "";

  // Detect test framework
  const testFramework = await detectTestFramework(ide, rootPath);
  yield `📋 Detected test framework: **${testFramework.name}**\n`;
  yield `   Run command: \`${testFramework.command}\`\n\n`;

  // Phase 1: RED - Write failing test
  yield "## 🔴 Phase 1: RED\n";
  yield "_Writing failing test case..._\n\n";

  const testPrompt = `You are a TDD expert. Write a failing test case for the following requirement.

Framework: ${testFramework.name}
Requirement: ${userRequest}

Guidelines:
1. Start with the simplest test case
2. Use descriptive test names
3. Follow ${testFramework.name} conventions
4. Include assertions that will initially fail

Respond with ONLY the test code, no explanations.`;

  let testCode = "";
  yield "```" + testFramework.language + "\n";
  for await (const chunk of model.streamComplete(testPrompt)) {
    testCode += chunk;
    yield chunk;
  }
  yield "\n```\n\n";

  // Suggest test file location
  const testFilename = suggestTestFilename(userRequest, testFramework);
  yield `💡 Suggested test file: \`${testFilename}\`\n\n`;
  yield `Run \`${testFramework.command}\` to verify the test fails.\n\n`;

  // Phase 2: GREEN - Implement to pass
  yield "## 🟢 Phase 2: GREEN\n";
  yield "_Implementing minimal code to pass the test..._\n\n";

  const implPrompt = `Write the MINIMAL implementation code to make this test pass. No extra features, just enough to pass the test.

Test code:
\`\`\`${testFramework.language}
${testCode}
\`\`\`

Guidelines:
1. Keep it simple - minimal code only
2. Don't anticipate future requirements
3. Focus on making the test green

Respond with ONLY the implementation code.`;

  let implCode = "";
  yield "```" + testFramework.language + "\n";
  for await (const chunk of model.streamComplete(implPrompt)) {
    implCode += chunk;
    yield chunk;
  }
  yield "\n```\n\n";

  yield `Run \`${testFramework.command}\` to verify the test passes.\n\n`;

  // Phase 3: REFACTOR
  yield "## 🔵 Phase 3: REFACTOR\n";
  yield "_Suggesting refactoring improvements..._\n\n";

  const refactorPrompt = `Review this implementation and suggest refactoring improvements while keeping tests passing.

Test:
\`\`\`${testFramework.language}
${testCode}
\`\`\`

Implementation:
\`\`\`${testFramework.language}
${implCode}
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

  yield "---\n\n";
  yield "✅ **TDD Cycle Complete**\n\n";
  yield "Next steps:\n";
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

  // Check package.json for test script
  try {
    const pkgJson = await ide.readFile(rootPath + "/package.json");
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
  // Extract key words from requirement
  const words = requirement
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
