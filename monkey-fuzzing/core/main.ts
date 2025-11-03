/**
 * ===========================================================
 * MAIN.TS
 * ===========================================================
 * Entry Point del sistema Monkey-Fuzzing-Oracle
 * - Orchestrazione globale del ciclo evolutivo
 * - Inizializzazione moduli: Oracle, Mutation, Evolution, Report, Feedback
 * - Loop multi-generazione con metriche e report
 * ===========================================================
 */

import fs from "fs/promises";
import path from "path";
import { EvolutionEngine } from "./evolution";
import { OracleManager } from "./oracle";
import { MutationRegistry } from "./mutation";
import { ReportEngine } from "./report";
import { FeedbackEngine } from "./feedback";
import { StateTracker } from './state';
import { CopilotFixEngine } from './copilot-fix';
import { MutationPipeline } from './mutation-pipeline';
import { ErrorClassifier } from './error-classifier';
import { PersistenceManager } from './persistence';
import { GeneratedTestSuite } from "./types.js";
import { TestRunner } from "./runner.js";
import { RealCoverageEngine } from './coverage-engine';
import { EvolutionConfig } from "./evolution";
import { CopilotAnalyzer, StubCopilotAPI } from './copilot-analyzer';
import { SandboxManager } from './sandbox-manager';
import { TestWriter } from './test-writer';
import { optimalAdaptationRate, emergenceThreshold } from '../metrics/metrics';

// ===========================================================
// 🧩 CONFIGURAZIONE INIZIALE
// ===========================================================
async function loadConfig(filePath: string): Promise<EvolutionConfig> {
    const json = await fs.readFile(filePath, "utf-8");
    return JSON.parse(json);
}

async function bootstrap(): Promise<void> {
    console.log("\n🚀 Avvio Monkey-Fuzzing-Oracle Engine\n");

    // Carica configurazione da file o fallback default
    const configPath = process.argv.includes("--config")
        ? process.argv[process.argv.indexOf("--config") + 1]
        : "./config/evolution.json";

    const config: EvolutionConfig = await loadConfig(configPath).catch(() => ({
        populationSize: 20,  // ✅ Popolazione ottimale per codice complesso
        mutationRate: optimalAdaptationRate(20) * 0.5, // ✅ Mutazioni conservative (dimezzate)
        crossoverRate: 0.4,  // ✅ Crossover moderato
        generations: 10,     // ✅ Più generazioni piccole
        elitismCount: 5,     // ✅ Mantieni top 25%
        fitnessWeights: {
            oracleAccuracy: emergenceThreshold(20) * 4,   // ~0.4
            testCoverage: emergenceThreshold(20) * 2,     // ~0.2
            performance: emergenceThreshold(20),          // ~0.1
            securityFindings: emergenceThreshold(20),     // ~0.1
            diversity: emergenceThreshold(20) * 2,        // ~0.2
        },
    }));

    console.log("⚙️ Configurazione caricata:", config);

    // ===========================================================
    // 🔧 INIZIALIZZA MODULI CORE
    // ===========================================================
    const mutationRegistry = new MutationRegistry();
    const oracleManager = new OracleManager();
    const reportEngine = new ReportEngine("./reports");
    const evolutionEngine = new EvolutionEngine(config);
    const feedbackEngine = new FeedbackEngine(oracleManager, mutationRegistry, config);
    const testRunner = new TestRunner(); // modulo esecutivo, da implementare o mockare
    
    // Initialize build tool adapter if project root is provided or can be detected
    let projectRootArg = process.argv.includes('--project') 
        ? process.argv[process.argv.indexOf('--project') + 1] 
        : process.argv.includes('--project-root')
        ? process.argv[process.argv.indexOf('--project-root') + 1]
        : null;
    
    // If not provided, try to auto-detect from sandbox
    let detectedLanguage: 'java' | 'python' | 'typescript' | 'rust' = 'typescript';
    
    // Auto-detect language from sandbox if provided
    if (process.argv.includes('--sandbox')) {
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        const workspaceRoot = path.resolve('..');
        const sandboxPath = path.join(workspaceRoot, '.sandboxes', sandboxId);
        
        const testsPath = path.join(sandboxPath, 'tests');
        try {
            const files = await fs.readdir(testsPath);
            if (files.some(f => f.endsWith('.java'))) {
                detectedLanguage = 'java';
                console.log(`🔍 Detected language: Java`);
            } else if (files.some(f => f.endsWith('.py'))) {
                detectedLanguage = 'python';
                console.log(`🔍 Detected language: Python`);
            } else if (files.some(f => f.endsWith('.rs'))) {
                detectedLanguage = 'rust';
                console.log(`🔍 Detected language: Rust`);
            } else {
                console.log(`🔍 Detected language: TypeScript (default)`);
            }
        } catch (err) {
            console.log(`⚠️ Could not detect language from sandbox, using default: TypeScript`);
        }
    }
    
    if (!projectRootArg && process.argv.includes('--sandbox')) {
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        // Sandbox is in workspace root, not in monkey-fuzzing folder
        const workspaceRoot = path.resolve('..');
        const sandboxPath = path.join(workspaceRoot, '.sandboxes', sandboxId);
        console.log(`🔍 Auto-detecting project root from sandbox: ${sandboxPath}`);
        
        const sandboxMgr = new SandboxManager();
        projectRootArg = await sandboxMgr.detectProjectRoot(sandboxPath);
        
        if (projectRootArg) {
            console.log(`✅ Detected project root: ${projectRootArg}`);
        } else {
            console.log(`⚠️ Could not auto-detect project root from sandbox`);
        }
    }
    
    if (projectRootArg) {
        console.log(`🔧 Initializing build tool for project: ${projectRootArg}`);
        await testRunner.initializeBuildTool(projectRootArg);
    }
    
    const errorClassifier = new ErrorClassifier(); // standalone for aggregation (runner has internal one)
    const copilotFix = new CopilotFixEngine(); // adapter potrà essere iniettato
    const mutationPipeline = new MutationPipeline(copilotFix);
    const persistence = new PersistenceManager('./checkpoints');
    const coverageEngine = new RealCoverageEngine(process.cwd());

    // Imposta descrittori operatori formali
    const stateTracker = new StateTracker(oracleManager, {
        selection: 'tournament(4)',
        crossover: 'uniform',
        mutation: 'weighted-adaptive',
        elitism: `top-${config.elitismCount}`,
        oracleUpdate: 'gradient+entropy-adjust'
    });
    evolutionEngine.setStateTracker(stateTracker);

    // ===========================================================
    // 🧪 SETUP INIZIALE DEL TEST SUITE (Language-Agnostic Bootstrap)
    // ===========================================================
    let baseSuite: GeneratedTestSuite;
    let targetLanguage: 'java' | 'python' | 'typescript' | 'rust' = 'typescript';
    
    // Support --target-file for Copilot-based analysis
    if (process.argv.includes('--target-file')) {
        const targetFileArg = process.argv[process.argv.indexOf('--target-file') + 1];
        const projectRoot = process.argv.includes('--project-root') 
            ? process.argv[process.argv.indexOf('--project-root') + 1] 
            : path.resolve('..');
        
        console.log(`🔍 Analyzing target file: ${targetFileArg}`);
        const analyzer = new CopilotAnalyzer(new StubCopilotAPI()); // replace with real Copilot
        const sandboxMgr = new SandboxManager();
        const testWriter = new TestWriter();
        
        const sandboxInfo = await sandboxMgr.setup(projectRoot, targetFileArg);
        const analysis = await analyzer.analyzeFile(projectRoot, targetFileArg);
        const initialTests = await analyzer.generateInitialTests(analysis);
        await testWriter.writeTests(sandboxInfo.testsPath, initialTests, analysis.language);
        
        targetLanguage = (analysis.language as any) || 'typescript';
        baseSuite = {
            id: 'copilot_generated',
            targetLanguage,
            tests: initialTests.map(t => ({
                name: t.name,
                input: t.input,
                expected: t.expected,
                code: t.code,
                metadata: {
                    targetFile: analysis.sourceFile,
                    language: targetLanguage,
                    origin: 'copilot-initial' as const,
                    generation: 0,
                    confidence: 1.0
                }
            }))
        };
        console.log(`✅ Generated ${initialTests.length} initial test(s) from Copilot analysis.`);
    } else if (process.argv.includes('--sandbox')) {
        // Load tests from existing sandbox
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        const workspaceRoot = path.resolve('..');
        const sandboxPath = path.join(workspaceRoot, '.sandboxes', sandboxId);
        const testsPath = path.join(sandboxPath, 'tests');
        
        console.log(`📂 Loading tests from sandbox: ${testsPath}`);
        
        try {
            const testFiles = await fs.readdir(testsPath);
            const javaTests = testFiles.filter(f => f.endsWith('.java') && !f.startsWith('.'));
            
            const tests: Array<any> = [];
            for (const file of javaTests) {
                const code = await fs.readFile(path.join(testsPath, file), 'utf-8');
                const name = path.basename(file, '.java');
                tests.push({
                    name,
                    code,  // ✅ Include full code
                    input: 'test',
                    expected: 'valid',
                    confidence: 1.0,
                    language: detectedLanguage,
                    metadata: {
                        targetFile: projectRootArg || '',
                        language: detectedLanguage,
                        origin: 'copilot-initial' as const,
                        generation: 0
                    }
                });
            }
            
            baseSuite = {
                id: `sandbox_${sandboxId}`,
                targetLanguage: detectedLanguage,
                tests
            };
            
            console.log(`✅ Loaded ${tests.length} test(s) from sandbox`);
        } catch (error) {
            console.error(`❌ Failed to load tests from sandbox:`, error);
            // Fall through to fallback
            const defaultConfidence = 1.0 - emergenceThreshold(2);
            baseSuite = {
                id: 'base_suite',
                targetLanguage: detectedLanguage,
                tests: [
                    { 
                        name: "simple_case", input: "test", expected: "valid", code: "console.log('simple_case');",
                        metadata: { targetFile: '', language: detectedLanguage, origin: 'copilot-initial' as const, generation: 0, confidence: 1.0 }
                    },
                    { 
                        name: "edge_case", input: "", expected: "invalid", code: "console.log('edge_case');",
                        metadata: { targetFile: '', language: detectedLanguage, origin: 'copilot-initial' as const, generation: 0, confidence: defaultConfidence }
                    },
                ],
            };
        }
    } else {
        // Fallback: hardcoded stub suite with formal confidence
        const defaultConfidence = 1.0 - emergenceThreshold(2); // ~0.9 for 2 tests
        baseSuite = {
            id: 'base_suite',
            targetLanguage: detectedLanguage, // Use auto-detected language
            tests: [
                { 
                    name: "simple_case", input: "test", expected: "valid", code: "console.log('simple_case');",
                    metadata: { targetFile: '', language: 'typescript', origin: 'copilot-initial' as const, generation: 0, confidence: 1.0 }
                },
                { 
                    name: "edge_case", input: "", expected: "invalid", code: "console.log('edge_case');",
                    metadata: { targetFile: '', language: 'typescript', origin: 'copilot-initial' as const, generation: 0, confidence: defaultConfidence }
                },
            ],
        };
    }

    // Resume support
    if (process.argv.includes('--resume')) {
        const latest = await persistence.loadLatest();
        if (latest) {
            console.log(`↩️ Ripristino checkpoint generazione ${latest.generation}`);
            // restore population into engine with proper metadata
            const restoredPopulation = latest.population.map(p => ({
                id: p.id,
                fitness: p.fitness,
                age: p.age,
                tests: p.tests.map((t: any) => ({
                    name: t.name,
                    input: t.input || 'default',
                    expected: t.expected || 'valid',
                    code: t.code || "console.log('resume');",
                    metadata: {
                        targetFile: t.metadata?.targetFile || '',
                        language: t.metadata?.language || 'typescript',
                        origin: (t.metadata?.origin || 'mutated') as 'copilot-initial' | 'mutated' | 'repaired',
                        generation: t.metadata?.generation || latest.generation,
                        confidence: t.metadata?.confidence || t.confidence || emergenceThreshold(p.tests.length)
                    }
                }))
            }));
            evolutionEngine.resumeFromState(restoredPopulation, { generations: config.generations });
            // rebuild baseSuite from first individual's tests if present
            if (latest.population.length > 0) {
                baseSuite = {
                    id: 'resume_suite',
                    targetLanguage: (latest.population[0].tests[0] as any)?.metadata?.language || 'typescript',
                    tests: restoredPopulation[0].tests
                };
            }
        } else {
            console.log('⚠️ Nessun checkpoint trovato, avvio fresh run.');
        }
    }

    console.log("🧩 Base suite inizializzata con", baseSuite.tests.length, "test");

    // ===========================================================
    // 🔁 LOOP EVOLUTIVO PRINCIPALE
    // ===========================================================
    let currentConfig = config;
    evolutionEngine.initialize(baseSuite);
    const generations = currentConfig.generations;
    for (let gen = 0; gen < generations; gen++) {
        console.log(`\n🌱 Generazione ${gen + 1}/${generations}\n`);
        const best = await evolutionEngine.evolveOneGeneration(gen, { runGeneratedTests: (suite) => {
            const fallbackConf = emergenceThreshold(suite.tests.length);
            const mapped = suite.tests.map(t => ({
                name: t.name,
                input: t.input,
                expected: t.expected,
                code: t.code || ("console.log('exec','" + t.name + "')"),
                metadata: {
                    targetFile: t.metadata?.targetFile || '',
                    language: detectedLanguage,
                    origin: t.metadata?.origin || ('mutated' as const),
                    generation: gen,
                    confidence: t.metadata?.confidence || fallbackConf
                }
            }));
            const runnerSuite = { id: `evo_${gen}`, targetLanguage: detectedLanguage, tests: mapped };
            return testRunner.runGeneratedTests(runnerSuite);
        } });

        // Raccogli risultati e genera report
        const mappedReportTests = best.testSuite.tests.map(t => ({
            name: t.name,
            input: t.input,
            expected: t.expected,
            code: t.code || "console.log('exec', '" + t.name + "');",
            metadata: {
                targetFile: t.metadata?.targetFile || '',
                language: detectedLanguage,
                origin: t.metadata?.origin || ('mutated' as const),
                generation: gen,
                confidence: t.metadata?.confidence || emergenceThreshold(best.testSuite.tests.length)
            }
        }));
    const testResults = await testRunner.runGeneratedTests({ id: `report_gen_${gen}`, targetLanguage: detectedLanguage, tests: mappedReportTests });
    // Real coverage instrumentation
    const coverageData = await coverageEngine.instrumentCode(mappedReportTests.map(t => t.name));
    // inject coverage metrics into state meta for snapshot
    (evolutionEngine as any).stateMeta.coverageSemantic = coverageData.semanticCoverage;
    (evolutionEngine as any).stateMeta.coverageStructural = coverageData.structuralCoverage;
    (evolutionEngine as any).stateMeta.coverageTotal = coverageData.totalCoverage;
    const report = await reportEngine.generateGenerationReport(gen, (evolutionEngine as any)["population"], testResults as any);
        // salva checkpoint
        const lastSnapshot = (evolutionEngine as any).stateTracker?.getHistory()?.slice(-1)[0];
        if (lastSnapshot) {
            const file = await persistence.saveCheckpoint(gen, (evolutionEngine as any)["population"], oracleManager, lastSnapshot);
            console.log(`💾 Checkpoint salvato: ${file}`);
        }

        // =====================================================
        // 🔁 Error Feedback Sub-loop
        // =====================================================
        const errors = testRunner.getNormalizedErrors();
        for (const e of errors) {
            errorClassifier.classify(e.testName, e.raw, e.stack);
            // future: apply copilot fix proposals
        }
        const aggregate = errorClassifier.buildAggregateReport();
        if (aggregate.total > 0) {
            console.log(`🛠 Error Loop: total=${aggregate.total} compile=${aggregate.compile} runtime=${aggregate.runtime} entropyKinds=${aggregate.entropyKinds.toFixed(3)}`);
            // attempt intelligent fixes on baseSuite for next generation
            const repaired = await mutationPipeline.processErrors(baseSuite.tests as any, errors as any, gen);
            baseSuite.tests = repaired as any;
            // propagate repairs into population
            evolutionEngine.applyRepairs(repaired as any);
        }
        // Reset runner errors for next generation accumulation
        testRunner.resetErrors();

        // Analizza feedback e aggiorna parametri
        const feedback = feedbackEngine.analyzeReport(report);
        feedbackEngine.printDiagnostics();

        // Aggiorna configurazione evolutiva + resize popolazione
        currentConfig = feedback.newConfig;
        evolutionEngine.setConfig(currentConfig);
        if (currentConfig.populationSize !== (evolutionEngine as any).population.length) {
            evolutionEngine.applyPopulationResize(currentConfig.populationSize);
        }

        console.log("🧩 Nuova configurazione aggiornata:", {
            mutationRate: currentConfig.mutationRate.toFixed(3),
            crossoverRate: currentConfig.crossoverRate.toFixed(3),
            elitismCount: currentConfig.elitismCount,
        });

        // Fine generazione
        if (feedback.oracleAdjusted) {
            console.log("🧠 Oracolo ricalibrato per instabilità rilevata.");
        }

        console.log(feedback.insights.join("\n"));
    }

    // ===========================================================
    // 📈 TREND FINALE
    // ===========================================================
    await reportEngine.generateFinalTrendReport();

    console.log(`
===========================================================
🏁 Evoluzione completata.
📊 Report disponibili in ./reports
📘 Ultima generazione: ${currentConfig.generations}
===========================================================
`);
}

// ===========================================================
// 🏁 AVVIO PROGRAMMA
// ===========================================================
bootstrap().catch((err) => {
    console.error("❌ Errore critico:", err);
    process.exit(1);
});
