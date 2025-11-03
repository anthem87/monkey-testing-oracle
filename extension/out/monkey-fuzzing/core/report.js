"use strict";
/**
 * ===========================================================
 * REPORT.TS
 * ===========================================================
 * Report Engine - sistema analitico e di memoria
 * - Genera report di ogni generazione
 * - Calcola metriche formali (entropia, varianza, qualità, maturità)
 * - Produce trend evolutivi e indicatori di convergenza
 * ===========================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReportEngine = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const metrics_1 = require("../metrics/metrics");
class ReportEngine {
    constructor(baseDir = "./reports") {
        this.evolutionHistory = [];
        this.baseDir = baseDir;
    }
    // ===========================================================
    // 🔹 REPORT DI UNA GENERAZIONE
    // ===========================================================
    async generateGenerationReport(generation, population, testResults) {
        const timestamp = new Date().toISOString();
        const total = testResults.length;
        const passed = testResults.filter((r) => r.passed).length;
        const failed = total - passed;
        const oracleAccuracy = passed / Math.max(1, total);
        const executionTimes = testResults.map((r) => r.executionTime ?? 0);
        const avgExecutionTime = executionTimes.reduce((a, b) => a + b, 0) / Math.max(1, executionTimes.length);
        const slowest = testResults.reduce((max, r) => (r.executionTime > (max.executionTime ?? 0) ? r : max), { testName: "none", executionTime: 0 });
        const fitnessValues = population.map((i) => i.fitness);
        const entropy = (0, metrics_1.shannonEntropy)(fitnessValues);
        const variance = (0, metrics_1.listVariance)(fitnessValues);
        const complexity = (0, metrics_1.structuralComplexity)(population.length, 1);
        const maturityIndex = (0, metrics_1.systemMaturity)(fitnessValues);
        const convergenceThreshold = (0, metrics_1.adaptiveConvergenceThreshold)(fitnessValues);
        const qualityIndex = (0, metrics_1.qualityMetric)(entropy, variance, complexity);
        const performanceIndex = 1.0 / (1.0 + avgExecutionTime / 1000);
        const discoveredPatterns = new Set(testResults.map((r) => r.error)).size;
        // ---------------------------------------------------
        // Coverage Metrics (semantic + structural)
        // semanticCoverage: proxy using normalized entropy of test names length distribution
        const testNameLengths = testResults.map(tr => tr.testName.length || 1);
        const semanticCoverage = (0, metrics_1.shannonEntropyNormalized)(testNameLengths); // placeholder for X-space sampling
        // structuralCoverage: proxy using diversity of errors (hit distinct patterns) and passed ratio
        const structuralCoverage = discoveredPatterns > 0 ? Math.min(1, (passed + discoveredPatterns) / Math.max(1, total)) : passed / Math.max(1, total);
        // Use coverageCombine with default beta=0.5
        const totalCoverage = (0, metrics_1.coverageCombine)(semanticCoverage, structuralCoverage);
        const summary = {
            totalTests: total,
            passed,
            failed,
            oracleAccuracy,
            entropy,
            variance,
            avgExecutionTime,
            slowestTest: slowest.testName,
            discoveredPatterns,
            performanceIndex,
            complexity,
            qualityIndex,
            maturityIndex,
            convergenceThreshold,
            semanticCoverage,
            structuralCoverage,
            totalCoverage,
        };
        const topIndividuals = population
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, 3)
            .map((ind) => ({ id: ind.id, fitness: ind.fitness }));
        const recommendations = this.generateRecommendations(summary);
        const trend = this.calculateTrend(population);
        const report = {
            generation,
            timestamp,
            summary,
            topIndividuals,
            recommendations,
            trend,
        };
        this.evolutionHistory.push(report);
        await this.saveReport(report);
        return report;
    }
    // ===========================================================
    // 📈 TREND E RACCOMANDAZIONI
    // ===========================================================
    calculateTrend(population) {
        const fitnessValues = population.map((i) => i.fitness);
        const avgFitness = fitnessValues.reduce((a, b) => a + b, 0) / Math.max(1, fitnessValues.length);
        const avgAccuracy = avgFitness;
        const entropyTrend = (0, metrics_1.shannonEntropy)(fitnessValues);
        const maturityTrend = (0, metrics_1.systemMaturity)(fitnessValues);
        const convergenceScore = (0, metrics_1.adaptiveConvergenceThreshold)(fitnessValues);
        const emergenceProbability = 1 - (0, metrics_1.emergenceThreshold)(population.length);
        return {
            avgFitness,
            avgAccuracy,
            entropyTrend,
            maturityTrend,
            convergenceScore,
            emergenceProbability,
        };
    }
    generateRecommendations(summary) {
        const rec = [];
        // Use formal thresholds from metrics
        const popSize = summary.totalTests;
        const accuracyThreshold = 1 - (0, metrics_1.emergenceThreshold)(popSize);
        const entropyThreshold = (0, metrics_1.emergenceThreshold)(popSize);
        const varianceThreshold = (0, metrics_1.adaptiveConvergenceThreshold)([summary.variance]);
        const maturityThreshold = (0, metrics_1.emergenceThreshold)(popSize) * 6;
        const qualityHighThreshold = 1 - (0, metrics_1.emergenceThreshold)(popSize);
        const performanceThreshold = (0, metrics_1.emergenceThreshold)(popSize) * 5;
        if (summary.oracleAccuracy < accuracyThreshold)
            rec.push("🔴 Accuracy bassa — ricalibrare l'oracolo o aumentare il training data.");
        if (summary.entropy < entropyThreshold)
            rec.push("🧊 Entropia bassa — aggiungere più diversità nelle mutazioni.");
        if (summary.variance > varianceThreshold)
            rec.push("⚖️ Fitness instabile — controllare le strategie evolutive.");
        if (summary.maturityIndex < maturityThreshold)
            rec.push("🧠 Sistema non maturo — proseguire l'evoluzione per maggiore stabilità.");
        if (summary.qualityIndex > qualityHighThreshold)
            rec.push("🏆 Alta qualità strutturale — salvare configurazione come baseline.");
        if (summary.performanceIndex < performanceThreshold)
            rec.push("🐢 Performance scarsa — ottimizzare test lenti o eliminare ridondanze.");
        if (rec.length === 0)
            rec.push("✅ Tutto stabile e coerente con le metriche formali.");
        return rec;
    }
    // ===========================================================
    // 💾 PERSISTENZA E REPORTING
    // ===========================================================
    async saveReport(report) {
        try {
            await promises_1.default.mkdir(this.baseDir, { recursive: true });
            const filename = `evolution-gen-${report.generation}.json`;
            const filepath = path_1.default.join(this.baseDir, filename);
            await promises_1.default.writeFile(filepath, JSON.stringify(report, null, 2));
            console.log(`📊 Report salvato: ${filepath}`);
        }
        catch (err) {
            console.error("Errore nel salvataggio del report:", err);
        }
    }
    async generateFinalTrendReport() {
        if (this.evolutionHistory.length < 2)
            return;
        const fitnessTrends = this.evolutionHistory.map((r) => r.summary.qualityIndex);
        const accTrends = this.evolutionHistory.map((r) => r.summary.oracleAccuracy);
        const avgFitness = fitnessTrends.reduce((a, b) => a + b, 0) / fitnessTrends.length;
        const avgAcc = accTrends.reduce((a, b) => a + b, 0) / accTrends.length;
        const [lowAcc, highAcc] = (0, metrics_1.bayesianConfidence)(accTrends);
        const [lowQ, highQ] = (0, metrics_1.bayesianConfidence)(fitnessTrends);
        const finalTrend = {
            avgFitness,
            avgAcc,
            bayesianAccuracy95: [lowAcc, highAcc],
            bayesianQuality95: [lowQ, highQ],
            totalGenerations: this.evolutionHistory.length,
        };
        const trendFile = path_1.default.join(this.baseDir, "trend-summary.json");
        await promises_1.default.writeFile(trendFile, JSON.stringify(finalTrend, null, 2));
        console.log("📈 Trend evolutivo finale salvato:", trendFile);
    }
}
exports.ReportEngine = ReportEngine;
//# sourceMappingURL=report.js.map