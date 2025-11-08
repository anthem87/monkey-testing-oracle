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
const runner_js_1 = require("./runner.js");
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
    const testRunner = new runner_js_1.TestRunner(); // modulo esecutivo, da implementare o mockare
    // Initialize build tool adapter if project root is provided or can be detected
    let projectRootArg = process.argv.includes('--project')
        ? process.argv[process.argv.indexOf('--project') + 1]
        : process.argv.includes('--project-root')
            ? process.argv[process.argv.indexOf('--project-root') + 1]
            : null;
    // If not provided, try to auto-detect from sandbox
    let detectedLanguage = 'typescript';
    // Auto-detect language from sandbox if provided
    if (process.argv.includes('--sandbox')) {
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        const workspaceRoot = path_1.default.resolve('..');
        const sandboxPath = path_1.default.join(workspaceRoot, '.sandboxes', sandboxId);
        const testsPath = path_1.default.join(sandboxPath, 'tests');
        try {
            const files = await promises_1.default.readdir(testsPath);
            if (files.some(f => f.endsWith('.java'))) {
                detectedLanguage = 'java';
                console.log(`🔍 Detected language: Java`);
            }
            else if (files.some(f => f.endsWith('.py'))) {
                detectedLanguage = 'python';
                console.log(`🔍 Detected language: Python`);
            }
            else if (files.some(f => f.endsWith('.rs'))) {
                detectedLanguage = 'rust';
                console.log(`🔍 Detected language: Rust`);
            }
            else {
                console.log(`🔍 Detected language: TypeScript (default)`);
            }
        }
        catch (err) {
            console.log(`⚠️ Could not detect language from sandbox, using default: TypeScript`);
        }
    }
    if (!projectRootArg && process.argv.includes('--sandbox')) {
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        // Sandbox is in workspace root, not in monkey-fuzzing folder
        const workspaceRoot = path_1.default.resolve('..');
        const sandboxPath = path_1.default.join(workspaceRoot, '.sandboxes', sandboxId);
        console.log(`🔍 Auto-detecting project root from sandbox: ${sandboxPath}`);
        const sandboxMgr = new sandbox_manager_1.SandboxManager();
        projectRootArg = await sandboxMgr.detectProjectRoot(sandboxPath);
        if (projectRootArg) {
            console.log(`✅ Detected project root: ${projectRootArg}`);
        }
        else {
            console.log(`⚠️ Could not auto-detect project root from sandbox`);
        }
    }
    if (projectRootArg) {
        console.log(`🔧 Initializing build tool for project: ${projectRootArg}`);
        await testRunner.initializeBuildTool(projectRootArg);
    }
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
        // Analyze target file
        const analysis = await analyzer.analyzeFile(targetFileArg);
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
                code: t.code,
                metadata: {
                    targetFile: analysis.sourceFile,
                    language: targetLanguage,
                    origin: 'copilot-initial',
                    generation: 0,
                    confidence: 1.0
                }
            }))
        };
        console.log(`✅ Generated ${initialTests.length} initial test(s) from Copilot analysis.`);
    }
    else if (process.argv.includes('--sandbox')) {
        // Load tests from existing sandbox
        const sandboxId = process.argv[process.argv.indexOf('--sandbox') + 1];
        const workspaceRoot = path_1.default.resolve('..');
        const sandboxPath = path_1.default.join(workspaceRoot, '.sandboxes', sandboxId);
        const testsPath = path_1.default.join(sandboxPath, 'tests');
        console.log(`📂 Loading tests from sandbox: ${testsPath}`);
        try {
            const testFiles = await promises_1.default.readdir(testsPath);
            const javaTests = testFiles.filter(f => f.endsWith('.java') && !f.startsWith('.'));
            const tests = [];
            for (const file of javaTests) {
                const code = await promises_1.default.readFile(path_1.default.join(testsPath, file), 'utf-8');
                const name = path_1.default.basename(file, '.java');
                tests.push({
                    name,
                    code, // ✅ Include full code
                    input: 'test',
                    expected: 'valid',
                    confidence: 1.0,
                    language: detectedLanguage,
                    metadata: {
                        targetFile: projectRootArg || '',
                        language: detectedLanguage,
                        origin: 'copilot-initial',
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
        }
        catch (error) {
            console.error(`❌ Failed to load tests from sandbox:`, error);
            // Fall through to fallback
            const defaultConfidence = 1.0 - (0, metrics_1.emergenceThreshold)(2);
            baseSuite = {
                id: 'base_suite',
                targetLanguage: detectedLanguage,
                tests: [
                    {
                        name: "simple_case", input: "test", expected: "valid", code: "console.log('simple_case');",
                        metadata: { targetFile: '', language: detectedLanguage, origin: 'copilot-initial', generation: 0, confidence: 1.0 }
                    },
                    {
                        name: "edge_case", input: "", expected: "invalid", code: "console.log('edge_case');",
                        metadata: { targetFile: '', language: detectedLanguage, origin: 'copilot-initial', generation: 0, confidence: defaultConfidence }
                    },
                ],
            };
        }
    }
    else {
        // Fallback: hardcoded stub suite with formal confidence
        const defaultConfidence = 1.0 - (0, metrics_1.emergenceThreshold)(2); // ~0.9 for 2 tests
        baseSuite = {
            id: 'base_suite',
            targetLanguage: detectedLanguage, // Use auto-detected language
            tests: [
                {
                    name: "simple_case", input: "test", expected: "valid", code: "console.log('simple_case');",
                    metadata: { targetFile: '', language: 'typescript', origin: 'copilot-initial', generation: 0, confidence: 1.0 }
                },
                {
                    name: "edge_case", input: "", expected: "invalid", code: "console.log('edge_case');",
                    metadata: { targetFile: '', language: 'typescript', origin: 'copilot-initial', generation: 0, confidence: defaultConfidence }
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
                tests: p.tests.map((t) => ({
                    name: t.name,
                    input: t.input || 'default',
                    expected: t.expected || 'valid',
                    code: t.code || "console.log('resume');",
                    metadata: {
                        targetFile: t.metadata?.targetFile || '',
                        language: t.metadata?.language || 'typescript',
                        origin: (t.metadata?.origin || 'mutated'),
                        generation: t.metadata?.generation || latest.generation,
                        confidence: t.metadata?.confidence || t.confidence || (0, metrics_1.emergenceThreshold)(p.tests.length)
                    }
                }))
            }));
            evolutionEngine.resumeFromState(restoredPopulation, { generations: config.generations });
            // rebuild baseSuite from first individual's tests if present
            if (latest.population.length > 0) {
                baseSuite = {
                    id: 'resume_suite',
                    targetLanguage: latest.population[0].tests[0]?.metadata?.language || 'typescript',
                    tests: restoredPopulation[0].tests
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
                    expected: t.expected,
                    code: t.code || ("console.log('exec','" + t.name + "')"),
                    metadata: {
                        targetFile: t.metadata?.targetFile || '',
                        language: detectedLanguage,
                        origin: t.metadata?.origin || 'mutated',
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
                origin: t.metadata?.origin || 'mutated',
                generation: gen,
                confidence: t.metadata?.confidence || (0, metrics_1.emergenceThreshold)(best.testSuite.tests.length)
            }
        }));
        const testResults = await testRunner.runGeneratedTests({ id: `report_gen_${gen}`, targetLanguage: detectedLanguage, tests: mappedReportTests });
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