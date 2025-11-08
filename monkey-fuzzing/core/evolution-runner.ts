/**
 * =============================================================
 * EVOLUTION-RUNNER.TS
 * =============================================================
 * Main entry point per evolutionary loop
 * 
 * Workflow:
 * 1. Analizza classe Java (Copilot)
 * 2. Genera test iniziale (Copilot)
 * 3. Scrivi test in workspace locale
 * 4. Copia test in projectRoot/src/test/java/
 * 5. Esegui mvn test → leggi surefire reports
 * 6. Se errori → fix via Copilot
 * 7. Aggiorna fitness (compilationRate come loss)
 * 8. Loop per N generazioni
 * =============================================================
 */

import { promises as fs } from 'fs';
import path from 'path';

/**
 * 🧹 CRITICAL PREPROCESSING - Cleans AI-generated code before compilation
 * Removes markdown artifacts, backticks, and ensures valid Java structure
 * This is MANDATORY to enable Pareto optimization - without it, all individuals
 * fail with "illegal character" errors and collapse to single Pareto front.
 */
function preprocessGeneratedCode(code: string): string {
  let cleaned = code;
  
  // 1. Remove markdown code blocks
  cleaned = cleaned.replace(/```java\s*/g, '');
  cleaned = cleaned.replace(/```\s*/g, '');
  
  // 2. Remove all backticks (illegal character in Java)
  cleaned = cleaned.replace(/`/g, '');
  
  // 3. Remove leading/trailing whitespace
  cleaned = cleaned.trim();
  
  // 4. Ensure code starts with package or import (skip preamble text)
  if (!cleaned.startsWith('package') && !cleaned.startsWith('import')) {
    const javaStartMatch = cleaned.match(/(package|import)\s+/);
    if (javaStartMatch && javaStartMatch.index !== undefined) {
      cleaned = cleaned.substring(javaStartMatch.index);
    }
  }
  
  // 5. Remove common AI commentary patterns
  cleaned = cleaned.replace(/^\/\/\s*(Here's|Here is|This is).*$/gm, '');
  cleaned = cleaned.replace(/^\/\/\s*Note:.*$/gm, '');
  
  // 6. Normalize line endings
  cleaned = cleaned.replace(/\r\n/g, '\n');
  
  return cleaned;
}
import { CopilotAnalyzer } from './copilot-analyzer.js';
import { CopilotFixEngine } from './copilot-fix.js';
import { MavenAdapter } from './build-tool-adapter.js';
import { VSCodeCopilotAdapter } from './vscode-copilot-adapter.js';
import { ProjectExplorer } from './project-explorer.js';
import { TestEvolver } from './test-evolver.js';
import { EvolutionController, MetricsSnapshot, shouldHarden } from './evolution-controller.js';
import { CheckpointManager } from './checkpoint-manager.js';
import { Objectives, RankedIndividual } from './multi-objective.js';
import { CompilationGate } from './compilation-gate.js';
import { AIRepairOracle } from './ai-repair-oracle.js';
import { FixCache } from './fix-cache.js';
import { 
  EvolutionEngine, 
  EvolutionConfig as EvolutionEngineConfig,
  GeneratedTestSuite as EvolutionTestSuite,
  TestExecutionResult
} from './evolution.js';
import { StateTracker, OperatorDescriptor } from './state.js';
import { 
  emergenceThreshold, 
  shannonEntropyNormalized,
  systemMaturity,
  listVariance
} from '../metrics/metrics.js';

interface EvolutionConfig {
  targetClassPath: string;  // Path assoluto alla classe Java
  generations: number;
  workspaceRoot: string;    // Dove scrivere test localmente
}

interface GenerationMetrics {
  generation: number;
  testName: string;
  compilationSuccess: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  fitness: number;
  timestamp: string;
  mavenOutput?: any; // JSON from surefire reports
  
  // Multi-objective data
  objectives?: Objectives;
  paretoRank?: number;
  crowdingDistance?: number;
}

interface Individual {
  id: string;
  fitness: number;
  age: number;
  testCount: number;
  tests: Array<{
    name: string;
    code: string;
    input: string;
    expected: string;
    confidence: number;
    language: string;
    metadata: {
      targetFile: string;
      language: string;
      origin: string;
      generation: number;
    };
  }>;
  
  // Multi-objective data
  objectives?: Objectives;
  paretoRank?: number;
  crowdingDistance?: number;
}

interface PopulationCheckpoint {
  generation: number;
  timestamp: string;
  population: Individual[];
  metrics: {
    avgFitness: number;
    bestFitness: number;
    diversity: number;
    entropy: number;
    emergenceDetected: boolean;
    
    // Multi-objective aggregates
    avgLoss?: number;
    avgDiversity?: number;
    avgNovelty?: number;
    avgCoverage?: number;
    paretoFrontSizes?: number[];
  };
}

export class EvolutionRunner {
  private copilotAPI: VSCodeCopilotAdapter;
  private analyzer: CopilotAnalyzer;
  private fixEngine: CopilotFixEngine;
  private maven = new MavenAdapter();
  private explorer: ProjectExplorer;
  private evolver: TestEvolver;
  private controller: EvolutionController;
  private checkpointManager: CheckpointManager;
  private evolutionEngine?: EvolutionEngine;
  private stateTracker?: StateTracker;
  
  // 🆕 Hardening system
  private compilationGate?: CompilationGate;
  private aiRepairOracle?: AIRepairOracle;
  private fixCache: FixCache;
  
  constructor(vscodeContext?: any) {
    // If vscodeContext provided (running in extension), use real Copilot
    if (vscodeContext) {
      this.copilotAPI = new VSCodeCopilotAdapter(vscodeContext);
    } else {
      throw new Error('❌ EvolutionRunner requires VS Code Extension context. Use command: "Monkey-Fuzzing: Evolution Runner"');
    }
    this.analyzer = new CopilotAnalyzer(this.copilotAPI);
    this.fixEngine = new CopilotFixEngine(this.copilotAPI);
    this.explorer = new ProjectExplorer(this.copilotAPI);
    this.evolver = new TestEvolver(this.copilotAPI);
    this.controller = new EvolutionController();
    this.checkpointManager = new CheckpointManager(''); // Will be set in run()
    this.maven.setCopilotAdapter(this.copilotAPI);
    
    // 🆕 Initialize hardening system
    this.fixCache = new FixCache();
    this.aiRepairOracle = new AIRepairOracle(this.copilotAPI);
  }

  async run(config: EvolutionConfig): Promise<void> {
    console.log(`\n🚀 Starting Evolutionary Testing\n`);
    console.log(`📂 Target class: ${config.targetClassPath}`);
    console.log(`🔄 Generations: ${config.generations}`);
    console.log(`📁 Workspace root: ${config.workspaceRoot}\n`);

    // Initialize checkpoint manager with workspace root
    this.checkpointManager = new CheckpointManager(config.workspaceRoot);
    console.log(`✅ CheckpointManager initialized for: ${config.workspaceRoot}/checkpoints\n`);

    // STEP 1: Analyze target class via Copilot
    console.log(`🔍 Step 1: Analyzing Java class...`);
    const analysis = await this.analyzer.analyzeFile(config.targetClassPath);
    console.log(`✅ Found: ${analysis.className} in package ${analysis.package}`);
    console.log(`📦 Project root: ${analysis.projectRoot}\n`);

    // STEP 1.5: Explore project context (DTOs, dependencies, etc.)
    console.log(`🔍 Step 1.5: Exploring project context...`);
    const projectContext = await this.explorer.exploreProject(config.targetClassPath, analysis.projectRoot);
    console.log(`✅ Context gathered:`);
    console.log(`   - ${projectContext.relatedClasses.length} related classes`);
    console.log(`   - ${projectContext.dependencies.length} dependencies`);
    console.log(`   - Frameworks: ${projectContext.testingFrameworks.join(', ') || 'none'}\n`);

    // STEP 2: Generate initial test via Copilot (with context)
    console.log(`🧪 Step 2: Generating initial test with project context...`);
    const initialTests = await this.analyzer.generateInitialTests(analysis);
    if (initialTests.length === 0) {
      throw new Error('No tests generated');
    }
    
    let currentTest = initialTests[0];
    
    // 🧹 CRITICAL: Preprocess initial test to remove markdown artifacts
    currentTest.code = preprocessGeneratedCode(currentTest.code);
    
    console.log(`✅ Generated: ${currentTest.name}\n`);

    // Workspace paths (fallback to empty string if no package)
    const packagePath = analysis.package ? analysis.package.replace(/\./g, '/') : '';
    const localTestDir = path.join(config.workspaceRoot, 'generated-tests', packagePath);
    const projectTestDir = path.join(analysis.projectRoot, 'src', 'test', 'java', packagePath);
    
    // ✅ Target test file (single file containing ALL test methods)
    const testClassName = `${analysis.className}Test`;
    const targetTestFileName = `${testClassName}.java`;
    const targetTestFilePath = path.join(projectTestDir, targetTestFileName);
    
    console.log(`📝 Target test file: ${targetTestFileName}`);
    console.log(`📂 Full path: ${targetTestFilePath}\n`);

    // 🆕 STEP 2.5: Initialize CompilationGate for hardening
    console.log(`🔧 Step 2.5: Initializing Compilation Gate (Hardening System)...`);
    this.compilationGate = new CompilationGate(
      this.maven,
      this.aiRepairOracle!,
      this.fixCache,
      analysis.projectRoot,
      10 // maxRepairAttempts (increased to handle multiple import fixes)
    );
    console.log(`✅ CompilationGate initialized (max attempts: 10)\n`);

    // 🧬 STEP 3: Initialize Evolution Engine with population
    console.log(`\n🧬 Step 3: Initializing Evolutionary Testing Engine...`);
    
    const evolutionConfig: EvolutionEngineConfig = {
      populationSize: 20,
      generations: config.generations,
      mutationRate: 0.3,
      crossoverRate: 0.7,
      elitismCount: 2
    };
    
    this.evolutionEngine = new EvolutionEngine(evolutionConfig, 'backend');
    
    // 🔧 CRITICAL: Set Copilot adapter for test generation
    this.evolutionEngine.setCopilotAdapter(this.copilotAPI);
    console.log(`✅ Copilot adapter configured for Evolution Engine`);
    
    // StateTracker requires oracle and operators - create simple defaults
    const mockOracle = {
      predict: async () => ({ expectedOutput: '', confidence: 0.5 }),
      getParameters: () => ({
        confidenceThreshold: 0.7,
        maxInputLength: 1000,
        securityPatterns: [],
        validationRules: []
      }),
      updateParameters: async () => {}
    } as any;
    
    const operators: OperatorDescriptor = {
      selection: 'tournament(4)',
      crossover: 'semantic',
      mutation: 'weighted-adaptive',
      elitism: 'top-k',
      oracleUpdate: 'gradient'
    };
    
    this.stateTracker = new StateTracker(mockOracle, operators);
    this.evolutionEngine.setStateTracker(this.stateTracker);
    
    // Create initial test suite from Copilot-generated test
    const initialSuite: EvolutionTestSuite = {
      tests: [{
        name: currentTest.name,
        code: currentTest.code,
        input: '', // Will be extracted from test
        expected: '', // Will be inferred
        metadata: {
          targetFile: config.targetClassPath,
          origin: 'copilot-initial' as const,
          language: 'java',
          generation: 0
        }
      }]
    };
    
    await this.evolutionEngine!.initialize(initialSuite);
    console.log(`✅ Population initialized: ${evolutionConfig.populationSize} individuals\n`);
    
    // 🧪 STEP 4: Create Test Runner Adapter for Evolution Engine
    const testRunner = {
      runGeneratedTests: async (suite: EvolutionTestSuite): Promise<TestExecutionResult[]> => {
        const results: TestExecutionResult[] = [];
        
        // 🎯 AGGREGATE ALL TEST METHODS INTO ONE CLASS FILE
        // Each test.code is already a SINGLE @Test method (no extraction needed!)
        const testMethods: string[] = [];
        const testNames: string[] = [];
        
        for (const test of suite.tests) {
          testNames.push(test.name);
          
          // 🧹 CRITICAL: Preprocess to remove markdown/backticks
          let cleanedCode = preprocessGeneratedCode(test.code);
          
          // 🔧 CRITICAL: Ensure method has closing brace
          cleanedCode = cleanedCode.trim();
          if (!cleanedCode.endsWith('}')) {
            console.warn(`⚠️ Method ${test.name} missing closing }, adding it`);
            cleanedCode += '\n    }';
          }
          
          // Code is already a single method - just add it
          testMethods.push(cleanedCode);
        }
        
        // Build single test class with all methods
        // Use class name from analysis, not method name!
        const className = `${analysis.className}Test`;
        const packageDecl = analysis.package ? `package ${analysis.package};\n\n` : '';
        
        const aggregatedTestClass = `${packageDecl}import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

/**
 * Evolutionary Test Suite - Generated by Monkey-Fuzzingo
 * Population: ${suite.tests.length} test methods
 */
public class ${className} {
    
${testMethods.map((method, idx) => `    // Individual ${idx + 1}\n    ${method}`).join('\n\n')}
    
}
`;
        
        // Write single aggregated file
        await fs.mkdir(localTestDir, { recursive: true });
        const localTestPath = path.join(localTestDir, `${className}.java`);
        await fs.writeFile(localTestPath, aggregatedTestClass, 'utf8');
        
        // Copy to project
        await fs.mkdir(projectTestDir, { recursive: true });
        const projectTestPath = path.join(projectTestDir, `${className}.java`);
        await fs.copyFile(localTestPath, projectTestPath);
        
        console.log(`   📝 Aggregated ${suite.tests.length} test methods into ${className}.java`);
        
        // Run Maven tests (batch compilation + execution)
        const mavenResult = await this.maven.runTests(analysis.projectRoot, className);
        
        // Convert Maven result to TestExecutionResult format
        for (const test of suite.tests) {
          const passed = mavenResult.testsPassed > 0 && mavenResult.testsFailed === 0;
          
          results.push({
            testName: test.name,
            passed,
            error: mavenResult.success ? undefined : 'Compilation or test execution failed',
            executionTime: mavenResult.executionTime || 0,
            stdout: mavenResult.stdout,
            stderr: mavenResult.stderr
          });
        }
        
        return results;
      }
    };
    
    // 🔄 STEP 5: Evolution Loop with full Evolution Engine
    let bestFitness = 0;
    
    for (let gen = 0; gen < config.generations; gen++) {
      console.log(`\n🌱 Generation ${gen + 1}/${config.generations}`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Run evolution generation (this handles population-wide fitness evaluation)
      const bestIndividual = await this.evolutionEngine!.evolveOneGeneration(
        gen,
        testRunner,
        this.copilotAPI
      );
      
      // Get best test from population
      const bestTest = bestIndividual.testSuite.tests[0];
      const fitness = bestIndividual.fitness;
      
      console.log(`\n📈 Best fitness: ${fitness.toFixed(3)}`);
      console.log(`📂 Total generations: ${gen + 1}`);
      
      // Extract multi-objective metrics from evolution engine
      const population = this.evolutionEngine!['population']; // Access private field
      if (population && population.length > 0) {
        const avgFitness = population.reduce((sum: number, ind: any) => sum + ind.fitness, 0) / population.length;
        console.log(`   ├─ Average Fitness:  ${avgFitness.toFixed(3)}`);
        console.log(`   ├─ Population Size:  ${population.length}`);
        
        // 🔥 HARDENING PHASE - Check compilation rate and apply fixes if needed
        const compiledCount = population.filter((ind: any) => ind.fitness > 0).length;
        const compilationRate = compiledCount / population.length;
        
        if (shouldHarden(compilationRate, 0.6)) {
          console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
          console.log(`║  🔧 HARDENING TRIGGERED - compilationRate: ${(compilationRate * 100).toFixed(1)}% < 60%  ║`);
          console.log(`╚═══════════════════════════════════════════════════════════════╝`);
          
          // Convert population to GeneratedTest[] format
          const testsToHarden: any[] = [];
          for (const ind of population) {
            if (ind.testSuite && ind.testSuite.tests && ind.testSuite.tests.length > 0) {
              for (const test of ind.testSuite.tests) {
                testsToHarden.push({
                  name: test.name || `test_gen${gen}_${testsToHarden.length}`,
                  code: test.code,
                  input: test.input || '',
                  expected: test.expected || '',
                  metadata: test.metadata || {
                    targetFile: config.targetClassPath,
                    origin: 'mutated' as const,
                    generation: gen
                  }
                });
              }
            }
          }
          
          console.log(`   Processing ${testsToHarden.length} tests for hardening...`);
          
          // Batch hardening - ✅ Pass target test file path (single file for all methods)
          const hardeningResult = await this.compilationGate!.hardenPopulation(
            testsToHarden,
            targetTestFilePath  // ✅ Single file path, not directory!
          );
          
          console.log(`   ✅ Hardening complete:`);
          console.log(`      Viable: ${hardeningResult.viable.length}`);
          console.log(`      Dead: ${hardeningResult.dead.length}`);
          console.log(`      Cache hits: ${hardeningResult.stats.totalCacheHits}`);
          
          // 🔥 CRITICAL: Replace population with hardened tests!
          // Dead tests are filtered out, viable tests replace broken ones
          if (hardeningResult.viable.length > 0) {
            console.log(`\n   🔄 Replacing population with ${hardeningResult.viable.length} viable tests...`);
            
            // Create individuals from hardened tests (no re-evaluation needed - they compiled!)
            const hardenedIndividuals = hardeningResult.viable.map((test) => {
              return {
                id: `hardened_gen${gen}_${test.metadata.geneId || Math.random().toString(36).substring(7)}`,
                testSuite: {
                  tests: [test],
                  metadata: test.metadata
                },
                fitness: 0.5, // Minimum fitness for compiling test
                age: 0,
                loss: 0.5 // Since fitness = 1 - loss, loss = 0.5 means fitness = 0.5
              };
            });
            
            // Replace dead individuals in population with hardened ones
            const deadCount = population.length - compiledCount;
            console.log(`   Replacing ${deadCount} dead individuals with ${hardenedIndividuals.length} viable ones`);
            
            // Keep top compiled individuals + add all hardened
            const compiledIndividuals = population
              .filter((ind: any) => ind.fitness > 0)
              .sort((a: any, b: any) => a.loss - b.loss) // Sort by loss (lower is better)
              .slice(0, Math.max(0, population.length - hardenedIndividuals.length));
            
            let newPopulation = [...compiledIndividuals, ...hardenedIndividuals];
            
            // Pad with duplicates if needed (maintain original population size)
            const targetSize = population.length;
            while (newPopulation.length < targetSize) {
              const randomViable = hardenedIndividuals[Math.floor(Math.random() * hardenedIndividuals.length)];
              newPopulation.push({ ...randomViable });
            }
            
            // 🔥 CRITICAL FIX: Write population back to evolution engine!
            this.evolutionEngine!['population'] = newPopulation;
            
            console.log(`   ✅ Population updated: ${newPopulation.length} individuals (${newPopulation.filter((i: any) => i.fitness > 0).length} compiled)`);
          } else {
            console.warn(`   ⚠️  No viable tests after hardening - population unchanged`);
          }
          
          // Print cache stats
          console.log(`\n${this.fixCache.printStats()}`);
        }
      }
      
      // Get state metrics from StateTracker
      if (this.stateTracker) {
        const history = this.stateTracker['history'];
        if (history && history.length > 0) {
          const latest = history[history.length - 1];
          console.log(`   ├─ Entropy (H):      ${latest.entropyPopulation.toFixed(4)}`);
          console.log(`   ├─ Variance (σ²):    ${latest.varianceFitness.toFixed(4)}`);
          console.log(`   └─ Dimension:        ${latest.dimTotal}`);
        }
      }
      
      // Track best fitness across generations
      if (fitness > bestFitness) {
        bestFitness = fitness;
        console.log(`🎯 New best fitness: ${bestFitness.toFixed(3)}`);
        
        // Write best test to files
        console.log(`📝 Writing best test to workspace...`);
        await fs.mkdir(localTestDir, { recursive: true });
        const localTestPath = path.join(localTestDir, `${bestTest.name}.java`);
        await fs.writeFile(localTestPath, bestTest.code, 'utf8');
        
        await fs.mkdir(projectTestDir, { recursive: true });
        const projectTestPath = path.join(projectTestDir, `${bestTest.name}.java`);
        await fs.copyFile(localTestPath, projectTestPath);
        console.log(`✅ Written: ${localTestPath}`);
      }
      
      // Save checkpoint - simplified version (checkpoint manager expects different signature)
      // TODO: Adapt checkpoint manager to work with evolution engine state
      console.log(`💾 Checkpoint would be saved at generation ${gen}`);
      
      // Early stop if perfect fitness
      if (fitness >= 0.99) {
        console.log(`\n🏆 Perfect fitness achieved! Stopping early.`);
        break;
      }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🏁 Evolution completed!`);
    console.log(`📈 Best fitness: ${bestFitness.toFixed(3)}`);
    console.log(`📂 Final test: ${path.join(localTestDir, 'best_test.java')}`);
  }

  /**
   * Apply symbol fix to test code
   * 
   * Strategies:
   * 1. Import fix: Add/replace import statement
   * 2. Package fix: Replace package name (javax → jakarta)
   * 3. Type fix: Replace type with correct one
   */
  private applySymbolFix(
    testCode: string,
    error: any, // SymbolError from build-tool-adapter
    fix: { suggestedFix?: string; pomChanges?: string; needsDependency?: any }
  ): string {
    if (!fix.suggestedFix) {
      return testCode;
    }
    
    const lines = testCode.split('\n');
    
    // Strategy 1: If fix is an import statement, add it at the top
    if (fix.suggestedFix.includes('import ')) {
      // Find first non-package, non-import line
      let insertIndex = 0;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('package ')) {
          insertIndex = i + 1;
        } else if (trimmed.startsWith('import ')) {
          insertIndex = i + 1;
        } else if (trimmed.length > 0 && !trimmed.startsWith('//')) {
          break;
        }
      }
      
      // Check if import already exists
      const importStatement = fix.suggestedFix.trim();
      if (!lines.some(l => l.trim() === importStatement)) {
        lines.splice(insertIndex, 0, importStatement);
        console.log(`      Added import at line ${insertIndex + 1}`);
      }
      
      return lines.join('\n');
    }
    
    // Strategy 2: If fix contains package replacement (javax → jakarta)
    if (fix.suggestedFix.includes('javax') || fix.suggestedFix.includes('jakarta')) {
      const fixedCode = testCode.replace(/javax\.servlet/g, 'jakarta.servlet');
      if (fixedCode !== testCode) {
        console.log(`      Replaced javax.servlet → jakarta.servlet`);
        return fixedCode;
      }
    }
    
    // Strategy 3: Replace at specific line (if error has line number)
    if (error.line && error.line <= lines.length) {
      const lineIndex = error.line - 1;
      const originalLine = lines[lineIndex];
      
      // Try to intelligently merge the fix
      // Example: If fix suggests "HttpServletResponse" and line has "ServletResponse"
      if (error.symbol) {
        const symbolName = error.symbol.replace('class ', '').replace('variable ', '').trim();
        const fixSymbolMatch = fix.suggestedFix.match(/class\s+(\w+)|(\w+)\s*;/);
        
        if (fixSymbolMatch) {
          const newSymbol = fixSymbolMatch[1] || fixSymbolMatch[2];
          const updatedLine = originalLine.replace(new RegExp(`\\b${symbolName}\\b`, 'g'), newSymbol);
          
          if (updatedLine !== originalLine) {
            lines[lineIndex] = updatedLine;
            console.log(`      Updated line ${error.line}: ${symbolName} → ${newSymbol}`);
            return lines.join('\n');
          }
        }
      }
    }
    
    // Fallback: return original code
    console.log(`      ⚠️  Could not apply fix automatically`);
    return testCode;
  }

  /**
   * Save population checkpoint with emergence metrics
   */
  private async saveCheckpoint(
    workspaceRoot: string,
    generation: number,
    metricsHistory: GenerationMetrics[],
    currentTest: any
  ): Promise<void> {
    console.log(`   [DEBUG] saveCheckpoint called with workspaceRoot: ${workspaceRoot}`);
    
    const checkpointDir = path.join(workspaceRoot, 'checkpoints');
    console.log(`   [DEBUG] checkpointDir: ${checkpointDir}`);
    
    await fs.mkdir(checkpointDir, { recursive: true });

    // Extract fitness values for metrics
    const fitnessValues = metricsHistory.map(m => m.fitness);
    const avgFitness = fitnessValues.reduce((a, b) => a + b, 0) / fitnessValues.length;
    const bestFitness = Math.max(...fitnessValues);
    
    // Calculate population diversity (variance in fitness)
    const diversity = listVariance(fitnessValues);
    
    // Calculate entropy (normalized Shannon entropy of fitness buckets)
    const fitnessBuckets = fitnessValues.map(f => Math.floor(f * 10)); // 0-10 scale
    const entropy = shannonEntropyNormalized(fitnessBuckets);
    
    // Check emergence threshold
    const threshold = emergenceThreshold(metricsHistory.length);
    const emergenceDetected = entropy < threshold;
    
    // Calculate maturity index
    const convergenceHistory = fitnessValues.map(f => 1 - f); // Convert fitness to loss
    const maturity = systemMaturity(convergenceHistory);

    // Multi-objective aggregates
    const lastMetric = metricsHistory[metricsHistory.length - 1];
    const avgLoss = lastMetric.objectives?.loss ?? (1 - avgFitness);
    const avgDiversity = lastMetric.objectives?.diversity ?? 0;
    const avgNovelty = lastMetric.objectives?.novelty ?? 0;
    const avgCoverage = lastMetric.objectives?.coverage ?? 0;
    const paretoFrontSizes = lastMetric.paretoRank ? [1] : []; // Single individual for now

    // Build population array (for now single individual, ready for multi-individual)
    const population: Individual[] = [{
      id: `ind_0_${Date.now()}`,
      fitness: fitnessValues[fitnessValues.length - 1] || 0,
      age: generation + 1,
      testCount: 1,
      tests: [{
        name: currentTest.name,
        code: currentTest.code,
        input: currentTest.input || '',
        expected: currentTest.expected || '',
        confidence: currentTest.confidence || 0.8,
        language: 'java',
        metadata: {
          targetFile: currentTest.metadata?.targetFile || '',
          language: 'java',
          origin: 'copilot',
          generation: generation
        }
      }],
      
      // Multi-objective data
      objectives: lastMetric.objectives,
      paretoRank: lastMetric.paretoRank,
      crowdingDistance: lastMetric.crowdingDistance
    }];

    const checkpoint: PopulationCheckpoint = {
      generation,
      timestamp: new Date().toISOString(),
      population,
      metrics: {
        avgFitness,
        bestFitness,
        diversity,
        entropy,
        emergenceDetected,
        
        // Multi-objective aggregates
        avgLoss,
        avgDiversity,
        avgNovelty,
        avgCoverage,
        paretoFrontSizes
      }
    };

    const checkpointPath = path.join(checkpointDir, `checkpoint-gen-${generation}.json`);
    await fs.writeFile(checkpointPath, JSON.stringify(checkpoint, null, 2), 'utf8');
    
    console.log(`\n💾 Checkpoint saved: ${checkpointPath}`);
    console.log(`   Generation: ${generation}`);
    console.log(`   Population size: ${population.length}`);
    console.log(`   Individual fitness: ${population[0].fitness.toFixed(3)}`);
    
    // Print multi-objective summary
    if (lastMetric.objectives && lastMetric.paretoRank) {
      console.log(`\n   🎯 Multi-Objective Summary:`);
      console.log(`      Loss:      ${lastMetric.objectives.loss.toFixed(3)}`);
      console.log(`      Diversity: ${lastMetric.objectives.diversity.toFixed(3)}`);
      console.log(`      Novelty:   ${lastMetric.objectives.novelty.toFixed(3)}`);
      console.log(`      Coverage:  ${lastMetric.objectives.coverage.toFixed(3)}`);
      console.log(`      Pareto Rank: ${lastMetric.paretoRank}`);
      console.log(`      Crowding:  ${lastMetric.crowdingDistance?.toFixed(3) || 'N/A'}`);
    }
    
    console.log(`\n   📊 Aggregate Metrics:`);
    console.log(`      Avg fitness: ${avgFitness.toFixed(3)}`);
    console.log(`      Best fitness: ${bestFitness.toFixed(3)}`);
    console.log(`      Diversity: ${diversity.toFixed(4)}`);
    console.log(`      Entropy: ${entropy.toFixed(4)}`);
    console.log(`      Maturity: ${maturity.toFixed(4)}`);
    if (emergenceDetected) {
      console.log(`   🎯 Emergence detected! (entropy ${entropy.toFixed(4)} < threshold ${threshold.toFixed(4)})`);
    }
    console.log(`   📝 Metrics history length: ${metricsHistory.length}`);
    metricsHistory.forEach((m) => {
      console.log(`      Gen ${m.generation}: fitness=${m.fitness.toFixed(3)}, compile=${m.compilationSuccess ? '✅' : '❌'}, tests=${m.testsPassed}/${m.testsRun}`);
    });
  }

  /**
   * Resume evolution from checkpoint
   */
  async resume(
    checkpointPath: string, 
    additionalGenerations: number = 10,
    workspaceRoot?: string  // Optional override for workspace
  ): Promise<void> {
    console.log(`\n🔄 ===== RESUME METHOD CALLED =====`);
    console.log(`   checkpointPath: ${checkpointPath}`);
    console.log(`   additionalGenerations: ${additionalGenerations}`);
    console.log(`   workspaceRoot param: ${workspaceRoot || 'NOT PROVIDED'}`);
    console.log(`=====================================\n`);
    
    console.log(`\n🔄 Resuming evolution from checkpoint...`);
    console.log(`📂 Checkpoint: ${checkpointPath}\n`);
    
    // Load checkpoint
    const checkpoint = await this.checkpointManager.loadCheckpoint(checkpointPath);
    if (!checkpoint) {
      throw new Error('Failed to load checkpoint');
    }
    
    console.log(`✅ Checkpoint loaded:`);
    console.log(`   Generation: ${checkpoint.generation}`);
    console.log(`   Best fitness: ${checkpoint.metrics.bestFitness.toFixed(3)}`);
    console.log(`   Population: ${checkpoint.population.length} individuals\n`);
    
    // Extract current state
    const individual = checkpoint.population[0];
    if (!individual || individual.tests.length === 0) {
      throw new Error('Invalid checkpoint: no tests found');
    }
    
    const currentTest = individual.tests[0];
    const targetFile = currentTest.metadata.targetFile;
    
    if (!targetFile) {
      throw new Error('Invalid checkpoint: no target file in metadata');
    }
    
    console.log(`📝 Resuming test: ${currentTest.name}`);
    console.log(`🎯 Target file: ${targetFile}\n`);
    
    // Determine workspace root (prefer parameter, fallback to cwd)
    console.log(`[DEBUG] workspaceRoot parameter: ${workspaceRoot || 'undefined'}`);
    console.log(`[DEBUG] process.cwd(): ${process.cwd()}`);
    
    const effectiveWorkspaceRoot = workspaceRoot || process.cwd();
    console.log(`[DEBUG] effectiveWorkspaceRoot: ${effectiveWorkspaceRoot}\n`);
    
    // Create config for resume
    const config: EvolutionConfig = {
      targetClassPath: targetFile,
      generations: checkpoint.generation + additionalGenerations,
      workspaceRoot: effectiveWorkspaceRoot
    };
    
    // Initialize checkpoint manager with correct workspace
    this.checkpointManager = new CheckpointManager(effectiveWorkspaceRoot);
    
    // Analyze target class to get project root
    console.log(`🔍 Re-analyzing target class...`);
    const analysis = await this.analyzer.analyzeFile(config.targetClassPath);
    console.log(`✅ Found: ${analysis.className} in ${analysis.projectRoot}\n`);
    
    // Explore project context
    console.log(`🔍 Re-exploring project context...`);
    const projectContext = await this.explorer.exploreProject(config.targetClassPath, analysis.projectRoot);
    console.log(`✅ Context gathered: ${projectContext.relatedClasses.length} classes\n`);
    
    // Reconstruct metricsHistory from checkpoint (if available)
    let metricsHistory: GenerationMetrics[] = [];
    
    if (checkpoint.metricsHistory && checkpoint.metricsHistory.length > 0) {
      // Use saved metrics history
      metricsHistory = checkpoint.metricsHistory.map(m => ({
        generation: m.generation,
        testName: currentTest.name,
        compilationSuccess: m.compilationRate === 1,
        testsRun: m.testsRun,
        testsPassed: m.testsPassed,
        testsFailed: m.testsRun - m.testsPassed,
        fitness: m.fitness,
        timestamp: new Date().toISOString(),
        objectives: undefined, // Old checkpoints won't have this
        paretoRank: undefined,
        crowdingDistance: undefined
      }));
    } else {
      // Reconstruct from individual
      metricsHistory = [{
        generation: checkpoint.generation,
        testName: currentTest.name,
        compilationSuccess: individual.fitness > 0,
        testsRun: individual.testCount,
        testsPassed: Math.floor(individual.fitness * individual.testCount),
        testsFailed: individual.testCount - Math.floor(individual.fitness * individual.testCount),
        fitness: individual.fitness,
        timestamp: checkpoint.timestamp,
        objectives: individual.objectives,
        paretoRank: individual.paretoRank,
        crowdingDistance: individual.crowdingDistance
      }];
    }
    
    console.log(`📊 Restored ${metricsHistory.length} generation(s) from checkpoint`);
    console.log(`🚀 Continuing from generation ${checkpoint.generation + 1} to ${config.generations}\n`);
    
    // Resume evolution loop
    const packagePath = analysis.package ? analysis.package.replace(/\./g, '/') : '';
    const localTestDir = path.join(config.workspaceRoot, 'generated-tests', packagePath);
    const projectTestDir = path.join(analysis.projectRoot, 'src', 'test', 'java', packagePath);
    
    let bestFitness = checkpoint.metrics.bestFitness;
    let currentTestCode = currentTest.code;
    
    // ✅ FIX: Use <= instead of < to include the final generation
    for (let gen = checkpoint.generation + 1; gen <= config.generations; gen++) {
      console.log(`\n🌱 Generation ${gen}/${config.generations} (RESUMED)`);
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

      // Write test
      await fs.mkdir(localTestDir, { recursive: true });
      const localTestPath = path.join(localTestDir, `${currentTest.name}.java`);
      await fs.writeFile(localTestPath, currentTestCode, 'utf8');
      
      await fs.mkdir(projectTestDir, { recursive: true });
      const projectTestPath = path.join(projectTestDir, `${currentTest.name}.java`);
      await fs.copyFile(localTestPath, projectTestPath);
      console.log(`✅ Test written and copied`);

      // Compile
      const compileResult = await this.maven.compile(analysis.projectRoot);
      console.log(`   Compilation: ${compileResult.success ? '✅ SUCCESS' : '❌ FAILED'}`);
      
      if (!compileResult.success && compileResult.errors.length > 0) {
        const fixProposal = await this.fixEngine.fixTest(currentTestCode, compileResult.errors, gen);
        if (fixProposal.confidence > 0.5) {
          currentTestCode = fixProposal.fixedCode;
          await fs.writeFile(localTestPath, currentTestCode, 'utf8');
          await fs.copyFile(localTestPath, projectTestPath);
          console.log(`✅ Fixed compilation errors`);
        }
      }

      // Run tests
      const testResult = await this.maven.runTests(analysis.projectRoot, currentTest.name);
      console.log(`   Tests: ${testResult.testsPassed}/${testResult.testsRun} passed`);
      
      // Calculate metrics with symbol-level granularity
      let compilationSuccess: number;
      
      // Priority: compileResult.symbolMetrics > testResult.symbolMetrics > binary
      const symbolMetrics = compileResult.symbolMetrics || testResult.symbolMetrics;
      
      if (symbolMetrics) {
        compilationSuccess = symbolMetrics.semanticFitness;
        console.log(`   🎯 Semantic Fitness: ${(compilationSuccess * 100).toFixed(1)}% (${symbolMetrics.resolvedSymbols}/${symbolMetrics.totalSymbols} symbols)`);
        
        if (symbolMetrics.unresolvedSymbols.length > 0) {
          console.log(`   ⚠️  Unresolved symbols (${symbolMetrics.unresolvedSymbols.length}):`);
          
          // Show first 3 errors
          for (let i = 0; i < Math.min(3, symbolMetrics.unresolvedSymbols.length); i++) {
            const error = symbolMetrics.unresolvedSymbols[i];
            console.log(`      ${i+1}. ${error.file}:${error.line} - ${error.symbol || error.message}`);
          }
          
          // 🤖 COPILOT FIX: Try to fix first unresolved symbol
          if (compilationSuccess < 1.0 && this.maven.gatherFixContext && this.maven.requestSymbolFix) {
            console.log(`\n   🔧 Attempting Copilot-based symbol fix...`);
            
            const firstError = symbolMetrics.unresolvedSymbols[0];
            const fixContext = await this.maven.gatherFixContext(analysis.projectRoot, firstError);
            const suggestedFix = await this.maven.requestSymbolFix(fixContext);
            
            if (suggestedFix.suggestedFix) {
              console.log(`   ✅ Copilot suggested fix (applied to next generation)`);
              currentTestCode = this.applySymbolFix(currentTestCode, firstError, suggestedFix);
            }
            
            if (suggestedFix.needsDependency) {
              console.log(`   📦 Dependency needed: ${suggestedFix.needsDependency.groupId}:${suggestedFix.needsDependency.artifactId}`);
            }
          }
        }
      } else {
        compilationSuccess = compileResult.success ? 1 : 0;
      }
      
      const testPassRate = testResult.testsRun > 0 ? testResult.testsPassed / testResult.testsRun : 0;
      
      const compositeLoss = this.controller.calculateCompositeLoss(compilationSuccess, testPassRate, currentTestCode);
      const fitness = this.controller.calculateFitness(compositeLoss);
      const loss = compositeLoss.totalLoss;
      
      // Multi-objective ranking
      const population = [{
        id: `ind_gen${gen}`,
        testCode: currentTestCode,
        testName: currentTest.name,
        generation: gen,
        loss: loss,
        coverageData: undefined
      }];
      
      const ranked: RankedIndividual[] = this.controller.rankPopulationMultiObjective(population);
      const individual = ranked[0];
      
      console.log(`📊 Fitness: ${fitness.toFixed(3)} | Loss: ${loss.toFixed(3)} | Rank: ${individual.rank}`);
      
      // Save metrics
      metricsHistory.push({
        generation: gen,
        testName: currentTest.name,
        compilationSuccess: compileResult.success,
        testsRun: testResult.testsRun,
        testsPassed: testResult.testsPassed,
        testsFailed: testResult.testsFailed,
        fitness: fitness,
        timestamp: new Date().toISOString(),
        objectives: individual.objectives,
        paretoRank: individual.rank,
        crowdingDistance: individual.crowdingDistance
      });
      
      if (fitness > bestFitness) {
        bestFitness = fitness;
        console.log(`🎯 New best fitness: ${bestFitness.toFixed(3)}`);
      }
      
      // Controller decision
      const metricsSnapshots: MetricsSnapshot[] = metricsHistory.map(m => ({
        generation: m.generation,
        fitness: m.fitness,
        loss: 1 - m.fitness,
        compilationRate: m.compilationSuccess ? 1 : 0,
        testPassRate: m.testsRun > 0 ? m.testsPassed / m.testsRun : 0,
        testsRun: m.testsRun,
        testsPassed: m.testsPassed
      }));
      
      const systemState = this.controller.analyzeAndDecide(metricsSnapshots);
      console.log(`\n${this.controller.getDiagnostics(metricsSnapshots)}`);
      
      // 🔥 HARDENING PHASE - Check if compilationRate < 0.6
      const avgCompilationRate = metricsSnapshots.length > 0
        ? metricsSnapshots.reduce((sum, m) => sum + m.compilationRate, 0) / metricsSnapshots.length
        : 1.0;
      
      if (shouldHarden(avgCompilationRate, 0.6)) {
        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  🔧 HARDENING TRIGGERED - compilationRate: ${(avgCompilationRate * 100).toFixed(1)}% < 60%  ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
        
        // Convert current test to GeneratedTest format
        const testForHardening = {
          name: currentTest.name,
          code: currentTestCode,
          input: '',
          expected: '',
          metadata: {
            ...(currentTest.metadata || {}),
            targetFile: config.targetClassPath,
            origin: 'mutated' as const,
            generation: gen
          }
        };
        
        const testFilePath = path.join(projectTestDir, `${currentTest.name}.java`);
        const hardeningResult = await this.compilationGate!.harden(testForHardening, testFilePath);
        
        if (hardeningResult.success && hardeningResult.test) {
          currentTestCode = hardeningResult.test.code;
          console.log(`✅ Test hardened successfully after ${hardeningResult.attempts} attempt(s)`);
          console.log(`   Fixes applied: ${hardeningResult.fixesApplied}, Cache hits: ${hardeningResult.cacheHits}`);
        } else {
          console.log(`❌ Hardening failed: ${hardeningResult.reason}`);
          console.log(`   Keeping original test (will try evolution)`);
        }
        
        // Print cache stats
        console.log(`\n${this.fixCache.printStats()}`);
      }
      
      // Save checkpoint
      await this.saveCheckpoint(config.workspaceRoot, gen, metricsHistory, {
        name: currentTest.name,
        code: currentTestCode,
        metadata: currentTest.metadata
      });
      
      // Early stop decisions
      if (systemState.recommendedAction === 'early_stop') {
        console.log(`\n🛑 Early stop: ${systemState.reason}`);
        break;
      }
      
      if (fitness >= 0.99) {
        console.log(`\n🏆 Perfect fitness achieved!`);
        break;
      }
      
      // Evolve for next generation
      if (gen < config.generations - 1) {
        const evolved = await this.evolver.evolveTest(
          currentTestCode,
          projectContext,
          gen,
          { fitness, testsRun: testResult.testsRun, testsPassed: testResult.testsPassed }
        );
        
        if (evolved.confidence > 0.5) {
          currentTestCode = evolved.code;
          console.log(`✅ Evolved (confidence: ${evolved.confidence.toFixed(2)})`);
        }
      }
    }
    
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`🏁 Resumed evolution completed!`);
    console.log(`📈 Best fitness: ${bestFitness.toFixed(3)}`);
    console.log(`📂 Total generations: ${metricsHistory.length}`);
    
    // Print final FixCache statistics
    console.log(`\n${this.fixCache.printStats()}`);
  }
}

