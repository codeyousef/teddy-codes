import { ChatMessage } from "..";
import { countChatMessageTokens } from "./countTokens";

export class TokenBudget {
  private static readonly HARD_LIMIT = 8192;
  private static readonly ALLOCATION = {
    activeFile: 0.4,
    repoMap: 0.25,
    leann: 0.2,
    history: 0.15,
  };

  static enforce(messages: ChatMessage[], model: string): ChatMessage[] {
    // This is a simplified implementation.
    // In a real implementation, we would identify which messages belong to which layer
    // and prune them accordingly.

    // For now, we'll just ensure the total tokens don't exceed the limit.
    // If they do, we prune history.

    let totalTokens = 0;
    for (const msg of messages) {
      totalTokens += countChatMessageTokens(model, msg);
    }

    if (totalTokens <= this.HARD_LIMIT) {
      return messages;
    }

    // Prune history (keep system prompt and last user message)
    const prunedMessages = [...messages];

    // Remove middle messages until we fit
    // We start removing from index 1 (assuming index 0 is system prompt)
    // If no system prompt, index 0.

    let startIndex = prunedMessages[0]?.role === "system" ? 1 : 0;

    while (
      totalTokens > this.HARD_LIMIT &&
      prunedMessages.length > startIndex + 1
    ) {
      // Remove the oldest message in history
      const removed = prunedMessages.splice(startIndex, 1)[0];
      totalTokens -= countChatMessageTokens(model, removed);
    }

    return prunedMessages;
  }
}
