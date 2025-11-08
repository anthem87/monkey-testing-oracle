/**
 * =============================================================
 * BUILD TOOL ADAPTER
 * =============================================================
 * Agnostic interface for different build tools
 * Auto-detects project type and uses appropriate build command
 * =============================================================
 */

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SymbolError {
  file: string;
  line: number;
  column: number;
  errorType: 'package_not_exist' | 'cannot_find_symbol' | 'other';
  symbol?: string;
  location?: string;
  message: string;
}

export interface SymbolFixContext {
  error: SymbolError;
  testFileContent?: string;       // Content del file di test con errore
  pomXml?: string;                // pom.xml del progetto per dependency check
  similarClasses?: string[];      // Classi simili trovate nel progetto
  projectStructure?: string[];    // Lista file nel progetto
}

export interface TestExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  
  // 🆕 Symbol-level metrics parsed from Maven compilation errors
  symbolMetrics?: {
    totalSymbols: number;           // Total symbols referenced in code
    resolvedSymbols: number;        // Symbols successfully compiled
    unresolvedSymbols: SymbolError[]; // Detailed error info with coordinates
    semanticFitness: number;        // resolvedSymbols / totalSymbols
  };
}

export interface BuildToolAdapter {
  canHandle(projectRoot: string): Promise<boolean>;
  runTests(projectRoot: string, testClass?: string): Promise<TestExecutionResult>;
  compile(projectRoot: string): Promise<{ 
    success: boolean; 
    errors: string[];
    rawStdout: string;   // 🆕 Full stdout for advanced parsing
    rawStderr: string;   // 🆕 Full stderr (contains ALL Maven errors)
    durationMs: number;  // 🆕 Compile time for performance tracking
    symbolMetrics?: {
      totalSymbols: number;
      resolvedSymbols: number;
      unresolvedSymbols: SymbolError[];
      semanticFitness: number;
    };
  }>;
  
  // 🆕 Richiedi fix intelligente a Copilot con contesto progetto
  requestSymbolFix?(context: SymbolFixContext): Promise<{
    suggestedFix?: string;           // Codice fixato
    pomChanges?: string;             // Modifiche a pom.xml
    needsDependency?: {
      groupId: string;
      artifactId: string;
      version?: string;
    };
  }>;
  
  // 🆕 Raccogli contesto progetto per fix intelligente
  gatherFixContext?(projectRoot: string, error: SymbolError): Promise<SymbolFixContext>;
}

/**
 * Maven adapter for Java projects
 */
export class MavenAdapter implements BuildToolAdapter {
  private copilotAdapter: any = null;

  setCopilotAdapter(adapter: any): void {
    this.copilotAdapter = adapter;
  }

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
    
    // Convert Windows path to WSL path if needed
    const wslProjectRoot = projectRoot.startsWith('\\\\wsl.localhost') 
      ? projectRoot.replace(/\\/g, '/').replace('//wsl.localhost/Ubuntu', '')
      : projectRoot;
    
    // Always use globally installed mvn
    const mvnCommand = 'mvn';
    
    // Detect if running inside WSL - check multiple indicators
    const isWSL = process.env.WSL_DISTRO_NAME !== undefined || 
                  process.env.WSL_INTEROP !== undefined ||
                  process.platform === 'linux';
    
    console.log(`   [Maven] Environment detection:`);
    console.log(`      WSL_DISTRO_NAME: ${process.env.WSL_DISTRO_NAME || 'undefined'}`);
    console.log(`      WSL_INTEROP: ${process.env.WSL_INTEROP || 'undefined'}`);
    console.log(`      platform: ${process.platform}`);
    console.log(`      Running inside WSL: ${isWSL}`);
    
    // 🎯 TWO-PHASE EXECUTION:
    // Phase 1: test-compile only (check compilation)
    // Phase 2: test (only if Phase 1 succeeds)
    
    console.log(`   [Maven] 🔨 Phase 1: Compiling tests...`);
    
    const compileArgs = ['test-compile'].join(' ');
    const compileCmd = `cd ${wslProjectRoot} && source ~/.sdkman/bin/sdkman-init.sh 2>/dev/null && ${mvnCommand} ${compileArgs}`;
    
    const execCmd = isWSL
      ? `bash --noprofile --norc -c "${compileCmd.replace(/"/g, '\\"')}"`
      : `wsl bash --noprofile --norc -c "${compileCmd}"`;
    
    console.log(`   [Maven] Compile command: ${execCmd}`);
    
    const startTime = Date.now();
    
    try {
      const execOptions: any = { 
        maxBuffer: 1024 * 1024 * 10,
        cwd: isWSL ? wslProjectRoot : undefined,
        env: { 
          ...process.env, 
          ZDOTDIR: '/tmp'
        }
      };
      if (!isWSL) {
        execOptions.shell = 'powershell.exe';
      }
      
      // Execute Phase 1: test-compile
      const { stdout: compileStdout, stderr: compileStderr } = await execAsync(execCmd, execOptions);
      
      console.log(`   [Maven] ✅ Phase 1 SUCCESS - Compilation passed`);
      
      // Parse symbol metrics from compile phase
      const symbolAnalysis = this.parseMavenSymbolErrors(compileStdout.toString() + compileStderr.toString());
      const compileSymbolMetrics = symbolAnalysis.unresolvedCount > 0 ? {
        totalSymbols: symbolAnalysis.totalSymbols,
        resolvedSymbols: symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount,
        unresolvedSymbols: symbolAnalysis.symbolErrors,
        semanticFitness: symbolAnalysis.totalSymbols > 0 
          ? (symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount) / symbolAnalysis.totalSymbols 
          : 1.0
      } : undefined;
      
      if (compileSymbolMetrics) {
        console.log(`   [Maven Symbols] 📊 Compile Fitness: ${(compileSymbolMetrics.semanticFitness * 100).toFixed(1)}%`);
      }
      
      // 🎯 Phase 2: Execute tests (only if compilation succeeded)
      console.log(`   [Maven] 🧪 Phase 2: Running tests...`);
      
      const testArgs = ['-Dsurefire.reportFormat=json', testArg, 'test'].filter(a => a).join(' ');
      const testCmd = `cd ${wslProjectRoot} && source ~/.sdkman/bin/sdkman-init.sh 2>/dev/null && ${mvnCommand} ${testArgs}`;
      
      const testExecCmd = isWSL
        ? `bash --noprofile --norc -c "${testCmd.replace(/"/g, '\\"')}"`
        : `wsl bash --noprofile --norc -c "${testCmd}"`;
      
      const { stdout: testStdout, stderr: testStderr } = await execAsync(testExecCmd, execOptions);
      const executionTime = Date.now() - startTime;
      
      console.log(`   [Maven] ✅ Phase 2 SUCCESS - Tests executed`);
      
      // Parse test results
      const reportsPath = isWSL 
        ? wslProjectRoot
        : (wslProjectRoot.startsWith('/') 
          ? `\\\\wsl.localhost\\Ubuntu${wslProjectRoot}`.replace(/\//g, '\\')
          : projectRoot);
      
      const results = await this.parseSurefireReports(reportsPath, testClass);
      
      return {
        success: results.testsFailed === 0,
        stdout: compileStdout.toString() + '\n' + testStdout.toString(),
        stderr: compileStderr.toString() + '\n' + testStderr.toString(),
        exitCode: 0,
        executionTime,
        ...results,
        symbolMetrics: compileSymbolMetrics
      };
      
    } catch (error: any) {
      const executionTime = Date.now() - startTime;
      
      const stdoutStr = error.stdout ? error.stdout.toString() : '';
      const stderrStr = error.stderr ? error.stderr.toString() : '';
      
      console.log(`   [Maven] ❌ Execution failed: ${error.message}`);
      console.log(`   [Maven] Exit code: ${error.code}`);
      
      // 🔍 DEBUG: Log output lengths
      console.log(`   [Maven] stdout length: ${stdoutStr.length} chars`);
      console.log(`   [Maven] stderr length: ${stderrStr.length} chars`);
      
      if (stdoutStr.length > 0) {
        console.log(`   [Maven] stdout preview:\n${stdoutStr.substring(0, 500)}`);
      }
      
      // Parse symbol-level metrics from Maven output
      const symbolAnalysis = this.parseMavenSymbolErrors(stdoutStr + stderrStr);
      
      console.log(`   [Maven] Symbol analysis: ${symbolAnalysis.unresolvedCount} unresolved, ${symbolAnalysis.totalSymbols} total`);
      
      const symbolMetrics = symbolAnalysis.unresolvedCount > 0 ? {
        totalSymbols: symbolAnalysis.totalSymbols,
        resolvedSymbols: symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount,
        unresolvedSymbols: symbolAnalysis.symbolErrors,
        semanticFitness: symbolAnalysis.totalSymbols > 0 
          ? (symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount) / symbolAnalysis.totalSymbols 
          : 0.0
      } : undefined;
      
      if (symbolMetrics) {
        console.log(`   [Maven Symbols] 📊 Total: ${symbolMetrics.totalSymbols} | Resolved: ${symbolMetrics.resolvedSymbols} | Fitness: ${(symbolMetrics.semanticFitness * 100).toFixed(1)}%`);
        console.log(`   [Maven Symbols] ⚠️  Unresolved: ${symbolMetrics.unresolvedSymbols.length} symbols`);
      }
      
      return {
        success: false,
        stdout: stdoutStr,
        stderr: stderrStr || error.message,
        exitCode: error.code || 1,
        executionTime,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        symbolMetrics
      };
    }
  }

  /**
   * Compile with SymbolCounterPlugin for granular semantic fitness
   */
  async compile(projectRoot: string) {
    const startTime = Date.now(); // ⏱️ Track duration
    
    // Convert Windows path to WSL path if needed
    const wslProjectRoot = projectRoot.startsWith('\\\\wsl.localhost') 
      ? projectRoot.replace(/\\/g, '/').replace('//wsl.localhost/Ubuntu', '')
      : projectRoot;
    
    // Always use globally installed mvn
    const mvnCommand = 'mvn';
    
    // Detect if running inside WSL - check multiple indicators
    const isWSL = process.env.WSL_DISTRO_NAME !== undefined || 
                  process.env.WSL_INTEROP !== undefined ||
                  process.platform === 'linux';
    
    console.log(`   [Maven Compile] Environment detection:`);
    console.log(`      WSL_DISTRO_NAME: ${process.env.WSL_DISTRO_NAME || 'undefined'}`);
    console.log(`      WSL_INTEROP: ${process.env.WSL_INTEROP || 'undefined'}`);
    console.log(`      platform: ${process.platform}`);
    console.log(`      Running inside WSL: ${isWSL}`);
    
    // Build command with explicit sdkman initialization
    // Parse symbol errors from Maven output for granular compilation fitness
    const mvnArgs = [
      'test-compile'
    ].join(' ');
    
    const cdAndRun = `cd ${wslProjectRoot} && source ~/.sdkman/bin/sdkman-init.sh 2>/dev/null && ${mvnCommand} ${mvnArgs}`;
    
    // Always use bash with --noprofile --norc to avoid .zshenv/.bashrc issues
    const execCmd = isWSL
      ? `bash --noprofile --norc -c "${cdAndRun.replace(/"/g, '\\"')}"`
      : `wsl bash --noprofile --norc -c "${cdAndRun}"`;
    
    console.log(`   [Maven Compile] Command: ${execCmd}`);
    console.log(`   [Maven Compile] Working directory: ${wslProjectRoot}`);
    
    try {
      const execOptions: any = { 
        maxBuffer: 1024 * 1024 * 10,
        cwd: isWSL ? wslProjectRoot : undefined,
        env: { 
          ...process.env, 
          ZDOTDIR: '/tmp' // Prevent zsh from loading ~/.zshenv
        }
      };
      if (!isWSL) {
        execOptions.shell = 'powershell.exe';
      }
      
      console.log(`   [Maven Compile] 🚀 Executing command...`);
      const { stdout, stderr } = await execAsync(execCmd, execOptions);
      const durationMs = Date.now() - startTime;
      
      console.log(`   [Maven Compile] ✅ Command completed in ${durationMs}ms`);
      
      const rawStdout = stdout.toString();
      const rawStderr = stderr.toString();
      
      // 🔍 LOG OUTPUT
      console.log(`   [Maven Compile] stdout length: ${rawStdout.length} chars`);
      console.log(`   [Maven Compile] stderr length: ${rawStderr.length} chars`);
      
      if (rawStdout.length > 0) {
        console.log(`   [Maven Compile] stdout preview:\n${rawStdout.substring(0, 800)}`);
      }
      if (rawStderr.length > 0) {
        console.log(`   [Maven Compile] stderr preview:\n${rawStderr.substring(0, 500)}`);
      }
      
      const errors = await this.extractCompilationErrors(rawStdout + rawStderr);
      
      console.log(`   [Maven Compile] Errors extracted: ${errors.length}`);
      
      // 🆕 Parse symbol-level metrics from Maven errors
      const symbolAnalysis = this.parseMavenSymbolErrors(rawStdout + rawStderr);
      
      console.log(`   [Maven Compile] Symbol analysis: ${symbolAnalysis.unresolvedCount} unresolved, ${symbolAnalysis.totalSymbols} total`);
      
      const symbolMetrics = symbolAnalysis.unresolvedCount > 0 ? {
        totalSymbols: symbolAnalysis.totalSymbols,
        resolvedSymbols: symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount,
        unresolvedSymbols: symbolAnalysis.symbolErrors,
        semanticFitness: symbolAnalysis.totalSymbols > 0 
          ? (symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount) / symbolAnalysis.totalSymbols 
          : 1.0
      } : undefined;
      
      if (symbolMetrics) {
        console.log(`   [Maven Symbols] 📊 Total: ${symbolMetrics.totalSymbols} | Resolved: ${symbolMetrics.resolvedSymbols} | Fitness: ${(symbolMetrics.semanticFitness * 100).toFixed(1)}%`);
        console.log(`   [Maven Symbols] ⚠️  Unresolved: ${symbolMetrics.unresolvedSymbols.length} symbols`);
      }
      
      return { 
        success: errors.length === 0, 
        errors, 
        rawStdout,
        rawStderr,
        durationMs,
        symbolMetrics 
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      const stdoutStr = error.stdout ? error.stdout.toString() : '';
      const stderrStr = error.stderr ? error.stderr.toString() : '';
      const output = stdoutStr + stderrStr;
      
      // 🔍 LOG ERROR
      console.log(`   [Maven Compile] ❌ Command failed in ${durationMs}ms`);
      console.log(`   [Maven Compile] Exit code: ${error.code || 'N/A'}`);
      console.log(`   [Maven Compile] Error message: ${error.message}`);
      console.log(`   [Maven Compile] stdout length: ${stdoutStr.length} chars`);
      console.log(`   [Maven Compile] stderr length: ${stderrStr.length} chars`);
      
      if (stdoutStr.length > 0) {
        console.log(`   [Maven Compile] stdout preview:\n${stdoutStr.substring(0, 800)}`);
      }
      if (stderrStr.length > 0) {
        console.log(`   [Maven Compile] stderr preview:\n${stderrStr.substring(0, 500)}`);
      }
      
      const errors = await this.extractCompilationErrors(output);
      
      console.log(`   [Maven Compile] Errors extracted: ${errors.length}`);
      
      // 🆕 Parse symbol-level metrics from Maven errors
      const symbolAnalysis = this.parseMavenSymbolErrors(output);
      
      console.log(`   [Maven Compile] Symbol analysis: ${symbolAnalysis.unresolvedCount} unresolved, ${symbolAnalysis.totalSymbols} total`);
      
      const symbolMetrics = symbolAnalysis.unresolvedCount > 0 ? {
        totalSymbols: symbolAnalysis.totalSymbols,
        resolvedSymbols: symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount,
        unresolvedSymbols: symbolAnalysis.symbolErrors,
        semanticFitness: symbolAnalysis.totalSymbols > 0 
          ? (symbolAnalysis.totalSymbols - symbolAnalysis.unresolvedCount) / symbolAnalysis.totalSymbols 
          : 0.0
      } : undefined;
      
      if (symbolMetrics) {
        console.log(`   [Maven Symbols] 📊 Total: ${symbolMetrics.totalSymbols} | Resolved: ${symbolMetrics.resolvedSymbols} | Fitness: ${(symbolMetrics.semanticFitness * 100).toFixed(1)}%`);
        console.log(`   [Maven Symbols] ⚠️  Unresolved: ${symbolMetrics.unresolvedSymbols.length} symbols`);
      }
      
      return { 
        success: false, 
        errors, 
        rawStdout: stdoutStr,
        rawStderr: stderrStr,
        durationMs,
        symbolMetrics 
      };
    }
  }

  /**
   * 🎯 Parse Surefire JSON reports from target/surefire-reports/
   */
  private async parseSurefireReports(projectRoot: string, testClass?: string): Promise<{ testsRun: number; testsPassed: number; testsFailed: number }> {
    const reportsDir = path.join(projectRoot, 'target', 'surefire-reports');
    
    try {
      const files = await fs.readdir(reportsDir);
      
      // Try JSON files first (with -Dsurefire.reportFormat=json)
      const jsonFiles = files.filter(f => f.endsWith('.json') && f.startsWith('TEST-') && (!testClass || f.includes(testClass)));
      if (jsonFiles.length > 0) {
        console.log(`   [Parse] Found ${jsonFiles.length} JSON report(s)`);
        return await this.parseJsonReports(reportsDir, jsonFiles);
      }
      
      // Try XML files (more structured)
      const xmlFiles = files.filter(f => f.endsWith('.xml') && f.startsWith('TEST-') && (!testClass || f.includes(testClass)));
      if (xmlFiles.length > 0) {
        console.log(`   [Parse] Found ${xmlFiles.length} XML report(s)`);
        return await this.parseXmlReports(reportsDir, xmlFiles);
      }
      
      // Fallback to TXT files
      const txtFiles = files.filter(f => f.endsWith('.txt') && (!testClass || f.includes(testClass)));
      
      console.log(`   [Parse] Found ${txtFiles.length} TXT report(s)`);
      
      let totalRun = 0, totalPassed = 0, totalFailed = 0;
      
      for (const file of txtFiles) {
        const content = await fs.readFile(path.join(reportsDir, file), 'utf8');
        // Parse: "Tests run: 5, Failures: 1, Errors: 0, Skipped: 0"
        const match = content.match(/Tests run: (\d+), Failures: (\d+), Errors: (\d+)/);
        if (match) {
          const run = parseInt(match[1]);
          const failures = parseInt(match[2]);
          const errors = parseInt(match[3]);
          totalRun += run;
          totalFailed += failures + errors;
        }
      }
      
      totalPassed = totalRun - totalFailed;
      return { testsRun: totalRun, testsPassed: totalPassed, testsFailed: totalFailed };
    } catch (err) {
      // Silent fallback - non critico se non ci sono surefire reports
      return { testsRun: 0, testsPassed: 0, testsFailed: 0 };
    }
  }

  /**
   * 🆕 Parse JSON reports (Maven Surefire with -Dsurefire.reportFormat=json)
   */
  private async parseJsonReports(reportsDir: string, jsonFiles: string[]): Promise<{ testsRun: number; testsPassed: number; testsFailed: number }> {
    let totalRun = 0, totalPassed = 0, totalFailed = 0;
    
    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(reportsDir, file), 'utf8');
        const report = JSON.parse(content);
        
        // JSON structure varies, try common formats
        const run = report.tests || report.testsRun || report.total || 0;
        const failures = report.failures || report.failed || 0;
        const errors = report.errors || 0;
        
        totalRun += run;
        totalFailed += failures + errors;
        
        console.log(`   [Parse JSON] ${file}: ${run} tests, ${failures} failures, ${errors} errors`);
      } catch (parseErr) {
        console.warn(`   [Parse JSON] Failed to parse ${file}: ${(parseErr as Error).message}`);
      }
    }
    
    totalPassed = totalRun - totalFailed;
    return { testsRun: totalRun, testsPassed: totalPassed, testsFailed: totalFailed };
  }

  /**
   * 🆕 Parse XML reports with detailed failure information
   */
  private async parseXmlReports(reportsDir: string, xmlFiles: string[]): Promise<{ testsRun: number; testsPassed: number; testsFailed: number }> {
    let totalRun = 0, totalPassed = 0, totalFailed = 0;
    
    for (const file of xmlFiles) {
      const content = await fs.readFile(path.join(reportsDir, file), 'utf8');
      
      // Extract test suite attributes: <testsuite tests="10" failures="2" errors="1" ...>
      const suiteMatch = content.match(/<testsuite[^>]+tests="(\d+)"[^>]+failures="(\d+)"[^>]+errors="(\d+)"/);
      if (suiteMatch) {
        const run = parseInt(suiteMatch[1]);
        const failures = parseInt(suiteMatch[2]);
        const errors = parseInt(suiteMatch[3]);
        totalRun += run;
        totalFailed += failures + errors;
        
        console.log(`   [Parse XML] ${file}: ${run} tests, ${failures} failures, ${errors} errors`);
      }
    }
    
    totalPassed = totalRun - totalFailed;
    return { testsRun: totalRun, testsPassed: totalPassed, testsFailed: totalFailed };
  }

  /**
   *  Parse Maven compilation errors and extract symbol-level metrics
   * 
   * Maven error format:
   * [ERROR] /path/to/File.java:[line,column] error: cannot find symbol
   *   symbol:   class ClassName
   *   location: class LocationClass
   * 
   * This gives us:
   * - File path with line:column coordinates
   * - Symbol name (class, method, package)
   * - Error type (package not exist, cannot find symbol)
   * - Location context
   * 
   * We use this to calculate semantic fitness without external plugin!
   */
  private parseMavenSymbolErrors(output: string): {
    symbolErrors: SymbolError[];
    totalSymbols: number;
    unresolvedCount: number;
  } {
    const symbolErrors: SymbolError[] = [];
    const lines = output.split('\n');
    
    console.log(`   [Symbol Parser] Processing ${lines.length} lines`);
    
    // First, count how many [ERROR] lines with coordinates we have
    const errorLines = lines.filter((l: string) => l.includes('[ERROR]') && l.match(/:\[\d+,\d+\]/));
    console.log(`   [Symbol Parser] Found ${errorLines.length} error lines with coordinates`);
    
    // 🔍 DEBUG: Print first 5 error lines to see format
    if (errorLines.length > 0) {
      console.log(`   [Symbol Parser] First 5 error lines:`);
      errorLines.slice(0, 5).forEach((line: string, idx: number) => {
        console.log(`      ${idx + 1}. ${line}`);
      });
    }
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      // Match: [ERROR] /path/to/File.java:[10,20] error: cannot find symbol
      // OR: [ERROR] /path/to/File.java:[10,20] illegal character: '`'
      const errorMatch = line.match(/\[ERROR\]\s+([^:]+):(\[(\d+),(\d+)\])\s+(.+)/);
      
      if (errorMatch) {
        console.log(`   [Symbol Parser] ✅ Matched: ${errorMatch[5]}`);
        
        const file = errorMatch[1].trim();
        const lineNum = parseInt(errorMatch[3]);
        const column = parseInt(errorMatch[4]);
        const errorMsg = errorMatch[5].trim();
        
        // Determine error type
        let errorType: 'package_not_exist' | 'cannot_find_symbol' | 'other' = 'other';
        if (errorMsg.includes('package') && errorMsg.includes('does not exist')) {
          errorType = 'package_not_exist';
        } else if (errorMsg.includes('cannot find symbol')) {
          errorType = 'cannot_find_symbol';
        }
        
        // Look ahead for symbol and location info
        let symbol: string | undefined;
        let location: string | undefined;
        
        // Next lines might contain:
        // [ERROR]   symbol:   class ServletException
        // [ERROR]   location: class DeskJwtValidationFilterTest
        if (i + 1 < lines.length) {
          const symbolLine = lines[i + 1];
          const symbolMatch = symbolLine.match(/\[ERROR\]\s+symbol:\s+(.+)/);
          if (symbolMatch) {
            symbol = symbolMatch[1].trim();
          }
        }
        
        if (i + 2 < lines.length) {
          const locationLine = lines[i + 2];
          const locationMatch = locationLine.match(/\[ERROR\]\s+location:\s+(.+)/);
          if (locationMatch) {
            location = locationMatch[1].trim();
          }
        }
        
        symbolErrors.push({
          file,
          line: lineNum,
          column,
          errorType,
          symbol,
          location,
          message: errorMsg
        });
      }
      
      i++;
    }
    
    // Estimate total symbols: assume average Java file has ~50 symbols
    // We can refine this by counting imports + class references in successful files
    const unresolvedCount = symbolErrors.length;
    
    // TODO: Conta simboli risolti analizzando file sorgente
    // Per ora usiamo euristica: assume 50 simboli per file, sottrai errori
    const filesWithErrors = new Set(symbolErrors.map(e => e.file)).size;
    const estimatedTotalSymbols = filesWithErrors * 50; // Euristica
    
    return {
      symbolErrors,
      totalSymbols: estimatedTotalSymbols,
      unresolvedCount
    };
  }

  /**
   * 🤖 Extract compilation errors via Copilot
   */
  private async extractCompilationErrors(output: string): Promise<string[]> {
    if (!this.copilotAdapter) {
      // Fallback: regex
      const errors: string[] = [];
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('[ERROR]') && !line.includes('BUILD FAILURE')) {
          errors.push(line.trim());
        }
      }
      return errors;
    }

    try {
      const prompt = `Extract all compilation errors from this Maven output. Return ONLY a JSON array of error messages.

Maven output:
\`\`\`
${output.substring(0, 2000)}
\`\`\`

Return format: ["error1", "error2", ...]`;
      
      const response = await this.copilotAdapter.generate(prompt);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          console.log(`✅ Copilot extracted ${parsed.length} errors`);
          return parsed;
        }
      }
    } catch (err) {
      const errorMsg = (err as Error).message;
      if (errorMsg.includes('Response got filtered')) {
        console.warn('⚠️ Copilot response filtered (content safety) - using regex fallback');
      } else {
        console.warn(`⚠️ Copilot error extraction failed: ${errorMsg}`);
      }
    }
    
    // Fallback
    const errors: string[] = [];
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('[ERROR]')) errors.push(line.trim());
    }
    return errors;
  }
  
  /**
   * 🤖 Request intelligent fix from Copilot with project context
   * 
   * Analyzes symbol errors and provides:
   * - Suggested code fix with proper imports
   * - pom.xml dependency additions if needed
   * - Alternative class suggestions from project
   */
  async requestSymbolFix(context: SymbolFixContext): Promise<{
    suggestedFix?: string;
    pomChanges?: string;
    needsDependency?: {
      groupId: string;
      artifactId: string;
      version?: string;
    };
  }> {
    if (!this.copilotAdapter) {
      console.warn('⚠️ Copilot adapter not available for symbol fix');
      return {};
    }

    const { error, testFileContent, pomXml, similarClasses, projectStructure } = context;
    
    // Build rich context for Copilot
    const prompt = `You are fixing a Java compilation error. Analyze the error and provide a fix.

**Error Details:**
- File: ${error.file}
- Line: ${error.line}, Column: ${error.column}
- Error Type: ${error.errorType}
- Symbol: ${error.symbol || 'N/A'}
- Location: ${error.location || 'N/A'}
- Message: ${error.message}

${testFileContent ? `**Test File Content (around error):**
\`\`\`java
${testFileContent}
\`\`\`` : ''}

${pomXml ? `**Project pom.xml:**
\`\`\`xml
${pomXml.substring(0, 2000)}
\`\`\`` : ''}

${similarClasses && similarClasses.length > 0 ? `**Similar Classes in Project:**
${similarClasses.slice(0, 10).join('\n')}` : ''}

${projectStructure && projectStructure.length > 0 ? `**Project Structure:**
${projectStructure.slice(0, 20).join('\n')}` : ''}

**Task:**
1. If the error is a missing import, provide the correct import statement
2. If it's a missing dependency, suggest the Maven dependency to add to pom.xml
3. If it's using wrong package (e.g., javax.servlet vs jakarta.servlet), suggest the fix
4. If a similar class exists in the project, suggest using that instead

**Response Format (JSON):**
\`\`\`json
{
  "suggestedFix": "// Fixed code or import statement",
  "pomChanges": "<!-- Maven dependency to add -->",
  "needsDependency": {
    "groupId": "...",
    "artifactId": "...",
    "version": "..."
  },
  "explanation": "Why this fix works"
}
\`\`\`

Provide ONLY the JSON response.`;

    try {
      const response = await this.copilotAdapter.generate(prompt);
      
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`✅ Copilot fix suggestion: ${parsed.explanation || 'No explanation'}`);
        
        return {
          suggestedFix: parsed.suggestedFix,
          pomChanges: parsed.pomChanges,
          needsDependency: parsed.needsDependency
        };
      }
    } catch (err) {
      console.warn(`⚠️ Copilot symbol fix failed: ${(err as Error).message}`);
    }
    
    return {};
  }
  
  /**
   * 🔍 Gather project context for intelligent symbol fixing
   * 
   * Collects:
   * - pom.xml content
   * - Test file content around error line
   * - Similar classes in project (based on symbol name)
   * - Project structure overview
   */
  async gatherFixContext(projectRoot: string, error: SymbolError): Promise<SymbolFixContext> {
    const context: SymbolFixContext = { error };
    
    // Convert to proper file path
    const wslProjectRoot = projectRoot.startsWith('\\\\wsl.localhost') 
      ? projectRoot.replace(/\\/g, '/').replace('//wsl.localhost/Ubuntu', '')
      : projectRoot;
    
    try {
      // 1. Read pom.xml
      const pomPath = path.join(wslProjectRoot, 'pom.xml');
      try {
        context.pomXml = await fs.readFile(pomPath, 'utf8');
        console.log(`   [Context] ✅ Read pom.xml (${context.pomXml.length} chars)`);
      } catch {
        console.log(`   [Context] ⚠️  pom.xml not found`);
      }
      
      // 2. Read test file content around error
      try {
        // Convert Windows path to WSL if needed
        let testFilePath = error.file;
        if (testFilePath.startsWith('C:\\')) {
          // Convert C:\home\... to /home/...
          testFilePath = testFilePath.replace(/\\/g, '/').replace('C:', '');
        }
        
        const testFileContent = await fs.readFile(testFilePath, 'utf8');
        const lines = testFileContent.split('\n');
        
        // Extract ±10 lines around error
        const startLine = Math.max(0, error.line - 10);
        const endLine = Math.min(lines.length, error.line + 10);
        context.testFileContent = lines.slice(startLine, endLine).join('\n');
        
        console.log(`   [Context] ✅ Read test file around line ${error.line}`);
      } catch (err) {
        console.log(`   [Context] ⚠️  Could not read test file: ${(err as Error).message}`);
      }
      
      // 3. Find similar classes in project (if symbol is a class name)
      if (error.symbol && error.errorType === 'cannot_find_symbol') {
        try {
          const symbolName = error.symbol.replace('class ', '').replace('variable ', '').trim();
          
          // Search for .java files containing similar names
          const findCmd = `find ${wslProjectRoot}/src -name "*.java" -type f 2>/dev/null | head -20`;
          const { stdout } = await execAsync(findCmd);
          
          context.projectStructure = stdout.trim().split('\n').filter((f: string) => f.length > 0);
          context.similarClasses = (context.projectStructure || []).filter((f: string) => 
            f.toLowerCase().includes(symbolName.toLowerCase())
          );
          
          console.log(`   [Context] 🔍 Found ${context.similarClasses.length} similar classes`);
        } catch (err) {
          console.log(`   [Context] ⚠️  Could not search project: ${(err as Error).message}`);
        }
      }
      
    } catch (err) {
      console.warn(`   [Context] Error gathering context: ${(err as Error).message}`);
    }
    
    return context;
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

  async compile(projectRoot: string) {
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(`cd ${projectRoot} && ./gradlew compileTestJava`);
      const durationMs = Date.now() - startTime;
      return { 
        success: true, 
        errors: [], 
        rawStdout: stdout.toString(),
        rawStderr: stderr.toString(),
        durationMs,
        symbolMetrics: undefined 
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      return { 
        success: false, 
        errors: [error.message], 
        rawStdout: error.stdout?.toString() || '',
        rawStderr: error.stderr?.toString() || '',
        durationMs,
        symbolMetrics: undefined 
      };
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

  async compile(_projectRoot: string) {
    // Python doesn't need compilation
    return { 
      success: true, 
      errors: [],
      rawStdout: '',
      rawStderr: '',
      durationMs: 0,
      symbolMetrics: undefined
    };
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

  async compile(projectRoot: string) {
    const startTime = Date.now();
    try {
      const { stdout, stderr } = await execAsync(`cd ${projectRoot} && npm run build`);
      const durationMs = Date.now() - startTime;
      return { 
        success: true, 
        errors: [], 
        rawStdout: stdout.toString(),
        rawStderr: stderr.toString(),
        durationMs,
        symbolMetrics: undefined 
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      return { 
        success: false, 
        errors: [error.message], 
        rawStdout: error.stdout?.toString() || '',
        rawStderr: error.stderr?.toString() || '',
        durationMs,
        symbolMetrics: undefined 
      };
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
