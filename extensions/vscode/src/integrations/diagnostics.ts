import { FromCoreProtocol, ToCoreProtocol } from "core/protocol";
import { IMessenger } from "core/protocol/messenger";
import * as vscode from "vscode";

export function setupDiagnostics(
  ideMessenger: IMessenger<ToCoreProtocol, FromCoreProtocol>,
) {
  // Monitor diagnostics
  vscode.languages.onDidChangeDiagnostics((e) => {
    const diagnostics: { uri: string; errors: string[] }[] = [];

    for (const uri of e.uris) {
      const diags = vscode.languages.getDiagnostics(uri);
      const errors = diags
        .filter((d) => d.severity === vscode.DiagnosticSeverity.Error)
        .map((d) => `Line ${d.range.start.line + 1}: ${d.message}`);

      if (errors.length > 0) {
        diagnostics.push({ uri: uri.toString(), errors });
      }
    }

    if (diagnostics.length > 0) {
      // Send to core
      // We need to define this message type in core/protocol/core.ts if we want type safety
      // But for now we can cast or just send it if the messenger allows loose types (it usually doesn't)
      // So I should add it to the protocol.

      // I'll add "teddy/diagnostics" to ToCoreProtocol
      ideMessenger.invoke("teddy/diagnostics", { diagnostics });
    }
  });
}
