import * as vscode from "vscode";

export class CostStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    // this.statusBarItem.command = "continue.openCostStats"; // Optional: command to open stats
    this.statusBarItem.text = "$(graph) $0.00";
    this.statusBarItem.tooltip = "Daily LLM Spend";
    this.statusBarItem.show();
  }

  public updateCost(cost: number) {
    this.statusBarItem.text = `$(graph) $${cost.toFixed(2)}`;
  }

  public dispose() {
    this.statusBarItem.dispose();
  }
}
