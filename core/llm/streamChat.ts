import { fetchwithRequestOptions } from "@continuedev/fetch";
import { ChatMessage, IDE, PromptLog, ToolCall } from "..";
import { ConfigHandler } from "../config/ConfigHandler";
import { usesCreditsBasedApiKey } from "../config/usesFreeTrialApiKey";
import { FromCoreProtocol, ToCoreProtocol } from "../protocol";
import { IMessenger, Message } from "../protocol/messenger";
import { callTool } from "../tools/callTool";
import { Telemetry } from "../util/posthog";
import { TTS } from "../util/tts";
import { ContextBudgetManager } from "./ContextBudgetManager";
import { CostTracker } from "./CostTracker";
import { ModelRouter } from "./ModelRouter";
import { DEFAULT_CONTEXT_LENGTH } from "./constants";
import { countChatMessageTokens, countTokens } from "./countTokens";
import { isOutOfStarterCredits } from "./utils/starterCredits";

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
    messages,
    messageOptions,
  } = msg.data;

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

      const budgetManager = new ContextBudgetManager(
        selectedModel.contextLength || DEFAULT_CONTEXT_LENGTH,
        selectedModel.model,
      );

      // Autonomous Mode Loop
      const isAutonomous = msg.data.mode === "autonomous";
      const MAX_LOOPS = isAutonomous ? 10 : 1;
      let loopCount = 0;
      let completion = "";

      while (loopCount < MAX_LOOPS) {
        loopCount++;

        const prunedMessages = budgetManager.pruneMessages(messages);

        const gen = selectedModel.streamChat(
          prunedMessages,
          abortController.signal,
          completionOptions,
          messageOptions,
        );

        let currentMessage: ChatMessage = { role: "assistant", content: "" };
        let toolCalls: ToolCall[] = [];
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
            currentMessage.content += chunk.content;
            completion += chunk.content;
          }
          if (chunk.toolCalls) {
            if (!currentMessage.toolCalls) currentMessage.toolCalls = [];
            currentMessage.toolCalls.push(...chunk.toolCalls);
            toolCalls.push(...chunk.toolCalls);
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
          void TTS.read(currentMessage.content);
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

          const result = await callTool(toolCall, tool, { ide });

          const toolMessage: ChatMessage = {
            role: "tool",
            toolCallId: toolCall.id,
            content: result.contextItems
              .map((item) => item.content)
              .join("\n\n"),
            name: toolCall.function.name,
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
