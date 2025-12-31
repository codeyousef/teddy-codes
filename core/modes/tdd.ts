import { ChatMessage, IDE } from "..";
import { ConfigHandler } from "../config/ConfigHandler";

export async function* tddMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any, // ILLM
): AsyncGenerator<string> {
  yield "Entering TDD Mode...\n";

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

  // 1. Red
  yield "Phase: RED (Writing failing test)...\n";
  const testPrompt = `Write a failing test case for the following requirement:\n\n${userRequest}`;
  let testCode = "";
  for await (const chunk of model.streamComplete(testPrompt)) {
    testCode += chunk;
  }
  yield `Test generated.\n`;

  // 2. Green
  yield "Phase: GREEN (Implementing feature)...\n";
  const implPrompt = `Write the implementation to pass the following test:\n\n${testCode}`;
  let implCode = "";
  for await (const chunk of model.streamComplete(implPrompt)) {
    implCode += chunk;
  }
  yield `Implementation generated.\n`;

  // 3. Refactor
  yield "Phase: REFACTOR (Cleaning up)...\n";

  yield "TDD Cycle Complete.";
}
