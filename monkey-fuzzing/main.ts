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
import { GeneratedTestSuite, TestRunner } from "./runner"; // potrai implementarlo o mockarlo
import { EvolutionaryConfig } from "./evolution";

// ===========================================================
// 🧩 CONFIGURAZIONE INIZIALE
// ===========================================================
async function loadConfig(filePath: string): Promise<EvolutionaryConfig> {
    const json = await fs.readFile(filePath, "utf-8");
    return JSON.parse(json);
}

async function bootstrap(): Promise<void> {
    console.log("\n🚀 Avvio Monkey-Fuzzing-Oracle Engine\n");

    // Carica configurazione da file o fallback default
    const configPath = process.argv.includes("--config")
        ? process.argv[process.argv.indexOf("--config") + 1]
        : "./config/evolution.json";

    const config: EvolutionaryConfig = await loadConfig(configPath).catch(() => ({
        populationSize: 10,
        mutationRate: 0.2,
        crossoverRate: 0.7,
        generations: 5,
        elitismCount: 2,
        fitnessWeights: {
            oracleAccuracy: 0.4,
            testCoverage: 0.2,
            performance: 0.1,
            securityFindings: 0.1,
            diversity: 0.2,
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

    // ===========================================================
    // 🧪 SETUP INIZIALE DEL TEST SUITE
    // ===========================================================
    const baseSuite: GeneratedTestSuite = {
        id: "suite_base",
        tests: [
            { name: "simple_case", input: "test", expected: "valid", confidence: 1.0 },
            { name: "edge_case", input: "", expected: "invalid", confidence: 0.9 },
        ],
    };

    console.log("🧩 Base suite inizializzata con", baseSuite.tests.length, "test");

    // ===========================================================
    // 🔁 LOOP EVOLUTIVO PRINCIPALE
    // ===========================================================
    let currentConfig = config;
    const generations = currentConfig.generations;

    for (let gen = 1; gen <= generations; gen++) {
        console.log(`\n🌱 Generazione ${gen}/${generations}\n`);

        // Esegui evoluzione
        const best = await evolutionEngine.evolve(baseSuite, oracleManager, testRunner);

        // Raccogli risultati e genera report
        const testResults = await testRunner.collectResults(best.testSuite);
        const report = await reportEngine.generateGenerationReport(gen, evolutionEngine["population"], testResults);

        // Analizza feedback e aggiorna parametri
        const feedback = feedbackEngine.analyzeReport(report);
        feedbackEngine.printDiagnostics();

        // Aggiorna configurazione evolutiva
        currentConfig = feedback.newConfig;

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
