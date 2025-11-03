/**
 * =============================================================
 * BUILD TOOL ADAPTER
 * =============================================================
 * Agnostic interface for different build tools
 * Auto-detects project type and uses appropriate build command
 * =============================================================
 */

import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface TestExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
}

export interface BuildToolAdapter {
  canHandle(projectRoot: string): Promise<boolean>;
  runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult>;
  compile(projectRoot: string): Promise<{ success: boolean; errors: string[] }>;
}

/**
 * Maven adapter for Java projects
 */
export class MavenAdapter implements BuildToolAdapter {
  async canHandle(projectRoot: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectRoot, 'pom.xml'));
      return true;
    } catch {
      return false;
    }
  }

  async runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult> {
    const testArg = testClass ? `-Dtest=${testClass}` : '';
    
    // Find Maven wrapper or use system mvn
    let mvnCommand = 'mvn';
    
    // Check for mvnw in parent directories
    let currentDir = projectRoot;
    for (let i = 0; i < 5; i++) {
      const mvnwPath = path.join(currentDir, 'mvnw');
      if (existsSync(mvnwPath)) {
        mvnCommand = mvnwPath;
        break;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
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
    } catch (error: any) {
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

  async compile(projectRoot: string): Promise<{ success: boolean; errors: string[] }> {
    // Find Maven wrapper or use system mvn
    let mvnCommand = 'mvn';
    let currentDir = projectRoot;
    for (let i = 0; i < 5; i++) {
      const mvnwPath = path.join(currentDir, 'mvnw');
      if (existsSync(mvnwPath)) {
        mvnCommand = mvnwPath;
        break;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
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
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || '');
      const errors = this.extractCompilationErrors(output);
      return { success: false, errors };
    }
  }

  private parseMavenOutput(output: string): { testsRun: number; testsPassed: number; testsFailed: number } {
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

  private extractCompilationErrors(output: string): string[] {
    const errors: string[] = [];
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

/**
 * Gradle adapter for Java/Kotlin projects
 */
export class GradleAdapter implements BuildToolAdapter {
  async canHandle(projectRoot: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectRoot, 'build.gradle'));
      return true;
    } catch {
      return false;
    }
  }

  async runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult> {
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
    } catch (error: any) {
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

  async compile(projectRoot: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      await execAsync(`cd ${projectRoot} && ./gradlew compileTestJava`);
      return { success: true, errors: [] };
    } catch (error: any) {
      return { success: false, errors: [error.message] };
    }
  }
}

/**
 * pytest adapter for Python projects
 */
export class PytestAdapter implements BuildToolAdapter {
  async canHandle(projectRoot: string): Promise<boolean> {
    // Check for pytest.ini, setup.py, or pyproject.toml
    try {
      await fs.access(path.join(projectRoot, 'pytest.ini'));
      return true;
    } catch {
      try {
        await fs.access(path.join(projectRoot, 'setup.py'));
        return true;
      } catch {
        return false;
      }
    }
  }

  async runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult> {
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
    } catch (error: any) {
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

  async compile(_projectRoot: string): Promise<{ success: boolean; errors: string[] }> {
    // Python doesn't need compilation
    return { success: true, errors: [] };
  }
}

/**
 * npm/jest adapter for TypeScript/JavaScript projects
 */
export class NpmAdapter implements BuildToolAdapter {
  async canHandle(projectRoot: string): Promise<boolean> {
    try {
      await fs.access(path.join(projectRoot, 'package.json'));
      return true;
    } catch {
      return false;
    }
  }

  async runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult> {
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
    } catch (error: any) {
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

  async compile(projectRoot: string): Promise<{ success: boolean; errors: string[] }> {
    try {
      await execAsync(`cd ${projectRoot} && npm run build`);
      return { success: true, errors: [] };
    } catch (error: any) {
      return { success: false, errors: [error.message] };
    }
  }
}

/**
 * Auto-detect and return appropriate build tool adapter
 */
export async function detectBuildTool(projectRoot: string): Promise<BuildToolAdapter | null> {
  const adapters: BuildToolAdapter[] = [
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
