/**
 * =============================================================
 * VS CODE EXTENSION - MONKEY FUZZING COMMAND
 * =============================================================
 * Registers commands to run Monkey-Fuzzing from VS Code
 * =============================================================
 */

import * as vscode from 'vscode';
import { VSCodeCopilotAdapter } from '../monkey-fuzzing/core/vscode-copilot-adapter';
import { CopilotAnalyzer } from '../monkey-fuzzing/core/copilot-analyzer';
import { SandboxManager } from '../monkey-fuzzing/core/sandbox-manager';
import { TestWriter } from '../monkey-fuzzing/core/test-writer';

export function activate(context: vscode.ExtensionContext) {
  console.log('Monkey-Fuzzing extension activated');

  // Register command to analyze current file
  const analyzeCommand = vscode.commands.registerCommand(
    'monkey-fuzzing.analyzeCurrentFile',
    async () => {
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

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Monkey-Fuzzing Analysis',
          cancellable: false
        },
        async (progress) => {
          try {
            progress.report({ message: 'Initializing Copilot...' });
            
            // Create real Copilot adapter using VS Code API
            const copilotAdapter = new VSCodeCopilotAdapter(vscode);
            const analyzer = new CopilotAnalyzer(copilotAdapter);

            progress.report({ message: 'Analyzing file structure...' });
            
            // Determine the project root: try to find workspace folder containing the file
            let targetProjectRoot = '';
            const fileUri = vscode.Uri.file(filePath);
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            
            if (workspaceFolder) {
              targetProjectRoot = workspaceFolder.uri.fsPath;
            } else {
              // Fallback: use directory containing the file
              targetProjectRoot = filePath.substring(0, filePath.lastIndexOf(filePath.includes('\\') ? '\\' : '/'));
            }
            
            console.log(`🎯 Target project root: ${targetProjectRoot}`);
            console.log(`📁 File to analyze: ${filePath}`);
            
            const analysis = await analyzer.analyzeFile(targetProjectRoot, filePath);

            progress.report({ message: 'Generating initial tests...' });
            const tests = await analyzer.generateInitialTests(analysis);

            progress.report({ message: 'Setting up sandbox...' });
            
            // Get extension's workspace root to create sandboxes there
            // This assumes the extension workspace is the Monkey-Fuzzing workspace
            const extensionWorkspace = context.extensionPath;
            const sandboxRoot = extensionWorkspace.replace(/[\\\/]extension$/, ''); // Go up from extension/ folder
            
            console.log(`📦 Sandbox root: ${sandboxRoot}`);
            
            // Create sandbox in monkey-fuzzing workspace root
            const sandboxManager = new SandboxManager();
            const sandbox = await sandboxManager.setup(sandboxRoot, filePath);
            
            console.log(`✅ Sandbox created at: ${sandbox.sandboxPath}`);

            progress.report({ message: 'Writing test files...' });
            const testWriter = new TestWriter();
            const result = await testWriter.writeTests(sandbox.testsPath, tests, analysis.language as any);

            vscode.window.showInformationMessage(
              `✅ Generated ${result.writtenFiles.length} test(s) at ${sandbox.sandboxPath}`
            );

            // Open first test file
            if (result.writtenFiles.length > 0) {
              const doc = await vscode.workspace.openTextDocument(result.writtenFiles[0]);
              await vscode.window.showTextDocument(doc);
            }

          } catch (error) {
            vscode.window.showErrorMessage(
              `Monkey-Fuzzing failed: ${(error as Error).message}`
            );
            console.error(error);
          }
        }
      );
    }
  );

  context.subscriptions.push(analyzeCommand);
}

export function deactivate() {
  console.log('Monkey-Fuzzing extension deactivated');
}
