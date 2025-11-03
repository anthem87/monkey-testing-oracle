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
import { GeneratedTestSuite, TestRunner } from "./runner";
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
                confidence: 1.0,
                language: targetLanguage,
                code: t.code
            }))
        };
        console.log(`✅ Generated ${initialTests.length} initial test(s) from Copilot analysis.`);
    } else {
        // Fallback: hardcoded stub suite with formal confidence
        const defaultConfidence = 1.0 - emergenceThreshold(2); // ~0.9 for 2 tests
        baseSuite = {
            id: 'base_suite',
            targetLanguage: 'typescript',
            tests: [
                { name: "simple_case", input: "test", expected: "valid", confidence: 1.0, language: "typescript", code: "console.log('simple_case');" },
                { name: "edge_case", input: "", expected: "invalid", confidence: defaultConfidence, language: "typescript", code: "console.log('edge_case');" },
            ],
        };
    }

    // Resume support
    if (process.argv.includes('--resume')) {
        const latest = await persistence.loadLatest();
        if (latest) {
            console.log(`↩️ Ripristino checkpoint generazione ${latest.generation}`);
            // restore population into engine
            evolutionEngine.resumeFromState(latest.population.map(p => ({ id: p.id, fitness: p.fitness, age: p.age, tests: p.tests })), { generations: config.generations });
            // rebuild baseSuite from first individual's tests if present
                        if (latest.population.length > 0) {
                                const fallbackConf = emergenceThreshold(latest.population[0].tests.length);
                                baseSuite = {
                                    id: 'resume_suite',
                                    targetLanguage: 'typescript',
                                    tests: latest.population[0].tests.map(t => ({
                                        name: t.name,
                                        input: t.input,
                                        expected: (t as any).expected ?? 'valid',
                                        confidence: (t as any).confidence ?? fallbackConf,
                                        language: 'typescript',
                                        code: "console.log('resume');"
                                    }))
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
                expected: (t as any).expected ?? 'valid',
                confidence: (t as any).confidence ?? fallbackConf,
                language: 'typescript' as const,
                code: (t as any).code || ("console.log('exec','" + t.name + "')")
            }));
            const runnerSuite = { id: `evo_${gen}`, targetLanguage: 'typescript' as const, tests: mapped };
            return testRunner.runGeneratedTests(runnerSuite);
        } });

        // Raccogli risultati e genera report
        const mappedReportTests = best.testSuite.tests.map(t => ({
            name: t.name,
            input: t.input,
            expected: (t as any).expected ?? 'valid',
            confidence: t.confidence ?? emergenceThreshold(best.testSuite.tests.length),
            language: 'typescript' as const,
            code: "console.log('exec', '" + t.name + "');"
        }));
    const testResults = await testRunner.runGeneratedTests({ id: `report_gen_${gen}`, targetLanguage: 'typescript', tests: mappedReportTests });
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
