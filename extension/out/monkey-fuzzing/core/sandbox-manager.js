"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SandboxManager = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execAsync = (0, util_1.promisify)(child_process_1.exec);
class SandboxManager {
    constructor(root = '.sandboxes') {
        this.root = root;
    }
    async setup(projectPath, targetFile) {
        console.log(`🔍 Raw projectPath: ${projectPath}`);
        console.log(`🔍 Raw targetFile: ${targetFile}`);
        // DON'T normalize - keep original paths (UNC or Unix)
        // The extension runs in WSL context so paths work as-is
        const timestamp = Date.now().toString(36);
        const base = path_1.default.join(projectPath, this.root, timestamp);
        const testsPath = path_1.default.join(base, 'tests');
        console.log(`🔧 Creating sandbox at: ${base}`);
        await fs_1.promises.mkdir(testsPath, { recursive: true });
        const absSource = path_1.default.isAbsolute(targetFile)
            ? targetFile
            : path_1.default.join(projectPath, targetFile);
        const sourceMirrorPath = path_1.default.join(base, path_1.default.basename(targetFile));
        console.log(`📄 Copying source: ${absSource} -> ${sourceMirrorPath}`);
        await fs_1.promises.copyFile(absSource, sourceMirrorPath);
        return {
            sandboxPath: base,
            testsPath,
            sourceMirrorPath,
            createdAt: new Date().toISOString()
        };
    }
    /**
     * Link generated tests to target project's test directory
     * For Java Maven projects: src/test/java/package/path/
     */
    async linkTestsToProject(sandboxInfo, targetProjectRoot, packagePath) {
        // Detect project type and test directory
        const testDir = await this.detectTestDirectory(targetProjectRoot, packagePath);
        console.log(`🔗 Linking tests to: ${testDir}`);
        await fs_1.promises.mkdir(testDir, { recursive: true });
        // Get all test files from sandbox
        const testFiles = await fs_1.promises.readdir(sandboxInfo.testsPath);
        const javaTests = testFiles.filter(f => f.endsWith('.java') && !f.startsWith('.'));
        const linkedTests = [];
        for (const testFile of javaTests) {
            const sourcePath = path_1.default.join(sandboxInfo.testsPath, testFile);
            const targetPath = path_1.default.join(testDir, testFile);
            try {
                // Remove existing file/symlink if present
                await fs_1.promises.unlink(targetPath).catch(() => { });
                // Create symlink
                await fs_1.promises.symlink(sourcePath, targetPath);
                linkedTests.push(targetPath);
                console.log(`✅ Linked: ${testFile}`);
            }
            catch (error) {
                console.error(`❌ Failed to link ${testFile}:`, error);
            }
        }
        // Save project root metadata for later auto-detection
        const metadataPath = path_1.default.join(sandboxInfo.testsPath, '.metadata', 'project-root.txt');
        await fs_1.promises.mkdir(path_1.default.dirname(metadataPath), { recursive: true });
        await fs_1.promises.writeFile(metadataPath, targetProjectRoot, 'utf-8');
        console.log(`📝 Saved project root metadata: ${targetProjectRoot}`);
        return { linkedTests, targetTestDir: testDir };
    }
    /**
     * Detect test directory based on project type
     */
    async detectTestDirectory(projectRoot, packagePath) {
        // Check for Maven project
        const pomPath = path_1.default.join(projectRoot, 'pom.xml');
        try {
            await fs_1.promises.access(pomPath);
            // Maven: src/test/java/package/path
            return path_1.default.join(projectRoot, 'src', 'test', 'java', ...packagePath.split('.'));
        }
        catch {
            // Not Maven
        }
        // Check for Gradle
        const gradlePath = path_1.default.join(projectRoot, 'build.gradle');
        try {
            await fs_1.promises.access(gradlePath);
            return path_1.default.join(projectRoot, 'src', 'test', 'java', ...packagePath.split('.'));
        }
        catch {
            // Not Gradle
        }
        // Fallback: create tests folder in project root
        return path_1.default.join(projectRoot, 'tests', ...packagePath.split('.'));
    }
    /**
     * Auto-detect project root by reading saved metadata or following symlinks in sandbox
     * Returns the root directory containing pom.xml, build.gradle, or package.json
     */
    async detectProjectRoot(sandboxPath) {
        const testsPath = path_1.default.join(sandboxPath, 'tests');
        // First, try to read saved metadata
        const metadataPath = path_1.default.join(testsPath, '.metadata', 'project-root.txt');
        try {
            const savedRoot = await fs_1.promises.readFile(metadataPath, 'utf-8');
            const trimmedRoot = savedRoot.trim();
            console.log(`📖 Read project root from metadata: ${trimmedRoot}`);
            // Verify it still exists
            try {
                await fs_1.promises.access(trimmedRoot);
                return trimmedRoot;
            }
            catch {
                console.log(`⚠️ Saved project root no longer exists: ${trimmedRoot}`);
            }
        }
        catch {
            // No metadata, continue to symlink detection
            console.log(`📝 No metadata found, trying symlink detection...`);
        }
        try {
            const testFiles = await fs_1.promises.readdir(testsPath);
            // Find first symlinked file
            for (const file of testFiles) {
                const filePath = path_1.default.join(testsPath, file);
                try {
                    const stats = await fs_1.promises.lstat(filePath);
                    if (stats.isSymbolicLink()) {
                        // Read the symlink target
                        const targetPath = await fs_1.promises.readlink(filePath);
                        const absoluteTarget = path_1.default.isAbsolute(targetPath)
                            ? targetPath
                            : path_1.default.resolve(path_1.default.dirname(filePath), targetPath);
                        console.log(`🔍 Following symlink: ${file} -> ${absoluteTarget}`);
                        // Walk up the directory tree to find build file
                        let currentDir = path_1.default.dirname(absoluteTarget);
                        let depth = 0;
                        while (depth < 10) {
                            // Check for Maven
                            try {
                                await fs_1.promises.access(path_1.default.join(currentDir, 'pom.xml'));
                                console.log(`✅ Found Maven project at: ${currentDir}`);
                                return currentDir;
                            }
                            catch { }
                            // Check for Gradle
                            try {
                                await fs_1.promises.access(path_1.default.join(currentDir, 'build.gradle'));
                                console.log(`✅ Found Gradle project at: ${currentDir}`);
                                return currentDir;
                            }
                            catch { }
                            // Check for npm
                            try {
                                await fs_1.promises.access(path_1.default.join(currentDir, 'package.json'));
                                console.log(`✅ Found npm project at: ${currentDir}`);
                                return currentDir;
                            }
                            catch { }
                            // Check for Cargo (Rust)
                            try {
                                await fs_1.promises.access(path_1.default.join(currentDir, 'Cargo.toml'));
                                console.log(`✅ Found Cargo project at: ${currentDir}`);
                                return currentDir;
                            }
                            catch { }
                            // Go up one directory
                            const parentDir = path_1.default.dirname(currentDir);
                            if (parentDir === currentDir)
                                break; // Reached root
                            currentDir = parentDir;
                            depth++;
                        }
                    }
                }
                catch (err) {
                    // Not a symlink or error reading, skip
                    continue;
                }
            }
        }
        catch (error) {
            console.error(`❌ Error detecting project root:`, error);
        }
        return null;
    }
    /**
     * Execute Maven test command on linked tests
     */
    async runMavenTests(projectRoot, testClassName) {
        const testArg = testClassName ? `-Dtest=${testClassName}` : '';
        const command = `cd ${projectRoot} && mvn test ${testArg}`;
        console.log(`🧪 Running: ${command}`);
        try {
            const { stdout, stderr } = await execAsync(command);
            return { stdout, stderr };
        }
        catch (error) {
            return { stdout: error.stdout || '', stderr: error.stderr || error.message };
        }
    }
}
exports.SandboxManager = SandboxManager;
//# sourceMappingURL=sandbox-manager.js.map