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
    /**
     * 🔧 Alias for generate() - used by many modules
     */
    async sendPrompt(prompt) {
        return this.generate(prompt);
    }
    /**
     * 🧬 Generate mutation suggestions (alias for generate)
     */
    async generateMutation(prompt) {
        return this.generate(prompt);
    }
    /**
     * Generate structured test output from Copilot
     * @param prompt - Original prompt
     * @param options - Generation options (language, testType, etc.)
     * @returns JSON with {className, package, imports, fields, methods, testCode}
     */
    async generateStructured(prompt, options) {
        const structuredPrompt = `
${prompt}

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{
  "className": "GeneratedTestClass",
  "package": "com.example.test",
  "imports": ["import org.junit.jupiter.api.Test;", "import static org.mockito.Mockito.*;"],
  "fields": ["@Mock\\nprivate HttpServletRequest request;", "@Mock\\nprivate HttpServletResponse response;"],
  "methods": [
    {
      "name": "testMethodName",
      "annotations": ["@Test"],
      "signature": "void testMethodName() throws Exception",
      "body": "// test body here\\nassertEquals(expected, actual);"
    }
  ]
}

Do NOT include markdown code blocks, explanations, or any text outside the JSON structure.
Language: ${options?.language || 'java'}
`;
        const jsonResponse = await this.generate(structuredPrompt);
        try {
            // Extract JSON from markdown code blocks if present
            const jsonMatch = jsonResponse.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ||
                jsonResponse.match(/(\{[\s\S]*\})/);
            if (!jsonMatch) {
                console.warn('⚠️ Copilot did not return JSON. Raw response:', jsonResponse.slice(0, 200));
                throw new Error('Copilot response is not valid JSON');
            }
            return JSON.parse(jsonMatch[1]);
        }
        catch (parseError) {
            console.error('❌ Failed to parse Copilot JSON:', parseError);
            console.log('Raw response:', jsonResponse.slice(0, 500));
            throw new Error(`Copilot returned invalid JSON: ${parseError}`);
        }
    }
    async generate(prompt) {
        console.log('\n🚀 [VSCodeCopilotAdapter] generate() called');
        if (!this.vscode?.lm) {
            throw new Error('VS Code Language Model API not available. Are you running inside VS Code Extension?');
        }
        try {
            console.log('📞 Calling selectChatModels()...');
            // ✅ Get ALL available models (no filter)
            const allModels = await this.vscode.lm.selectChatModels();
            console.log(`✅ selectChatModels() returned ${allModels.length} models`);
            console.log(`\n📋 ALL AVAILABLE MODELS (${allModels.length} found):`);
            allModels.forEach((m, i) => {
                console.log(`  [${i}] ${m.id}`);
                console.log(`      vendor: ${m.vendor}`);
                console.log(`      family: ${m.family || 'N/A'}`);
                console.log(`      version: ${m.version || 'N/A'}`);
                console.log(`      maxInputTokens: ${m.maxInputTokens || 'N/A'}`);
            });
            if (allModels.length === 0) {
                throw new Error('No language models available. Is GitHub Copilot extension installed?');
            }
            // 🎯 FILTER OUT known problematic models AND prioritize working ones
            const preferredModelIds = [
                'copilot-gpt-4o',
                'copilot-gpt-4',
                'gpt-4o',
                'gpt-4-turbo',
                'gpt-4'
            ];
            // Try to find a preferred model first
            let selectedModel = null;
            for (const modelId of preferredModelIds) {
                const model = allModels.find((m) => m.id === modelId || m.id.includes(modelId));
                if (model) {
                    console.log(`✅ Found preferred model: ${model.id}`);
                    selectedModel = model;
                    break;
                }
            }
            // If no preferred model, filter out problematic ones
            if (!selectedModel) {
                console.warn('⚠️ No preferred model found, filtering...');
                const validModels = allModels.filter((m) => {
                    const id = m.id || '';
                    // Skip gpt-5-mini and gpt-5 (NOT SUPPORTED)
                    if (id.includes('gpt-5')) {
                        console.log(`  ❌ Skipping ${id} (gpt-5 not supported)`);
                        return false;
                    }
                    // Skip models with version numbers (gpt-4.1, gpt-4o.1, etc)
                    if (/\.\d+$/.test(id)) {
                        console.log(`  ❌ Skipping ${id} (versioned model)`);
                        return false;
                    }
                    // Skip non-copilot vendors
                    if (m.vendor && m.vendor !== 'copilot') {
                        console.log(`  ❌ Skipping ${id} (vendor: ${m.vendor})`);
                        return false;
                    }
                    return true;
                });
                if (validModels.length > 0) {
                    selectedModel = validModels[0];
                }
            }
            console.log(`\n✅ VALID MODELS after filtering`);
            if (!selectedModel) {
                throw new Error('No compatible models available. Models found: ' +
                    allModels.map((m) => m.id).join(', '));
            }
            const model = selectedModel;
            console.log(`\n🎯 SELECTED MODEL: ${model.id}`);
            console.log(`   vendor: ${model.vendor}`);
            console.log(`   family: ${model.family || 'N/A'}`);
            console.log(`   Sending chat request...\n`);
            const messages = [
                this.vscode.LanguageModelChatMessage.User(prompt)
            ];
            console.log(`📤 Calling model.sendRequest() with ${messages.length} messages...`);
            const chatResponse = await model.sendRequest(messages, {}, new this.vscode.CancellationTokenSource().token);
            console.log(`✅ sendRequest() completed, reading response...`);
            let result = '';
            for await (const fragment of chatResponse.text) {
                result += fragment;
            }
            if (!result || result.trim().length === 0) {
                throw new Error(`Model ${model.id} returned empty response`);
            }
            console.log(`✅ Received ${result.length} characters\n`);
            return result.trim();
        }
        catch (error) {
            console.error('\n❌ COPILOT ERROR:', error.message);
            if (error.cause)
                console.error('Cause:', error.cause);
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