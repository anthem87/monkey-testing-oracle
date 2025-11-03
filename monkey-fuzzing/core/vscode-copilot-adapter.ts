/**
 * =============================================================
 * VS CODE COPILOT ADAPTER
 * =============================================================
 * Real Copilot integration using VS Code Language Model API
 * Requires running inside VS Code Extension context
 * =============================================================
 */

import type { CopilotAPI } from './types.js';

export class VSCodeCopilotAdapter implements CopilotAPI {
  private vscode: any; // Will be injected from extension context

  constructor(vscodeModule?: any) {
    this.vscode = vscodeModule;
  }

  async generate(prompt: string): Promise<string> {
    if (!this.vscode?.lm) {
      throw new Error('VS Code Language Model API not available. Are you running inside VS Code Extension?');
    }

    try {
      // Use GitHub Copilot model via VS Code API
      const models = await this.vscode.lm.selectChatModels({
        vendor: 'copilot',
        family: 'gpt-4'
      });

      if (models.length === 0) {
        throw new Error('No Copilot model available. Is GitHub Copilot enabled?');
      }

      const model = models[0];
      
      // Create message for Copilot
      const messages = [
        this.vscode.LanguageModelChatMessage.User(prompt)
      ];

      // Send request to Copilot
      const response = await model.sendRequest(
        messages,
        {},
        new this.vscode.CancellationTokenSource().token
      );

      // Collect streaming response
      let result = '';
      for await (const chunk of response.text) {
        result += chunk;
      }

      return result.trim();

    } catch (error) {
      console.error('Copilot API error:', error);
      throw new Error(`Failed to generate with Copilot: ${(error as Error).message}`);
    }
  }
}

/**
 * Helper to check if we're running in VS Code Extension context
 */
export function isVSCodeContext(): boolean {
  try {
    // Try to require vscode module
    require('vscode');
    return true;
  } catch {
    return false;
  }
}
