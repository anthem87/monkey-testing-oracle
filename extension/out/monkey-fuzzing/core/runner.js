"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunner = void 0;
const child_process_1 = require("child_process");
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const perf_hooks_1 = require("perf_hooks");
// local deterministic hash (non-cryptographic) consistent per session
function deterministicHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h).toString(36);
}
const error_classifier_1 = require("./error-classifier");
// ===========================================================
// 🧠 TEST RUNNER
// ===========================================================
class TestRunner {
    constructor(workspaceRoot = process.cwd()) {
        this.workspaceRoot = workspaceRoot;
        this.errorClassifier = new error_classifier_1.ErrorClassifier();
        this.lastErrors = [];
    }
    /**
     * Esegue una test suite reale su filesystem
     */
    async runGeneratedTests(suite) {
        const results = [];
        const suiteDir = await this.prepareSuiteDirectory(suite);
        for (const test of suite.tests) {
            const start = perf_hooks_1.performance.now();
            try {
                const filePath = await this.writeTestFile(test, suiteDir);
                const execResult = await this.executeTestFile(filePath, suite.targetLanguage);
                const end = perf_hooks_1.performance.now();
                const classified = this.errorClassifier.classify(test.name, execResult.stderr, execResult.stdout);
                if (classified)
                    this.lastErrors.push(classified);
                results.push({
                    testName: test.name,
                    passed: execResult.code === 0,
                    executionTime: end - start,
                    stdout: execResult.stdout,
                    stderr: execResult.stderr,
                });
            }
            catch (err) {
                const end = perf_hooks_1.performance.now();
                const classified = this.errorClassifier.classify(test.name, err.message);
                if (classified)
                    this.lastErrors.push(classified);
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
    async writeTestFile(test, dir) {
        const ext = this.getFileExtension(test.language);
        const filePath = path_1.default.join(dir, `${test.name}.${ext}`);
        if (!test.code) {
            throw new Error(`Missing code for test ${test.name}`);
        }
        await promises_1.default.writeFile(filePath, test.code, "utf-8");
        return filePath;
    }
    /**
     * Prepara la directory per la suite
     */
    async prepareSuiteDirectory(suite) {
        const suiteHash = deterministicHash(suite.id);
        const dir = suite.outputDir || path_1.default.join(this.workspaceRoot, "generated-tests", suiteHash);
        await promises_1.default.mkdir(dir, { recursive: true });
        return dir;
    }
    /**
     * Esegue il test file nel linguaggio specificato
     */
    async executeTestFile(filePath, lang) {
        const cmd = this.buildCommand(lang, filePath);
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(cmd.command, cmd.args, { shell: true });
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
    buildCommand(lang, filePath) {
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
    getFileExtension(lang) {
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
    generateSuiteHash(suite) {
        const content = suite.tests.map((t) => `${t.name}:${JSON.stringify(t.input)}`).join("|");
        return deterministicHash(content);
    }
    getNormalizedErrors() { return this.lastErrors; }
    resetErrors() { this.lastErrors = []; this.errorClassifier.reset(); }
}
exports.TestRunner = TestRunner;
//# sourceMappingURL=runner.js.map