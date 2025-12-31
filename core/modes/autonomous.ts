import { ChatMessage, IDE } from "..";
import { ConfigHandler } from "../config/ConfigHandler";

export async function* autonomousMode(
  configHandler: ConfigHandler,
  ide: IDE,
  messages: ChatMessage[],
  model: any, // ILLM
): AsyncGenerator<string> {
  yield "Entering Autonomous Mode...\n";

  const lastMessage = messages[messages.length - 1];
  const userRequest =
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : "No request found";

  // 1. Specification
  yield "Generating Specification (spec.md)...\n";
  const specPrompt = `Create a detailed implementation specification for the following request:\n\n${userRequest}`;
  let spec = "";
  for await (const chunk of model.streamComplete(specPrompt)) {
    spec += chunk;
  }
  yield `Spec generated.\n`;

  // 2. Planning
  yield "Generating Plan (plan.md)...\n";
  const planPrompt = `Based on the following specification, create a step-by-step implementation plan:\n\n${spec}`;
  let plan = "";
  for await (const chunk of model.streamComplete(planPrompt)) {
    plan += chunk;
  }
  yield `Plan generated.\n`;

  // 3. Execution
  yield "Executing Plan...\n";
  // Here we would parse the plan and execute steps.
  yield "Simulating execution of plan steps...\n";

  yield "Autonomous Mode Complete.";
}
