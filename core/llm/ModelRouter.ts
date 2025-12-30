import { ILLM } from "../index";
import { CostTracker } from "./CostTracker";

export class ModelRouter {
  private costTracker: CostTracker;

  constructor() {
    this.costTracker = CostTracker.getInstance();
  }

  public selectModel(models: ILLM[], input: string): ILLM | undefined {
    // 1. Check budget
    const dailySpend = this.costTracker.getDailySpend();
    const BUDGET_LIMIT = 1.0; // $1.00 per day hard limit for now (configurable later)

    if (dailySpend > BUDGET_LIMIT) {
      // Try to find a free or very cheap model
      // For now, just warn or return undefined to indicate "use default but warn"
      // Or maybe we return the cheapest model available.
      console.warn("Daily budget exceeded. Preferring cheaper models.");
      // Logic to pick cheapest model could go here
    }

    // 2. Complexity Heuristic (Simple keyword based for now)
    const complexKeywords = [
      "architecture",
      "refactor",
      "design pattern",
      "security",
      "complex",
    ];
    const isComplex = complexKeywords.some((k) =>
      input.toLowerCase().includes(k),
    );

    if (isComplex) {
      // Prefer stronger models like GPT-4, Opus
      return models.find(
        (m) => m.model.includes("gpt-4") || m.model.includes("opus"),
      );
    }

    // Default: let the system use the user-selected model (return undefined)
    return undefined;
  }
}
