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
const error_classifier_js_1 = require("./error-classifier.js");
const build_tool_adapter_js_1 = require("./build-tool-adapter.js");
// ===========================================================
// 🧠 TEST RUNNER
// ===========================================================
class TestRunner {
    constructor(workspaceRoot = process.cwd()) {
        this.workspaceRoot = workspaceRoot;
        this.errorClassifier = new error_classifier_js_1.ErrorClassifier();
        this.lastErrors = [];
        this.buildToolAdapter = null;
        this.projectRoot = null;
        this.copilotAdapter = null; // AI assistant for smart analysis
    }
    /**
     * Set Copilot adapter for AI-powered features
     */
    setCopilotAdapter(adapter) {
        this.copilotAdapter = adapter;
        console.log('[TestRunner] Copilot adapter configured');
    }
    /**
     * Initialize build tool detection for a project
     */
    async initializeBuildTool(projectRoot) {
        this.projectRoot = projectRoot;
        this.buildToolAdapter = await (0, build_tool_adapter_js_1.detectBuildTool)(projectRoot);
        if (this.buildToolAdapter) {
            console.log(`[TestRunner] Detected build tool for project: ${projectRoot}`);
        }
    }
    /**
     * Esegue una test suite reale su filesystem
     * Se rilevato un build tool (Maven, Gradle, etc), lo usa automaticamente
     */
    async runGeneratedTests(suite) {
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
    async runWithBuildTool(suite) {
        const results = [];
        console.log(`🧪 Running ${suite.tests.length} tests via build tool: ${this.projectRoot}`);
        try {
            // Step 1: Write test files to project test directory
            console.log(`📝 Writing tests to project...`);
            const testDir = await this.writeTestsToProject(suite);
            console.log(`✅ Tests written to: ${testDir}`);
            // Step 2: Compile the project
            console.log(`📦 Compiling project...`);
            const compileResult = await this.buildToolAdapter.compile(this.projectRoot);
            if (!compileResult.success && compileResult.errors.length > 0) {
                console.log(`⚠️ Compilation failed with ${compileResult.errors.length} errors`);
                compileResult.errors.slice(0, 3).forEach(e => console.log(`  - ${e.substring(0, 120)}`));
                // 🔍 Check for missing dependencies using Copilot
                const { analyzeMissingDependencies, formatDependencyWarning } = await Promise.resolve().then(() => __importStar(require('./dependency-checker.js')));
                const missing = await analyzeMissingDependencies(compileResult.errors, this.copilotAdapter);
                if (missing.length > 0) {
                    console.error(formatDependencyWarning(missing));
                }
                // Classify compilation errors for feedback loop
                for (const error of compileResult.errors) {
                    const classified = this.errorClassifier.classify('compilation-error', error);
                    if (classified)
                        this.lastErrors.push(classified);
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
            const start = perf_hooks_1.performance.now();
            const buildResult = await this.buildToolAdapter.runTests(this.projectRoot);
            const end = perf_hooks_1.performance.now();
            console.log(`📊 Build result: ${buildResult.testsRun} tests, ${buildResult.testsPassed} passed, ${buildResult.testsFailed} failed`);
            // Parse individual test results from build output
            const testsRan = buildResult.testsRun || suite.tests.length;
            const avgTime = (end - start) / (testsRan || 1);
            for (const test of suite.tests) {
                const classified = this.errorClassifier.classify(test.name, buildResult.stderr, buildResult.stdout);
                if (classified)
                    this.lastErrors.push(classified);
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
        }
        catch (err) {
            console.error(`❌ Build tool execution failed:`, err.message);
            const classified = this.errorClassifier.classify('build-tool-execution', err.message);
            if (classified)
                this.lastErrors.push(classified);
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
    async writeTestsToProject(suite) {
        // Detect test directory structure based on language
        let baseTestDir;
        if (suite.targetLanguage === 'java') {
            // Maven/Gradle: src/test/java
            baseTestDir = path_1.default.join(this.projectRoot, 'src', 'test', 'java');
        }
        else if (suite.targetLanguage === 'python') {
            // Python: tests/
            baseTestDir = path_1.default.join(this.projectRoot, 'tests');
        }
        else {
            // TypeScript/JavaScript/Rust/etc: src/__tests__ or tests/
            baseTestDir = path_1.default.join(this.projectRoot, 'src', '__tests__');
        }
        await promises_1.default.mkdir(baseTestDir, { recursive: true });
        // For Java: merge all tests into a single class file
        if (suite.targetLanguage === 'java' && suite.tests.length > 0) {
            const { TestWriter } = await Promise.resolve().then(() => __importStar(require('./test-writer.js')));
            const writer = new TestWriter();
            await writer.writeTests(baseTestDir, suite.tests, suite.targetLanguage, this.copilotAdapter);
            console.log(`✅ Merged ${suite.tests.length} Java tests into single class file`);
        }
        else {
            // For other languages: write individual test files
            for (const test of suite.tests) {
                const ext = this.getFileExtension(test.metadata.language || suite.targetLanguage);
                const filePath = path_1.default.join(baseTestDir, `${test.name}.${ext}`);
                if (test.code) {
                    await promises_1.default.writeFile(filePath, test.code, 'utf-8');
                    console.log(`📝 Writing test to: ${test.name}.${ext}`);
                }
            }
        }
        return baseTestDir;
    }
    /**
     * Run tests individually (fallback when no build tool detected)
     */
    async runIndividualTests(suite) {
        const results = [];
        const suiteDir = await this.prepareSuiteDirectory(suite);
        for (const test of suite.tests) {
            const start = perf_hooks_1.performance.now();
            try {
                const filePath = await this.writeTestFile(test, suiteDir, suite.targetLanguage);
                const execResult = await this.executeTestFile(filePath, suite.targetLanguage || 'typescript');
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
    async writeTestFile(test, dir, targetLanguage) {
        const ext = this.getFileExtension(test.metadata.language || targetLanguage || 'typescript');
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