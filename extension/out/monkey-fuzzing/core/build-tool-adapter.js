"use strict";
/**
 * =============================================================
 * BUILD TOOL ADAPTER
 * =============================================================
 * Agnostic interface for different build tools
 * Auto-detects project type and uses appropriate build command
 * =============================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NpmAdapter = exports.PytestAdapter = exports.GradleAdapter = exports.MavenAdapter = void 0;
exports.detectBuildTool = detectBuildTool;
const fs_1 = require("fs");
const fs_2 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
/**
 * Maven adapter for Java projects
 */
class MavenAdapter {
    async canHandle(projectRoot) {
        try {
            await fs_1.promises.access(path_1.default.join(projectRoot, 'pom.xml'));
            return true;
        }
        catch {
            return false;
        }
    }
    async runTests(projectRoot, testClass) {
        const testArg = testClass ? `-Dtest=${testClass}` : '';
        // Find Maven wrapper or use system mvn
        let mvnCommand = 'mvn';
        // Check for mvnw in parent directories
        let currentDir = projectRoot;
        for (let i = 0; i < 5; i++) {
            const mvnwPath = path_1.default.join(currentDir, 'mvnw');
            if ((0, fs_2.existsSync)(mvnwPath)) {
                mvnCommand = mvnwPath;
                break;
            }
            const parentDir = path_1.default.dirname(currentDir);
            if (parentDir === currentDir)
                break;
            currentDir = parentDir;
        }
        const command = `cd ${projectRoot} && ${mvnCommand} test ${testArg}`;
        const startTime = Date.now();
        try {
            // Set basic JAVA_HOME if not set (mvn will find Java itself)
            const env = { ...process.env };
            if (!env.JAVA_HOME) {
                env.JAVA_HOME = '/usr/lib/jvm/default-java';
            }
            const { stdout, stderr } = await execAsync(command, {
                maxBuffer: 1024 * 1024 * 10,
                env
            });
            const executionTime = Date.now() - startTime;
            // Parse Maven output
            const results = this.parseMavenOutput(stdout);
            return {
                success: true,
                stdout,
                stderr,
                exitCode: 0,
                executionTime,
                ...results
            };
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            const results = this.parseMavenOutput(error.stdout || '');
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1,
                executionTime,
                ...results
            };
        }
    }
    async compile(projectRoot) {
        // Find Maven wrapper or use system mvn
        let mvnCommand = 'mvn';
        let currentDir = projectRoot;
        for (let i = 0; i < 5; i++) {
            const mvnwPath = path_1.default.join(currentDir, 'mvnw');
            if ((0, fs_2.existsSync)(mvnwPath)) {
                mvnCommand = mvnwPath;
                break;
            }
            const parentDir = path_1.default.dirname(currentDir);
            if (parentDir === currentDir)
                break;
            currentDir = parentDir;
        }
        const command = `cd ${projectRoot} && ${mvnCommand} compile test-compile`;
        try {
            const env = { ...process.env };
            // Use sdkman Java if available, otherwise fallback
            if (!env.JAVA_HOME) {
                const homeDir = process.env.HOME || '/home/' + process.env.USER;
                env.JAVA_HOME = `${homeDir}/.sdkman/candidates/java/current`;
            }
            const { stdout, stderr } = await execAsync(command, {
                maxBuffer: 1024 * 1024 * 10,
                env
            });
            const errors = this.extractCompilationErrors(stdout + stderr);
            return { success: errors.length === 0, errors };
        }
        catch (error) {
            const output = (error.stdout || '') + (error.stderr || '');
            const errors = this.extractCompilationErrors(output);
            return { success: false, errors };
        }
    }
    parseMavenOutput(output) {
        // Parse "Tests run: X, Failures: Y, Errors: Z, Skipped: W"
        const match = output.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+)/);
        if (match) {
            const testsRun = parseInt(match[1]);
            const failures = parseInt(match[2]);
            const errors = parseInt(match[3]);
            return {
                testsRun,
                testsPassed: testsRun - failures - errors,
                testsFailed: failures + errors
            };
        }
        return { testsRun: 0, testsPassed: 0, testsFailed: 0 };
    }
    extractCompilationErrors(output) {
        const errors = [];
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes('[ERROR]') && !line.includes('BUILD FAILURE')) {
                // Keep [ERROR] prefix for error classification
                errors.push(line.trim());
            }
        }
        return errors;
    }
}
exports.MavenAdapter = MavenAdapter;
/**
 * Gradle adapter for Java/Kotlin projects
 */
class GradleAdapter {
    async canHandle(projectRoot) {
        try {
            await fs_1.promises.access(path_1.default.join(projectRoot, 'build.gradle'));
            return true;
        }
        catch {
            return false;
        }
    }
    async runTests(projectRoot, testClass) {
        const testArg = testClass ? `--tests ${testClass}` : '';
        const command = `cd ${projectRoot} && ./gradlew test ${testArg}`;
        const startTime = Date.now();
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                success: true,
                stdout,
                stderr,
                exitCode: 0,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
        catch (error) {
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
    }
    async compile(projectRoot) {
        try {
            await execAsync(`cd ${projectRoot} && ./gradlew compileTestJava`);
            return { success: true, errors: [] };
        }
        catch (error) {
            return { success: false, errors: [error.message] };
        }
    }
}
exports.GradleAdapter = GradleAdapter;
/**
 * pytest adapter for Python projects
 */
class PytestAdapter {
    async canHandle(projectRoot) {
        // Check for pytest.ini, setup.py, or pyproject.toml
        try {
            await fs_1.promises.access(path_1.default.join(projectRoot, 'pytest.ini'));
            return true;
        }
        catch {
            try {
                await fs_1.promises.access(path_1.default.join(projectRoot, 'setup.py'));
                return true;
            }
            catch {
                return false;
            }
        }
    }
    async runTests(projectRoot, testClass) {
        const testArg = testClass ? testClass : '';
        const command = `cd ${projectRoot} && pytest ${testArg} -v`;
        const startTime = Date.now();
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                success: true,
                stdout,
                stderr,
                exitCode: 0,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
        catch (error) {
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
    }
    async compile(_projectRoot) {
        // Python doesn't need compilation
        return { success: true, errors: [] };
    }
}
exports.PytestAdapter = PytestAdapter;
/**
 * npm/jest adapter for TypeScript/JavaScript projects
 */
class NpmAdapter {
    async canHandle(projectRoot) {
        try {
            await fs_1.promises.access(path_1.default.join(projectRoot, 'package.json'));
            return true;
        }
        catch {
            return false;
        }
    }
    async runTests(projectRoot, testClass) {
        const testArg = testClass ? `-- ${testClass}` : '';
        const command = `cd ${projectRoot} && npm test ${testArg}`;
        const startTime = Date.now();
        try {
            const { stdout, stderr } = await execAsync(command);
            return {
                success: true,
                stdout,
                stderr,
                exitCode: 0,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
        catch (error) {
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                exitCode: error.code || 1,
                executionTime: Date.now() - startTime,
                testsRun: 0,
                testsPassed: 0,
                testsFailed: 0
            };
        }
    }
    async compile(projectRoot) {
        try {
            await execAsync(`cd ${projectRoot} && npm run build`);
            return { success: true, errors: [] };
        }
        catch (error) {
            return { success: false, errors: [error.message] };
        }
    }
}
exports.NpmAdapter = NpmAdapter;
/**
 * Auto-detect and return appropriate build tool adapter
 */
async function detectBuildTool(projectRoot) {
    const adapters = [
        new MavenAdapter(),
        new GradleAdapter(),
        new PytestAdapter(),
        new NpmAdapter()
    ];
    for (const adapter of adapters) {
        if (await adapter.canHandle(projectRoot)) {
            return adapter;
        }
    }
    return null;
}
//# sourceMappingURL=build-tool-adapter.js.map