import { fetchwithRequestOptions } from "@continuedev/fetch";
import {
  AssistantChatMessage,
  ChatMessage,
  IDE,
  PromptLog,
  ToolCall,
  ToolCallDelta,
  ToolResultChatMessage,
} from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import { usesCreditsBasedApiKey } from "../config/usesFreeTrialApiKey";
import { RepoMap } from "../indexing/repoMap";
import { autonomousMode } from "../modes/autonomous";
import { tddMode } from "../modes/tdd";
import { FromCoreProtocol, ToCoreProtocol } from "../protocol";
import { IMessenger, Message } from "../protocol/messenger";
import { SkillService } from "../skills/SkillService";
import { callTool } from "../tools/callTool";
import { Telemetry } from "../util/posthog";
import { TTS } from "../util/tts";
import { ContextBudgetManager } from "./ContextBudgetManager";
import { CostTracker } from "./CostTracker";
import { ModelRouter } from "./ModelRouter";
import { DEFAULT_CONTEXT_LENGTH } from "./constants";
import { countChatMessageTokens, countTokens } from "./countTokens";
import { TokenBudget } from "./tokenBudget";
import { isOutOfStarterCredits } from "./utils/starterCredits";

function mergeToolCallDeltas(deltas: ToolCallDelta[]): ToolCall[] {
  const toolCalls: Record<string, ToolCall> = {};
  let lastId: string | undefined;

  for (const delta of deltas) {
    if (delta.id) {
      lastId = delta.id;
    }

    if (!lastId) continue;

    if (!toolCalls[lastId]) {
      toolCalls[lastId] = {
        id: lastId,
        type: "function",
        function: {
          name: "",
          arguments: "",
        },
      };
    }

    if (delta.function?.name) {
      toolCalls[lastId].function.name += delta.function.name;
    }
    if (delta.function?.arguments) {
      toolCalls[lastId].function.arguments += delta.function.arguments;
    }
  }

  return Object.values(toolCalls);
}

export async function* llmStreamChat(
  configHandler: ConfigHandler,
  abortController: AbortController,
  msg: Message<ToCoreProtocol["llm/streamChat"][0]>,
  ide: IDE,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
): AsyncGenerator<ChatMessage, PromptLog> {
  const { config } = await configHandler.loadConfig();
  if (!config) {
    throw new Error("Config not loaded");
  }

  // Stop TTS on new StreamChat
  if (config.experimental?.readResponseTTS) {
    void TTS.kill();
  }

  const {
    legacySlashCommandData,
    completionOptions,
    messages: originalMessages,
    messageOptions,
  } = msg.data;

  let messages = [...originalMessages];

  const skillSnippet =
    await SkillService.getInstance().getSystemPromptSnippet(ide);
  if (skillSnippet) {
    if (messages.length > 0 && messages[0].role === "system") {
      messages[0].content += skillSnippet;
    } else {
      messages.unshift({ role: "system", content: skillSnippet });
    }
  }

  const model = config.selectedModelByRole.chat;

  if (!model) {
    throw new Error("No chat model selected");
  }

  // Log to return in case of error
  const errorPromptLog = {
    modelTitle: model?.title ?? model?.model,
    modelProvider: model?.underlyingProviderName ?? "unknown",
    completion: "",
    prompt: "",
    completionOptions: {
      ...msg.data.completionOptions,
      model: model?.model,
    },
  };

  try {
    if (legacySlashCommandData) {
      const { command, contextItems, historyIndex, input, selectedCode } =
        legacySlashCommandData;
      const slashCommand = config.slashCommands?.find(
        (sc) => sc.name === command.name,
      );
      if (!slashCommand) {
        throw new Error(`Unknown slash command ${command.name}`);
      }
      if (!slashCommand.run) {
        console.error(
          `Slash command ${command.name} (${command.source}) has no run function`,
        );
        throw new Error(`Slash command not found`);
      }

      const gen = slashCommand.run({
        input,
        history: messages,
        llm: model,
        contextItems,
        params: command.params,
        ide,
        addContextItem: (item) => {
          void messenger.request("addContextItem", {
            item,
            historyIndex,
          });
        },
        selectedCode,
        config,
        fetch: (url, init) =>
          fetchwithRequestOptions(
            url,
            {
              ...init,
              signal: abortController.signal,
            },
            model.requestOptions,
          ),
        completionOptions,
        abortController,
      });
      let next = await gen.next();
      while (!next.done) {
        if (abortController.signal.aborted) {
          next = await gen.return(errorPromptLog);
          break;
        }
        if (next.value) {
          yield {
            role: "assistant",
            content: next.value,
          };
        }
        next = await gen.next();
      }
      if (!next.done) {
        throw new Error("Will never happen");
      }

      return next.value;
    } else {
      // --- Catalyst Phase 4: Model Routing ---
      const modelRouter = new ModelRouter();
      const lastContent = messages[messages.length - 1].content;
      const inputString =
        typeof lastContent === "string"
          ? lastContent
          : lastContent.map((p) => (p.type === "text" ? p.text : "")).join(" ");
      const availableModels = (config as any).models || [model];
      const routedModel = modelRouter.selectModel(availableModels, inputString);
      const selectedModel = routedModel || model;
      // ---------------------------------------

      // Teddy.Codes: Inject Repo Map
      try {
        const repoMapGenerator = new RepoMap(ide);
        const repoMapContent = await repoMapGenerator.generate();

        if (repoMapContent) {
          const systemMessageIndex = messages.findIndex(
            (m) => m.role === "system",
          );
          if (systemMessageIndex !== -1) {
            if (typeof messages[systemMessageIndex].content === "string") {
              messages[systemMessageIndex].content += "\n\n" + repoMapContent;
            }
          } else {
            messages.unshift({
              role: "system",
              content: repoMapContent,
            });
          }
        }
      } catch (e) {
        console.error("Failed to generate Repo Map:", e);
      }

      // Teddy.Codes: Mode Delegation
      if (msg.data.mode === "autonomous") {
        for await (const chunk of autonomousMode(
          configHandler,
          ide,
          messages,
          selectedModel,
        )) {
          yield { role: "assistant", content: chunk };
        }
        return { ...errorPromptLog, completion: "Autonomous Mode Complete" };
      }

      if (msg.data.mode === "tdd") {
        for await (const chunk of tddMode(
          configHandler,
          ide,
          messages,
          selectedModel,
        )) {
          yield { role: "assistant", content: chunk };
        }
        return { ...errorPromptLog, completion: "TDD Mode Complete" };
      }

      // Teddy.Codes: Enforce Token Budget
      const budgetedMessages = TokenBudget.enforce(
        messages,
        selectedModel.model,
      );

      const budgetManager = new ContextBudgetManager(
        selectedModel.contextLength || DEFAULT_CONTEXT_LENGTH,
        selectedModel.model,
      );

      // Standard Chat Loop
      const isAutonomous = msg.data.mode === "autonomous";
      const MAX_LOOPS = isAutonomous ? 10 : 1;
      let loopCount = 0;
      let completion = "";

      while (loopCount < MAX_LOOPS) {
        loopCount++;

        const prunedMessages = budgetManager.pruneMessages(budgetedMessages);

        const gen = selectedModel.streamChat(
          prunedMessages,
          abortController.signal,
          completionOptions,
          messageOptions,
        );

        let currentMessage: AssistantChatMessage = {
          role: "assistant",
          content: "",
        };
        let toolCallDeltas: ToolCallDelta[] = [];
        completion = ""; // Reset for this turn

        let next = await gen.next();
        while (!next.done) {
          if (abortController.signal.aborted) {
            // If aborted, we should probably return the error log or just break
            // The original code returned errorPromptLog
            return errorPromptLog;
          }

          const chunk = next.value;
          yield chunk;

          if (chunk.content) {
            if (typeof chunk.content === "string") {
              (currentMessage.content as string) += chunk.content;
              completion += chunk.content;
            } else {
              // Handle MessagePart[] if needed, but for stream it's usually string
            }
          }

          if ("toolCalls" in chunk && chunk.toolCalls) {
            if (!currentMessage.toolCalls) currentMessage.toolCalls = [];
            currentMessage.toolCalls.push(...chunk.toolCalls);
            toolCallDeltas.push(...chunk.toolCalls);
          }

          next = await gen.next();
        }

        // Add assistant message to history for next iteration
        messages.push(currentMessage);

        // --- Catalyst Phase 4: Cost Tracking (Per Turn) ---
        let inputTokens = 0;
        for (const msg of prunedMessages) {
          inputTokens += countChatMessageTokens(selectedModel.model, msg);
        }
        const outputTokens = countTokens(completion, selectedModel.model);
        const costTracker = CostTracker.getInstance();
        const cost = costTracker.trackSpend(
          selectedModel.model,
          inputTokens,
          outputTokens,
        );
        void messenger.request("catalyst/costUpdate", {
          cost: costTracker.getDailySpend(),
        });
        // ---------------------------------------

        if (config.experimental?.readResponseTTS && currentMessage.content) {
          const text =
            typeof currentMessage.content === "string"
              ? currentMessage.content
              : currentMessage.content
                  .map((p) => (p.type === "text" ? p.text : ""))
                  .join("");
          if (text) void TTS.read(text);
        }

        void Telemetry.capture(
          "chat",
          {
            model: model.model,
            provider: model.providerName,
            mode: msg.data.mode,
          },
          true,
        );

        void checkForOutOfStarterCredits(configHandler, messenger);

        const toolCalls = mergeToolCallDeltas(toolCallDeltas);

        // If no tool calls, or not autonomous, break
        if (toolCalls.length === 0 || !isAutonomous) {
          if (next.value) return next.value;
          return errorPromptLog;
        }

        // Execute tools
        for (const toolCall of toolCalls) {
          const tool = config.tools.find(
            (t) => t.function.name === toolCall.function.name,
          );
          if (!tool) {
            console.warn(`Tool ${toolCall.function.name} not found`);
            continue;
          }

          const result = await callTool(tool, toolCall, {
            ide,
            llm: model,
            config,
            fetch: (url, init) =>
              fetchwithRequestOptions(url, init, model.requestOptions),
            tool,
            toolCallId: toolCall.id,
          });

          const toolMessage: ToolResultChatMessage = {
            role: "tool",
            toolCallId: toolCall.id,
            content: result.contextItems
              .map((item) => item.content)
              .join("\n\n"),
          };

          messages.push(toolMessage);
          yield toolMessage;
        }
      }

      return errorPromptLog;
    }
  } catch (error) {
    // Moved error handling that was here to GUI, keeping try/catch for clean diff
    throw error;
  }
}

async function checkForOutOfStarterCredits(
  configHandler: ConfigHandler,
  messenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
) {
  try {
    const { config } = await configHandler.getSerializedConfig();
    const creditStatus =
      await configHandler.controlPlaneClient.getCreditStatus();

    if (
      config &&
      creditStatus &&
      isOutOfStarterCredits(usesCreditsBasedApiKey(config), creditStatus)
    ) {
      void messenger.request("freeTrialExceeded", undefined);
    }
  } catch (error) {
    console.error("Error checking free trial status:", error);
  }
}
