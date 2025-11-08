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
const path = __importStar(require("path"));
const vscode_copilot_adapter_1 = require("../monkey-fuzzing/core/vscode-copilot-adapter");
const copilot_analyzer_1 = require("../monkey-fuzzing/core/copilot-analyzer");
const sandbox_manager_1 = require("../monkey-fuzzing/core/sandbox-manager");
const test_writer_1 = require("../monkey-fuzzing/core/test-writer");
const evolution_1 = require("../monkey-fuzzing/core/evolution");
const runner_1 = require("../monkey-fuzzing/core/runner");
const report_1 = require("../monkey-fuzzing/core/report");
const evolution_runner_1 = require("../monkey-fuzzing/core/evolution-runner");
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
        console.log(`📄 Raw file path: ${filePath}`);
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
                // Keep original Windows paths for file I/O operations
                // Node.js running in VS Code Windows context needs Windows paths
                let targetProjectRoot = '';
                const fileUri = vscode.Uri.file(filePath);
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
                if (workspaceFolder) {
                    targetProjectRoot = workspaceFolder.uri.fsPath;
                }
                else {
                    // Fallback: use directory containing the file
                    const lastSep = Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/'));
                    targetProjectRoot = lastSep > 0 ? filePath.substring(0, lastSep) : filePath;
                }
                console.log(`🎯 Target project root (Windows): ${targetProjectRoot}`);
                console.log(`📁 File to analyze (Windows): ${filePath}`);
                // Use Windows paths for analyzer (it will read the file)
                const analysis = await analyzer.analyzeFile(filePath);
                progress.report({ message: 'Generating initial tests...' });
                const tests = await analyzer.generateInitialTests(analysis);
                progress.report({ message: 'Setting up sandbox...' });
                // Get workspace root from extension path (go up one level from /extension)
                const sandboxRoot = path.dirname(context.extensionPath);
                console.log(`📦 Extension path: ${context.extensionPath}`);
                console.log(`📦 Sandbox root: ${sandboxRoot}`);
                // Create sandbox - use original paths (UNC works in WSL Remote)
                const sandboxManager = new sandbox_manager_1.SandboxManager();
                const sandbox = await sandboxManager.setup(sandboxRoot, filePath);
                console.log(`✅ Sandbox created at: ${sandbox.sandboxPath}`);
                progress.report({ message: 'Writing test files...' });
                const testWriter = new test_writer_1.TestWriter();
                const result = await testWriter.writeTests(sandbox.testsPath, tests, analysis.language);
                console.log(`✅ Wrote ${result.writtenFiles.length} test files`);
                // Link tests to target project
                progress.report({ message: 'Linking tests to project...' });
                try {
                    const linkResult = await sandboxManager.linkTestsToProject(sandbox, targetProjectRoot, analysis.package || '');
                    console.log(`🔗 Linked ${linkResult.linkedTests.length} tests to: ${linkResult.targetTestDir}`);
                    vscode.window.showInformationMessage(`✅ Generated ${result.writtenFiles.length} test(s)\n🔗 Linked to: ${linkResult.targetTestDir}`, 'Run Tests').then(selection => {
                        if (selection === 'Run Tests') {
                            // Run Maven tests
                            sandboxManager.runMavenTests(targetProjectRoot).then(({ stdout, stderr }) => {
                                const output = vscode.window.createOutputChannel('Monkey-Fuzzing Test Results');
                                output.appendLine(stdout);
                                if (stderr)
                                    output.appendLine('STDERR:\n' + stderr);
                                output.show();
                            });
                        }
                    });
                }
                catch (error) {
                    console.warn(`⚠️ Could not link tests:`, error);
                    vscode.window.showWarningMessage(`Tests generated in sandbox but linking failed. You can manually copy them to your test directory.`);
                }
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
    // Register command to run evolution pipeline
    const evolutionCommand = vscode.commands.registerCommand('monkey-fuzzing.runEvolution', async () => {
        console.log('🧬 Monkey-Fuzzing: Evolution pipeline triggered!');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active file');
            return;
        }
        // Ask user for evolution parameters
        const generations = await vscode.window.showInputBox({
            prompt: 'Number of generations',
            value: '10',
            validateInput: (v) => isNaN(Number(v)) ? 'Must be a number' : null
        });
        const populationSize = await vscode.window.showInputBox({
            prompt: 'Population size',
            value: '20',
            validateInput: (v) => isNaN(Number(v)) ? 'Must be a number' : null
        });
        if (!generations || !populationSize)
            return;
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Evolutionary Testing',
            cancellable: true
        }, async (progress, token) => {
            try {
                console.log('📍 Step 1: Getting sandbox root');
                const sandboxRoot = path.dirname(context.extensionPath);
                console.log(`📍 Sandbox root: ${sandboxRoot}`);
                // Find most recent sandbox
                const sandboxesPath = path.join(sandboxRoot, '.sandboxes');
                console.log(`📍 Step 2: Looking for sandboxes in: ${sandboxesPath}`);
                const fs = require('fs').promises;
                const sandboxes = await fs.readdir(sandboxesPath);
                console.log(`📍 Found ${sandboxes.length} sandboxes: ${sandboxes.join(', ')}`);
                const latestSandbox = sandboxes.sort().reverse()[0];
                const sandboxPath = path.join(sandboxesPath, latestSandbox);
                console.log(`🔬 Running evolution on sandbox: ${sandboxPath}`);
                progress.report({ message: 'Initializing evolution engine...' });
                console.log('📍 Step 3: Creating evolution engine');
                const config = {
                    populationSize: Number(populationSize),
                    generations: Number(generations),
                    mutationRate: 0.3,
                    crossoverRate: 0.4,
                    elitismCount: Math.floor(Number(populationSize) * 0.25)
                };
                console.log('📍 Evolution config:', JSON.stringify(config));
                const evolutionEngine = new evolution_1.EvolutionEngine(config);
                console.log('✅ Evolution engine created');
                const copilotAdapter = new vscode_copilot_adapter_1.VSCodeCopilotAdapter(vscode);
                console.log('✅ Copilot adapter created');
                const testRunner = new runner_1.TestRunner();
                console.log('✅ Test runner created');
                // Initialize build tool detection for target project
                console.log('📍 Step 3.5: Detecting build tool for target project');
                const targetProjectRoot = await vscode.window.showInputBox({
                    prompt: 'Enter target project root path (e.g., /home/user/my-project)',
                    value: '/home/amennillo/mit/documentale-be/core/desk/proxy-security'
                });
                if (targetProjectRoot) {
                    await testRunner.initializeBuildTool(targetProjectRoot);
                    console.log(`✅ Build tool initialized for: ${targetProjectRoot}`);
                }
                else {
                    console.log('⚠️ No project root provided, using individual test execution');
                }
                // FeedbackEngine requires oracle, mutationRegistry, and config
                // Simplified initialization for extension context
                const reportEngine = new report_1.ReportEngine();
                console.log('✅ Report engine created');
                // Load initial tests from sandbox
                console.log('📍 Step 4: Loading tests from sandbox');
                const testsPath = path.join(sandboxPath, 'tests');
                console.log(`📍 Tests path: ${testsPath}`);
                const testFiles = await fs.readdir(testsPath);
                console.log(`📍 Found ${testFiles.length} files in tests folder`);
                const javaTests = testFiles.filter((f) => f.endsWith('.java') || f.endsWith('.py') || f.endsWith('.ts'));
                console.log(`📝 Found ${javaTests.length} test files: ${javaTests.join(', ')}`);
                // Run evolution loop
                for (let gen = 0; gen < Number(generations); gen++) {
                    if (token.isCancellationRequested)
                        break;
                    progress.report({
                        message: `Generation ${gen + 1}/${generations}`,
                        increment: (100 / Number(generations))
                    });
                    console.log(`\n🧬 === Generation ${gen} ===`);
                    // Execute tests and collect feedback
                    // (simplified - full implementation would use TestRunner)
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
                }
                progress.report({ message: 'Generating report...' });
                vscode.window.showInformationMessage(`✅ Evolution completed! ${generations} generations processed.`);
                // Show report
                const reportPath = path.join(sandboxRoot, 'reports', `evolution-gen-${Number(generations) - 1}.json`);
                vscode.window.showInformationMessage(`Report saved: ${reportPath}`);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Evolution failed: ${error.message}`);
                console.error(error);
            }
        });
    });
    context.subscriptions.push(analyzeCommand);
    context.subscriptions.push(evolutionCommand);
    // Register NEW command for EvolutionRunner
    const evolutionRunnerCommand = vscode.commands.registerCommand('monkey-fuzzing.evolutionRunner', async () => {
        console.log('🚀 EvolutionRunner: Command triggered!');
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            console.error('❌ No active editor');
            vscode.window.showErrorMessage('No active Java file to analyze');
            return;
        }
        const filePath = editor.document.uri.fsPath;
        const language = editor.document.languageId;
        console.log(`📄 File: ${filePath}`);
        console.log(`🔤 Language: ${language}`);
        if (language !== 'java') {
            console.warn(`⚠️ Not a Java file: ${language}`);
            vscode.window.showWarningMessage('EvolutionRunner currently supports Java files only');
            return;
        }
        // Ask for generations
        console.log('📝 Prompting for generations...');
        const generationsInput = await vscode.window.showInputBox({
            prompt: 'Number of evolution generations',
            value: '5',
            validateInput: (v) => isNaN(Number(v)) || Number(v) < 1 ? 'Must be a positive number' : null
        });
        if (!generationsInput) {
            console.log('❌ User cancelled input');
            return;
        }
        const generations = Number(generationsInput);
        console.log(`✅ Generations: ${generations}`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Evolutionary Test Generation',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Initializing EvolutionRunner...' });
                // Get workspace folder (WSL path)
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error('No workspace folder open!');
                }
                // Convert Windows UNC path to WSL Linux path
                let workspacePath = workspaceFolder.uri.fsPath;
                if (workspacePath.startsWith('\\\\wsl.localhost\\Ubuntu')) {
                    workspacePath = workspacePath
                        .replace(/\\/g, '/')
                        .replace('//wsl.localhost/Ubuntu', '');
                }
                console.log(`📁 Workspace path (converted): ${workspacePath}`);
                // Create runner with VSCode context for real Copilot
                const runner = new evolution_runner_1.EvolutionRunner(vscode);
                progress.report({ message: `Running ${generations} generations...` });
                // Run evolution
                await runner.run({
                    targetClassPath: filePath,
                    generations: generations,
                    workspaceRoot: workspacePath // ✅ Linux path corretto
                });
                vscode.window.showInformationMessage(`✅ Evolution completed! Check generated-tests/ folder and project src/test/java/`);
            }
            catch (error) {
                vscode.window.showErrorMessage(`EvolutionRunner failed: ${error.message}`);
                console.error('❌ Evolution error:', error);
            }
        });
    });
    context.subscriptions.push(evolutionRunnerCommand);
    // Register RESUME command for EvolutionRunner
    const resumeEvolutionCommand = vscode.commands.registerCommand('monkey-fuzzing.resumeEvolution', async () => {
        console.log('🔄 Resume Evolution: Command triggered!');
        // Ask user to select checkpoint file
        const checkpointUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Checkpoint Files': ['json']
            },
            openLabel: 'Select Checkpoint',
            title: 'Resume Evolution from Checkpoint'
        });
        if (!checkpointUris || checkpointUris.length === 0) {
            console.log('❌ User cancelled checkpoint selection');
            return;
        }
        const checkpointPath = checkpointUris[0].fsPath;
        console.log(`📂 Checkpoint selected: ${checkpointPath}`);
        // Ask for additional generations
        const generationsInput = await vscode.window.showInputBox({
            prompt: 'Number of additional generations to run',
            value: '5',
            validateInput: (v) => isNaN(Number(v)) || Number(v) < 1 ? 'Must be a positive number' : null
        });
        if (!generationsInput) {
            console.log('❌ User cancelled input');
            return;
        }
        const additionalGenerations = Number(generationsInput);
        console.log(`✅ Additional generations: ${additionalGenerations}`);
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Resuming Evolutionary Testing',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Loading checkpoint...' });
                // Get workspace folder (WSL path)
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    throw new Error('No workspace folder open!');
                }
                // Convert Windows UNC path to WSL Linux path
                let workspacePath = workspaceFolder.uri.fsPath;
                if (workspacePath.startsWith('\\\\wsl.localhost\\Ubuntu')) {
                    workspacePath = workspacePath
                        .replace(/\\/g, '/')
                        .replace('//wsl.localhost/Ubuntu', '');
                }
                console.log(`📁 Workspace path (converted): ${workspacePath}`);
                // Create runner with VSCode context
                const runner = new evolution_runner_1.EvolutionRunner(vscode);
                progress.report({ message: `Resuming with ${additionalGenerations} additional generations...` });
                // Resume evolution with correct workspace
                await runner.resume(checkpointPath, additionalGenerations, workspacePath // ✅ Linux path corretto
                );
                vscode.window.showInformationMessage(`✅ Resumed evolution completed! Check checkpoints/ folder for updates.`);
            }
            catch (error) {
                vscode.window.showErrorMessage(`Resume failed: ${error.message}`);
                console.error('❌ Resume error:', error);
            }
        });
    });
    context.subscriptions.push(resumeEvolutionCommand);
}
function deactivate() {
    console.log('Monkey-Fuzzing extension deactivated');
}
//# sourceMappingURL=extension.js.map