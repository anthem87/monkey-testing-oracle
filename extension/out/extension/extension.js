"use strict";
/**
 * =============================================================
 * VS CODE EXTENSION - MONKEY FUZZING COMMAND
 * =============================================================
 * Registers commands to run Monkey-Fuzzing from VS Code
 * =============================================================
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const vscode_copilot_adapter_1 = require("../monkey-fuzzing/core/vscode-copilot-adapter");
const copilot_analyzer_1 = require("../monkey-fuzzing/core/copilot-analyzer");
const sandbox_manager_1 = require("../monkey-fuzzing/core/sandbox-manager");
const test_writer_1 = require("../monkey-fuzzing/core/test-writer");
function activate(context) {
    console.log('Monkey-Fuzzing extension activated');
    // Register command to analyze current file
    const analyzeCommand = vscode.commands.registerCommand('monkey-fuzzing.analyzeCurrentFile', async () => {
        console.log('🚀 Monkey-Fuzzing: Command triggered!');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active file to analyze');
            console.error('❌ No active editor');
            return;
        }
        const filePath = editor.document.uri.fsPath;
        const language = editor.document.languageId;
        console.log(`📄 Analyzing file: ${filePath}`);
        console.log(`🔤 Language detected: ${language}`);
        if (!['java', 'python', 'typescript', 'javascript'].includes(language)) {
            vscode.window.showWarningMessage(`Language ${language} may not be fully supported`);
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Monkey-Fuzzing Analysis',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Initializing Copilot...' });
                // Create real Copilot adapter using VS Code API
                const copilotAdapter = new vscode_copilot_adapter_1.VSCodeCopilotAdapter(vscode);
                const analyzer = new copilot_analyzer_1.CopilotAnalyzer(copilotAdapter);
                progress.report({ message: 'Analyzing file structure...' });
                const analysis = await analyzer.analyzeFile(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', filePath);
                progress.report({ message: 'Generating initial tests...' });
                const tests = await analyzer.generateInitialTests(analysis);
                progress.report({ message: 'Setting up sandbox...' });
                const sandboxManager = new sandbox_manager_1.SandboxManager();
                const projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
                const sandbox = await sandboxManager.setup(filePath, projectRoot);
                progress.report({ message: 'Writing test files...' });
                const testWriter = new test_writer_1.TestWriter();
                const result = await testWriter.writeTests(sandbox.testsPath, tests, analysis.language);
                vscode.window.showInformationMessage(`✅ Generated ${result.writtenFiles.length} test(s) at ${sandbox.sandboxPath}`);
                // Open first test file
                if (result.writtenFiles.length > 0) {
                    const doc = await vscode.workspace.openTextDocument(result.writtenFiles[0]);
                    await vscode.window.showTextDocument(doc);
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Monkey-Fuzzing failed: ${error.message}`);
                console.error(error);
            }
        });
    });
    context.subscriptions.push(analyzeCommand);
}
function deactivate() {
    console.log('Monkey-Fuzzing extension deactivated');
}
//# sourceMappingURL=extension.js.map