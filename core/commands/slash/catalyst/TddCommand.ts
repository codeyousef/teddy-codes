import { SlashCommand } from "../../../index.js";

export const TddCommand: SlashCommand = {
  name: "tdd",
  description: "Test-Driven Development workflow",
  run: async function* ({ ide, llm, input }) {
    if (!input) {
      yield "Please provide a feature description for TDD. Usage: `/tdd <feature>`";
      return;
    }

    yield `Starting TDD workflow for: **${input}**\n\n`;

    // Step 1: Generate Test
    yield "### Step 1: Generating Test Case\n";
    const testPrompt = `Generate a test file for the following feature: "${input}". 
    Assume a standard testing framework (e.g., Jest for TS/JS, Pytest for Python). 
    Output ONLY the code block for the test file.`;

    let testCode = "";
    for await (const chunk of llm.streamComplete(
      testPrompt,
      new AbortController().signal,
    )) {
      testCode += chunk;
      yield chunk;
    }

    yield "\n\n**Please verify the test code above.**\n";
    yield "I will pause here. If you approve, please create the test file and run the test (it should fail).\n";

    // In a full agentic loop, we would pause execution here or use a specialized UI.
    // For this slash command implementation, we guide the user.

    yield "\n### Step 2: Implementation\n";
    yield "Once you have confirmed the test fails, ask me to implement the code to pass it by typing: `Implement code to pass the test`";
  },
};
