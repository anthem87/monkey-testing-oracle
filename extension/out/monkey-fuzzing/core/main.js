"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const evolution_1 = require("./evolution");
const oracle_1 = require("./oracle");
const mutation_1 = require("./mutation");
const report_1 = require("./report");
const feedback_1 = require("./feedback");
const state_1 = require("./state");
const copilot_fix_1 = require("./copilot-fix");
const mutation_pipeline_1 = require("./mutation-pipeline");
const error_classifier_1 = require("./error-classifier");
const persistence_1 = require("./persistence");
const runner_1 = require("./runner");
const coverage_engine_1 = require("./coverage-engine");
const copilot_analyzer_1 = require("./copilot-analyzer");
const sandbox_manager_1 = require("./sandbox-manager");
const test_writer_1 = require("./test-writer");
const metrics_1 = require("../metrics/metrics");
// ===========================================================
// 🧩 CONFIGURAZIONE INIZIALE
// ===========================================================
async function loadConfig(filePath) {
    const json = await promises_1.default.readFile(filePath, "utf-8");
    return JSON.parse(json);
}
async function bootstrap() {
    console.log("\n🚀 Avvio Monkey-Fuzzing-Oracle Engine\n");
    // Carica configurazione da file o fallback default
    const configPath = process.argv.includes("--config")
        ? process.argv[process.argv.indexOf("--config") + 1]
        : "./config/evolution.json";
    const config = await loadConfig(configPath).catch(() => ({
        populationSize: 20, // ✅ Popolazione ottimale per codice complesso
        mutationRate: (0, metrics_1.optimalAdaptationRate)(20) * 0.5, // ✅ Mutazioni conservative (dimezzate)
        crossoverRate: 0.4, // ✅ Crossover moderato
        generations: 10, // ✅ Più generazioni piccole
        elitismCount: 5, // ✅ Mantieni top 25%
        fitnessWeights: {
            oracleAccuracy: (0, metrics_1.emergenceThreshold)(20) * 4, // ~0.4
            testCoverage: (0, metrics_1.emergenceThreshold)(20) * 2, // ~0.2
            performance: (0, metrics_1.emergenceThreshold)(20), // ~0.1
            securityFindings: (0, metrics_1.emergenceThreshold)(20), // ~0.1
            diversity: (0, metrics_1.emergenceThreshold)(20) * 2, // ~0.2
        },
    }));
    console.log("⚙️ Configurazione caricata:", config);
    // ===========================================================
    // 🔧 INIZIALIZZA MODULI CORE
    // ===========================================================
    const mutationRegistry = new mutation_1.MutationRegistry();
    const oracleManager = new oracle_1.OracleManager();
    const reportEngine = new report_1.ReportEngine("./reports");
    const evolutionEngine = new evolution_1.EvolutionEngine(config);
    const feedbackEngine = new feedback_1.FeedbackEngine(oracleManager, mutationRegistry, config);
    const testRunner = new runner_1.TestRunner(); // modulo esecutivo, da implementare o mockare
    const errorClassifier = new error_classifier_1.ErrorClassifier(); // standalone for aggregation (runner has internal one)
    const copilotFix = new copilot_fix_1.CopilotFixEngine(); // adapter potrà essere iniettato
    const mutationPipeline = new mutation_pipeline_1.MutationPipeline(copilotFix);
    const persistence = new persistence_1.PersistenceManager('./checkpoints');
    const coverageEngine = new coverage_engine_1.RealCoverageEngine(process.cwd());
    // Imposta descrittori operatori formali
    const stateTracker = new state_1.StateTracker(oracleManager, {
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
    let baseSuite;
    let targetLanguage = 'typescript';
    // Support --target-file for Copilot-based analysis
    if (process.argv.includes('--target-file')) {
        const targetFileArg = process.argv[process.argv.indexOf('--target-file') + 1];
        const projectRoot = process.argv.includes('--project-root')
            ? process.argv[process.argv.indexOf('--project-root') + 1]
            : path_1.default.resolve('..');
        console.log(`🔍 Analyzing target file: ${targetFileArg}`);
        const analyzer = new copilot_analyzer_1.CopilotAnalyzer(new copilot_analyzer_1.StubCopilotAPI()); // replace with real Copilot
        const sandboxMgr = new sandbox_manager_1.SandboxManager();
        const testWriter = new test_writer_1.TestWriter();
        const sandboxInfo = await sandboxMgr.setup(projectRoot, targetFileArg);
        const analysis = await analyzer.analyzeFile(projectRoot, targetFileArg);
        const initialTests = await analyzer.generateInitialTests(analysis);
        await testWriter.writeTests(sandboxInfo.testsPath, initialTests, analysis.language);
        targetLanguage = analysis.language || 'typescript';
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
    }
    else {
        // Fallback: hardcoded stub suite with formal confidence
        const defaultConfidence = 1.0 - (0, metrics_1.emergenceThreshold)(2); // ~0.9 for 2 tests
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
                const fallbackConf = (0, metrics_1.emergenceThreshold)(latest.population[0].tests.length);
                baseSuite = {
                    id: 'resume_suite',
                    targetLanguage: 'typescript',
                    tests: latest.population[0].tests.map(t => ({
                        name: t.name,
                        input: t.input,
                        expected: t.expected ?? 'valid',
                        confidence: t.confidence ?? fallbackConf,
                        language: 'typescript',
                        code: "console.log('resume');"
                    }))
                };
            }
        }
        else {
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
                const fallbackConf = (0, metrics_1.emergenceThreshold)(suite.tests.length);
                const mapped = suite.tests.map(t => ({
                    name: t.name,
                    input: t.input,
                    expected: t.expected ?? 'valid',
                    confidence: t.confidence ?? fallbackConf,
                    language: 'typescript',
                    code: t.code || ("console.log('exec','" + t.name + "')")
                }));
                const runnerSuite = { id: `evo_${gen}`, targetLanguage: 'typescript', tests: mapped };
                return testRunner.runGeneratedTests(runnerSuite);
            } });
        // Raccogli risultati e genera report
        const mappedReportTests = best.testSuite.tests.map(t => ({
            name: t.name,
            input: t.input,
            expected: t.expected ?? 'valid',
            confidence: t.confidence ?? (0, metrics_1.emergenceThreshold)(best.testSuite.tests.length),
            language: 'typescript',
            code: "console.log('exec', '" + t.name + "');"
        }));
        const testResults = await testRunner.runGeneratedTests({ id: `report_gen_${gen}`, targetLanguage: 'typescript', tests: mappedReportTests });
        // Real coverage instrumentation
        const coverageData = await coverageEngine.instrumentCode(mappedReportTests.map(t => t.name));
        // inject coverage metrics into state meta for snapshot
        evolutionEngine.stateMeta.coverageSemantic = coverageData.semanticCoverage;
        evolutionEngine.stateMeta.coverageStructural = coverageData.structuralCoverage;
        evolutionEngine.stateMeta.coverageTotal = coverageData.totalCoverage;
        const report = await reportEngine.generateGenerationReport(gen, evolutionEngine["population"], testResults);
        // salva checkpoint
        const lastSnapshot = evolutionEngine.stateTracker?.getHistory()?.slice(-1)[0];
        if (lastSnapshot) {
            const file = await persistence.saveCheckpoint(gen, evolutionEngine["population"], oracleManager, lastSnapshot);
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
            const repaired = await mutationPipeline.processErrors(baseSuite.tests, errors, gen);
            baseSuite.tests = repaired;
            // propagate repairs into population
            evolutionEngine.applyRepairs(repaired);
        }
        // Reset runner errors for next generation accumulation
        testRunner.resetErrors();
        // Analizza feedback e aggiorna parametri
        const feedback = feedbackEngine.analyzeReport(report);
        feedbackEngine.printDiagnostics();
        // Aggiorna configurazione evolutiva + resize popolazione
        currentConfig = feedback.newConfig;
        evolutionEngine.setConfig(currentConfig);
        if (currentConfig.populationSize !== evolutionEngine.population.length) {
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
//# sourceMappingURL=main.js.map