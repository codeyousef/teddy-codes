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

// Basic pricing map (approximate values in USD)
const PRICING: Record<string, ModelPricing> = {
  "gpt-4": { input: 30, output: 60 },
  "gpt-4-turbo": { input: 10, output: 30 },
  "gpt-4o": { input: 5, output: 15 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "claude-3-opus-20240229": { input: 15, output: 75 },
  "claude-3-sonnet-20240229": { input: 3, output: 15 },
  "claude-3-haiku-20240307": { input: 0.25, output: 1.25 },
  "claude-3-5-sonnet-20240620": { input: 3, output: 15 },
  "gemini-1.5-pro": { input: 3.5, output: 10.5 },
  "gemini-1.5-flash": { input: 0.35, output: 1.05 },
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
    // Simple matching logic
    const pricingEntry = Object.entries(PRICING).find(([key]) =>
      model.toLowerCase().includes(key),
    );
    const pricing = pricingEntry ? pricingEntry[1] : undefined;

    if (!pricing) {
      return 0;
    }

    const cost =
      (inputTokens / 1_000_000) * pricing.input +
      (outputTokens / 1_000_000) * pricing.output;

    const spend = this.loadSpend();
    spend.cost += cost;
    this.saveSpend(spend);

    return cost;
  }

  public getDailySpend(): number {
    return this.loadSpend().cost;
  }
}
