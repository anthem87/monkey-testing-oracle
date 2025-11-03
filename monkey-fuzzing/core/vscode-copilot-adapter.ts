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
      // Get all available models
      const allModels = await this.vscode.lm.selectChatModels();
      
      console.log(`📋 Raw models from VS Code: ${allModels.map((m: any) => m.id).join(', ')}`);

      // Filter only REAL invocable models (exclude auto/mini/paygo/placeholder)
      const models = allModels.filter((m: any) => {
        const isGitHub = m.vendor === 'github' || m.vendor === 'copilot';
        const isNotPlaceholder = !/auto|paygo|o3-mini|claude|gemini|grok/i.test(m.id);
        const isNotBlacklisted = !['gpt-4.1', 'gpt-4o.1', 'gpt-5-mini'].some(bad => m.id.includes(bad));
        return isGitHub && isNotPlaceholder && isNotBlacklisted;
      });

      if (models.length === 0) {
        console.warn('⚠️  No supported Copilot models found after filtering.');
        console.log('Available raw models:', allModels.map((m: any) => `${m.id} (vendor: ${m.vendor})`));
        throw new Error('No supported Copilot models available. Is GitHub Copilot active?');
      }

      console.log(`✅ Filtered models: ${models.map((m: any) => m.id).join(', ')}`);

      // Debug: show model capabilities
      for (const model of models) {
        console.log(`  ${model.id} | vendor=${model.vendor} | supportsChat=${model.supportsChat || 'unknown'}`);
      }

      // Prioritize stable models
      const preferredModel = 
        models.find((m: any) => m.id.includes('gpt-4o')) ||
        models.find((m: any) => m.id.includes('gpt-4-turbo')) ||
        models.find((m: any) => m.id.includes('gpt-4')) ||
        models.find((m: any) => m.id.includes('gpt-3.5')) ||
        models[0];

      console.log(`🎯 Selected preferred model: ${preferredModel.id}`);
      
      // Try preferred model first, then fallback to others
      const orderedModels = [preferredModel, ...models.filter((m: any) => m !== preferredModel)];

      let lastError = null;
      for (const model of orderedModels) {
        console.log(`🔄 Trying model: ${model.id}`);

        try {
          const userMsg = this.vscode.LanguageModelChatMessage.User(prompt);
          const token = new this.vscode.CancellationTokenSource().token;

          let response: any;

          if (typeof model.startChat === 'function') {
            // ✅ Nuova API Chat (gpt-4o, gpt-4-turbo, etc.)
            console.log(`  → Using startChat API for ${model.id}`);
            const chat = await model.startChat({
              systemPrompt: 'You are a code-generation assistant for test fuzzing and security analysis.'
            });
            response = await chat.sendRequest(userMsg, {}, token);
          } else if (typeof model.sendRequest === 'function') {
            // 🧩 Vecchia API (Codex, legacy models)
            console.log(`  → Using sendRequest API for ${model.id}`);
            response = await model.sendRequest([userMsg], {}, token);
          } else {
            console.warn(`⚠️  Model ${model.id} has no supported API methods`);
            continue;
          }

          let result = '';
          for await (const chunk of response.text) result += chunk;
          
          if (!result || result.trim().length === 0) {
            console.warn(`⚠️  Model ${model.id} returned empty response`);
            continue;
          }

          console.log(`✅ SUCCESS with model: ${model.id} (${result.length} chars)`);
          return result.trim();

        } catch (err: any) {
          console.warn(`❌ Model ${model.id} failed:`, err.message || err.code || 'unknown error');
          lastError = err;
          continue;
        }
      }

      // All models failed
      throw new Error(
        `All models failed. Tried: ${orderedModels.map((m: any) => m.id).join(', ')}. ` +
        `Last error: ${lastError?.message || lastError?.code || 'unknown'}`
      );

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
