/**
 * ===========================================================
 * RUNNER.TS (REAL EXECUTION MODE)
 * ===========================================================
 * Test Runner universale:
 *  - scrive i test generati su file reali
 *  - invoca il test framework corretto (JUnit, PyTest, Jest, etc.)
 *  - raccoglie risultati, tempi ed errori
 * ===========================================================
 */

import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import { performance } from "perf_hooks";
// local deterministic hash (non-cryptographic) consistent per session
function deterministicHash(str: string): string {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}
import { ErrorClassifier, NormalizedError } from './error-classifier.js';
import { detectBuildTool, type BuildToolAdapter } from './build-tool-adapter.js';
import { GeneratedTest, GeneratedTestSuite } from './types.js';

// ===========================================================
// 🔹 INTERFACCE
// ===========================================================
// Importate da types.ts per consistency

export interface TestExecutionResult {
    testName: string;
    passed: boolean;
    executionTime: number;
    stdout?: string;
    stderr?: string;
    error?: string;
}

// ===========================================================
// 🧠 TEST RUNNER
// ===========================================================
export class TestRunner {
    private errorClassifier = new ErrorClassifier();
    private lastErrors: NormalizedError[] = [];
    private buildToolAdapter: BuildToolAdapter | null = null;
    private projectRoot: string | null = null;
    private copilotAdapter: any = null; // AI assistant for smart analysis

    constructor(private workspaceRoot = process.cwd()) { }

    /**
     * Set Copilot adapter for AI-powered features
     */
    setCopilotAdapter(adapter: any): void {
        this.copilotAdapter = adapter;
        console.log('[TestRunner] Copilot adapter configured');
    }

    /**
     * Initialize build tool detection for a project
     */
    async initializeBuildTool(projectRoot: string): Promise<void> {
        this.projectRoot = projectRoot;
        this.buildToolAdapter = await detectBuildTool(projectRoot);
        if (this.buildToolAdapter) {
            console.log(`[TestRunner] Detected build tool for project: ${projectRoot}`);
        }
    }

    /**
     * Esegue una test suite reale su filesystem
     * Se rilevato un build tool (Maven, Gradle, etc), lo usa automaticamente
     */
    async runGeneratedTests(suite: GeneratedTestSuite): Promise<TestExecutionResult[]> {
        // If we have a build tool adapter, use it for batch execution
        if (this.buildToolAdapter && this.projectRoot) {
            return this.runWithBuildTool(suite);
        }

        // Otherwise, fall back to individual test execution
        return this.runIndividualTests(suite);
    }

    /**
     * Run tests using detected build tool (Maven, Gradle, pytest, npm)
     */
    private async runWithBuildTool(suite: GeneratedTestSuite): Promise<TestExecutionResult[]> {
        const results: TestExecutionResult[] = [];
        
        console.log(`🧪 Running ${suite.tests.length} tests via build tool: ${this.projectRoot}`);
        
        try {
            // Step 1: Write test files to project test directory
            console.log(`📝 Writing tests to project...`);
            const testDir = await this.writeTestsToProject(suite);
            console.log(`✅ Tests written to: ${testDir}`);
            
            // Step 2: Compile the project
            console.log(`📦 Compiling project...`);
            const compileResult = await this.buildToolAdapter!.compile(this.projectRoot!);
            
            if (!compileResult.success && compileResult.errors.length > 0) {
                console.log(`⚠️ Compilation failed with ${compileResult.errors.length} errors`);
                compileResult.errors.slice(0, 3).forEach(e => console.log(`  - ${e.substring(0, 120)}`));
                
                // Classify compilation errors for feedback loop
                for (const error of compileResult.errors) {
                    const classified = this.errorClassifier.classify('compilation-error', error);
                    if (classified) this.lastErrors.push(classified);
                }
                
                // Return failed results - compilation failed, tests cannot run
                for (const test of suite.tests) {
                    results.push({
                        testName: test.name,
                        passed: false,
                        executionTime: 0,
                        stderr: compileResult.errors.join('\n'),
                        error: 'Compilation failed'
                    });
                }
                return results;
            }
            
            // Step 3: Run all tests via build tool
            console.log(`🧪 Executing tests via build tool...`);
            const start = performance.now();
            const buildResult = await this.buildToolAdapter!.runTests(this.projectRoot!);
            const end = performance.now();
            
            console.log(`📊 Build result: ${buildResult.testsRun} tests, ${buildResult.testsPassed} passed, ${buildResult.testsFailed} failed`);

            // Parse individual test results from build output
            const testsRan = buildResult.testsRun || suite.tests.length;
            const avgTime = (end - start) / (testsRan || 1);
            
            for (const test of suite.tests) {
                const classified = this.errorClassifier.classify(test.name, buildResult.stderr, buildResult.stdout);
                if (classified) this.lastErrors.push(classified);

                // Assume tests passed proportionally
                const passed = buildResult.success && buildResult.testsFailed === 0;
                
                results.push({
                    testName: test.name,
                    passed,
                    executionTime: avgTime,
                    stdout: buildResult.stdout,
                    stderr: buildResult.stderr,
                });
            }
        } catch (err: any) {
            console.error(`❌ Build tool execution failed:`, err.message);
            const classified = this.errorClassifier.classify('build-tool-execution', err.message);
            if (classified) this.lastErrors.push(classified);

            // All tests failed
            for (const test of suite.tests) {
                results.push({
                    testName: test.name,
                    passed: false,
                    executionTime: 0,
                    error: err.message,
                });
            }
        }

        return results;
    }

    /**
     * Write tests to project test directory
     * Detects project type and writes to appropriate location
     * For Java: extracts package and creates proper directory structure
     */
    private async writeTestsToProject(suite: GeneratedTestSuite): Promise<string> {
        // Detect test directory structure based on language
        let baseTestDir: string;
        
        if (suite.targetLanguage === 'java') {
            // Maven/Gradle: src/test/java
            baseTestDir = path.join(this.projectRoot!, 'src', 'test', 'java');
        } else if (suite.targetLanguage === 'python') {
            // Python: tests/
            baseTestDir = path.join(this.projectRoot!, 'tests');
        } else {
            // TypeScript/JavaScript/Rust/etc: src/__tests__ or tests/
            baseTestDir = path.join(this.projectRoot!, 'src', '__tests__');
        }

        await fs.mkdir(baseTestDir, { recursive: true });

        // For Java: merge all tests into a single class file
        if (suite.targetLanguage === 'java' && suite.tests.length > 0) {
            const { TestWriter } = await import('./test-writer.js');
            const writer = new TestWriter();
            await writer.writeTests(baseTestDir, suite.tests, suite.targetLanguage, this.copilotAdapter);
            console.log(`✅ Merged ${suite.tests.length} Java tests into single class file`);
        } else {
            // For other languages: write individual test files
            for (const test of suite.tests) {
                const ext = this.getFileExtension(test.metadata.language || suite.targetLanguage);
                const filePath = path.join(baseTestDir, `${test.name}.${ext}`);
                
                if (test.code) {
                    await fs.writeFile(filePath, test.code, 'utf-8');
                    console.log(`📝 Writing test to: ${test.name}.${ext}`);
                }
            }
        }

        return baseTestDir;
    }

    /**
     * Run tests individually (fallback when no build tool detected)
     */
    private async runIndividualTests(suite: GeneratedTestSuite): Promise<TestExecutionResult[]> {
        const results: TestExecutionResult[] = [];
        const suiteDir = await this.prepareSuiteDirectory(suite);

        for (const test of suite.tests) {
            const start = performance.now();
            try {
                const filePath = await this.writeTestFile(test, suiteDir, suite.targetLanguage);
                const execResult = await this.executeTestFile(filePath, suite.targetLanguage || 'typescript');
                const end = performance.now();

                const classified = this.errorClassifier.classify(test.name, execResult.stderr, execResult.stdout);
                if (classified) this.lastErrors.push(classified);
                results.push({
                    testName: test.name,
                    passed: execResult.code === 0,
                    executionTime: end - start,
                    stdout: execResult.stdout,
                    stderr: execResult.stderr,
                });
            } catch (err: any) {
                const end = performance.now();
                const classified = this.errorClassifier.classify(test.name, err.message);
                if (classified) this.lastErrors.push(classified);
                results.push({
                    testName: test.name,
                    passed: false,
                    executionTime: end - start,
                    error: err.message,
                });
            }
        }

        return results;
    }

    /**
     * Scrive ogni test in file separato nel linguaggio target
     */
    private async writeTestFile(test: GeneratedTest, dir: string, targetLanguage?: string): Promise<string> {
        const ext = this.getFileExtension(test.metadata.language || targetLanguage || 'typescript');
        const filePath = path.join(dir, `${test.name}.${ext}`);

        if (!test.code) {
            throw new Error(`Missing code for test ${test.name}`);
        }

        await fs.writeFile(filePath, test.code, "utf-8");
        return filePath;
    }

    /**
     * Prepara la directory per la suite
     */
    private async prepareSuiteDirectory(suite: GeneratedTestSuite): Promise<string> {
        const suiteHash = deterministicHash(suite.id);
        const dir = suite.outputDir || path.join(this.workspaceRoot, "generated-tests", suiteHash);
        await fs.mkdir(dir, { recursive: true });
        return dir;
    }

    /**
     * Esegue il test file nel linguaggio specificato
     */
    private async executeTestFile(filePath: string, lang: string): Promise<{ code: number; stdout: string; stderr: string }> {
        const cmd = this.buildCommand(lang, filePath);

        return new Promise((resolve, reject) => {
            const proc = spawn(cmd.command, cmd.args, { shell: true });
            let stdout = "";
            let stderr = "";

            proc.stdout.on("data", (d) => (stdout += d.toString()));
            proc.stderr.on("data", (d) => (stderr += d.toString()));

            proc.on("close", (code) => {
                resolve({ code: code ?? -1, stdout, stderr });
            });

            proc.on("error", (err) => reject(err));
        });
    }

    /**
     * Costruisce comando corretto per linguaggio
     */
    private buildCommand(lang: string, filePath: string): { command: string; args: string[] } {
        switch (lang) {
            case "java":
                // Supporta JUnit se importato nel test
                return { command: "bash", args: [`-c "javac ${filePath} && java -cp . org.junit.runner.JUnitCore $(basename ${filePath} .java)"`] };
            case "python":
                return { command: "python3", args: [filePath] };
            case "typescript":
                return { command: "npx", args: ["ts-node", filePath] };
            case "rust":
                return { command: "bash", args: [`-c "rustc ${filePath} -o ${filePath}.out && ${filePath}.out"`] };
            default:
                throw new Error(`Unsupported language: ${lang}`);
        }
    }

    /**
     * Determina estensione file
     */
    private getFileExtension(lang?: string): string {
        switch (lang) {
            case "java":
                return "java";
            case "python":
                return "py";
            case "typescript":
                return "ts";
            case "rust":
                return "rs";
            default:
                return "txt";
        }
    }

    /**
     * Calcola hash deterministico per la suite
     */
    generateSuiteHash(suite: GeneratedTestSuite): string {
        const content = suite.tests.map((t) => `${t.name}:${JSON.stringify(t.input)}`).join("|");
        return deterministicHash(content);
    }

    getNormalizedErrors(): NormalizedError[] { return this.lastErrors; }
    resetErrors(): void { this.lastErrors = []; this.errorClassifier.reset(); }
}
