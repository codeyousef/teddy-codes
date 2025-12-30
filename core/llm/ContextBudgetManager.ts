import { ChatMessage } from "../index.js";
import { countChatMessageTokens } from "./countTokens.js";

export class ContextBudgetManager {
  constructor(
    private contextLength: number,
    private modelName: string,
  ) {}

  pruneMessages(messages: ChatMessage[]): ChatMessage[] {
    const MAX_TOKENS = this.contextLength;
    const TARGET_TOKENS = MAX_TOKENS - 1000; // Buffer

    // --- Layer 1: Critical (System Prompts + Active Turn) ---
    // Priority: Highest. Never evict.
    const systemMessages = messages.filter((m) => m.role === "system");
    const lastMessage = messages[messages.length - 1];

    // --- Layer 2: Constitution (CATALYST.md) ---
    // Priority: High. Never evict.
    const catalystMessages = messages.filter(
      (m) =>
        m.role === "user" &&
        m.content
          .toString()
          .includes(
            "You are Catalyst. You must follow these architectural rules",
          ),
    );

    // --- Layer 3: Intelligence (RAG / Docs) ---
    // Priority: Medium. Truncate third.
    // TODO: Identify RAG messages more robustly. For now, we assume they are context items
    // attached to user messages that are NOT the last message and NOT the constitution.
    // In the current architecture, RAG is often merged into the user message.
    // If we can't separate them, they fall into Layer 4 (History) or Layer 1 (Active Turn).

    // --- Layer 4: Conversation (History) ---
    // Priority: Low. Truncate second (after non-critical context).
    const criticalSet = new Set([
      ...systemMessages,
      ...catalystMessages,
      lastMessage,
    ]);
    const chatHistory = messages.filter((m) => !criticalSet.has(m));

    // Calculate tokens for immutable layers
    let totalTokens = 0;
    for (const m of systemMessages)
      totalTokens += countChatMessageTokens(this.modelName, m);
    for (const m of catalystMessages)
      totalTokens += countChatMessageTokens(this.modelName, m);
    if (lastMessage && !criticalSet.has(lastMessage)) {
      // Should be in set, but just in case logic changes
      totalTokens += countChatMessageTokens(this.modelName, lastMessage);
    } else if (lastMessage) {
      totalTokens += countChatMessageTokens(this.modelName, lastMessage);
    }

    // If Critical + Constitution > Limit, we return what we can (System + Last)
    if (totalTokens > MAX_TOKENS) {
      console.warn(
        "ContextBudgetManager: Critical context exceeds limit. Dropping Constitution.",
      );
      // Fallback: Drop Constitution (Layer 2) if Layer 1 is too big
      // Recalculate without constitution
      let criticalTokens = 0;
      for (const m of systemMessages)
        criticalTokens += countChatMessageTokens(this.modelName, m);
      if (lastMessage)
        criticalTokens += countChatMessageTokens(this.modelName, lastMessage);

      if (criticalTokens > MAX_TOKENS) {
        console.warn(
          "ContextBudgetManager: Critical context (System + Last) exceeds limit. Truncating last message not implemented yet.",
        );
        return [...systemMessages, ...(lastMessage ? [lastMessage] : [])];
      }
      return [...systemMessages, ...(lastMessage ? [lastMessage] : [])];
    }

    // Add History (Layer 4) until full
    // We prioritize recent history
    const keptHistory: ChatMessage[] = [];
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const msg = chatHistory[i];
      const tokens = countChatMessageTokens(this.modelName, msg);
      if (totalTokens + tokens < TARGET_TOKENS) {
        totalTokens += tokens;
        keptHistory.unshift(msg);
      } else {
        // Stop adding history once we hit the limit
        break;
      }
    }

    // Reconstruct the message list in original order
    // We need to preserve the relative order of messages
    // 1. System
    // 2. Constitution (usually early in history)
    // 3. History
    // 4. Last Message

    // However, the input `messages` array has a specific order.
    // We should filter the original array to keep only the selected messages.
    const keptSet = new Set([
      ...systemMessages,
      ...catalystMessages,
      ...keptHistory,
      lastMessage,
    ]);
    return messages.filter((m) => keptSet.has(m));
  }
}
