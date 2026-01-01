import * as fs from "fs";
import * as path from "path";
import { getContinueGlobalPath } from "../util/paths";

interface DailySpend {
  date: string;
  cost: number;
}

interface ModelPricing {
  input: number; // Cost per 1M tokens
  output: number; // Cost per 1M tokens
}

// Basic pricing map (approximate values in USD per 1M tokens)
const PRICING: Record<string, ModelPricing> = {
  // OpenAI
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "o1-pro": { input: 150, output: 600 },
  "o3-mini": { input: 1.1, output: 4.4 },
  // Anthropic Claude 3
  "claude-3-opus": { input: 15, output: 75 },
  "claude-3-sonnet": { input: 3, output: 15 },
  "claude-3-haiku": { input: 0.25, output: 1.25 },
  "claude-3.5-sonnet": { input: 3, output: 15 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3.5-haiku": { input: 0.8, output: 4 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  // Anthropic Claude 4
  "claude-sonnet-4": { input: 3, output: 15 },
  "claude-opus-4": { input: 15, output: 75 },
  // Google Gemini
  "gemini-1.5-pro": { input: 1.25, output: 5 },
  "gemini-1.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 10 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6 },
  // DeepSeek
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  // Mistral
  "mistral-large": { input: 2, output: 6 },
  "mistral-small": { input: 0.2, output: 0.6 },
  codestral: { input: 0.3, output: 0.9 },
  // Llama (via API providers)
  "llama-3.3-70b": { input: 0.6, output: 0.6 },
  "llama-3.1-405b": { input: 3, output: 3 },
  // Default fallback for unknown models (conservative estimate)
};

export class CostTracker {
  private static instance: CostTracker;
  private spendFile: string;

  private constructor() {
    this.spendFile = path.join(getContinueGlobalPath(), "daily_spend.json");
  }

  public static getInstance(): CostTracker {
    if (!CostTracker.instance) {
      CostTracker.instance = new CostTracker();
    }
    return CostTracker.instance;
  }

  private getToday(): string {
    return new Date().toISOString().split("T")[0];
  }

  private loadSpend(): DailySpend {
    try {
      if (fs.existsSync(this.spendFile)) {
        const data = JSON.parse(fs.readFileSync(this.spendFile, "utf8"));
        if (data.date === this.getToday()) {
          return data;
        }
      }
    } catch (e) {
      console.error("Failed to load daily spend:", e);
    }
    return { date: this.getToday(), cost: 0 };
  }

  private saveSpend(spend: DailySpend) {
    try {
      fs.writeFileSync(this.spendFile, JSON.stringify(spend, null, 2));
    } catch (e) {
      console.error("Failed to save daily spend:", e);
    }
  }

  public trackSpend(
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    // Simple matching logic - find first key that model name contains
    const modelLower = model.toLowerCase();
    const pricingEntry = Object.entries(PRICING).find(([key]) =>
      modelLower.includes(key),
    );
    const pricing = pricingEntry ? pricingEntry[1] : undefined;

    if (!pricing) {
      // Use a conservative default for unknown models ($2/$6 per 1M tokens)
      console.log(
        `[CostTracker] Unknown model "${model}", using default pricing`,
      );
      const defaultPricing = { input: 2, output: 6 };
      const cost =
        (inputTokens / 1_000_000) * defaultPricing.input +
        (outputTokens / 1_000_000) * defaultPricing.output;

      const spend = this.loadSpend();
      spend.cost += cost;
      this.saveSpend(spend);
      return cost;
    }

    const cost =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    const spend = this.loadSpend();
    spend.cost += cost;
    this.saveSpend(spend);

    console.log(
      `[CostTracker] ${model}: ${inputTokens} in / ${outputTokens} out = $${cost.toFixed(4)} (total: $${spend.cost.toFixed(2)})`,
    );

    return cost;
  }

  public getDailySpend(): number {
    return this.loadSpend().cost;
  }
}
