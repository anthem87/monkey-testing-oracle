"use strict";
/**
 * =============================================================
 * VS CODE COPILOT ADAPTER
 * =============================================================
 * Real Copilot integration using VS Code Language Model API
 * Requires running inside VS Code Extension context
 * =============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VSCodeCopilotAdapter = void 0;
exports.isVSCodeContext = isVSCodeContext;
class VSCodeCopilotAdapter {
    constructor(vscodeModule) {
        this.vscode = vscodeModule;
    }
    async generate(prompt) {
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
            const response = await model.sendRequest(messages, {}, new this.vscode.CancellationTokenSource().token);
            // Collect streaming response
            let result = '';
            for await (const chunk of response.text) {
                result += chunk;
            }
            return result.trim();
        }
        catch (error) {
            console.error('Copilot API error:', error);
            throw new Error(`Failed to generate with Copilot: ${error.message}`);
        }
    }
}
exports.VSCodeCopilotAdapter = VSCodeCopilotAdapter;
/**
 * Helper to check if we're running in VS Code Extension context
 */
function isVSCodeContext() {
    try {
        // Try to require vscode module
        require('vscode');
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=vscode-copilot-adapter.js.map