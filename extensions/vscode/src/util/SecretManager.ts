import * as vscode from "vscode";

export class SecretManager {
  private static instance: SecretManager;
  private secretStorage: vscode.SecretStorage;

  private constructor(context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets;
  }

  static getInstance(context?: vscode.ExtensionContext): SecretManager {
    if (!SecretManager.instance) {
      if (!context) {
        throw new Error("SecretManager must be initialized with context first");
      }
      SecretManager.instance = new SecretManager(context);
    }
    return SecretManager.instance;
  }

  async store(key: string, value: string): Promise<void> {
    await this.secretStorage.store(key, value);
  }

  async get(key: string): Promise<string | undefined> {
    return await this.secretStorage.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.secretStorage.delete(key);
  }
}
