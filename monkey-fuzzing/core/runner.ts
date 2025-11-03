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
import { ErrorClassifier, NormalizedError } from './error-classifier';

// ===========================================================
// 🔹 INTERFACCE
// ===========================================================
export interface GeneratedTest {
    name: string;
    input: any;
    expected: any;
    confidence: number;
    language?: "java" | "python" | "rust" | "typescript";
    code?: string; // test code già generato
}

export interface GeneratedTestSuite {
    id: string;
    targetLanguage: "java" | "python" | "rust" | "typescript";
    tests: GeneratedTest[];
    outputDir?: string;
}

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
    constructor(private workspaceRoot = process.cwd()) { }

    /**
     * Esegue una test suite reale su filesystem
     */
    async runGeneratedTests(suite: GeneratedTestSuite): Promise<TestExecutionResult[]> {
        const results: TestExecutionResult[] = [];
        const suiteDir = await this.prepareSuiteDirectory(suite);

        for (const test of suite.tests) {
            const start = performance.now();
            try {
                const filePath = await this.writeTestFile(test, suiteDir);
                const execResult = await this.executeTestFile(filePath, suite.targetLanguage);
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
    private async writeTestFile(test: GeneratedTest, dir: string): Promise<string> {
        const ext = this.getFileExtension(test.language);
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
