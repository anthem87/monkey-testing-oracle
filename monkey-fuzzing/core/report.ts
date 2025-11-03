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

import fs from "fs/promises";
import path from "path";
import {
    shannonEntropy,
    listVariance,
    structuralComplexity,
    systemMaturity,
    qualityMetric,
    adaptiveConvergenceThreshold,
    bayesianConfidence,
    emergenceThreshold,
    shannonEntropyNormalized,
    coverageCombine,
} from "../metrics/metrics";

import type { TestExecutionResult } from "./evolution"; // reuse local interface shape
import type { EvolutionIndividual } from "./evolution";

export interface TestExecutionSummary {
    totalTests: number;
    passed: number;
    failed: number;
    oracleAccuracy: number;
    entropy: number;
    variance: number;
    avgExecutionTime: number;
    slowestTest?: string;
    discoveredPatterns: number;
    performanceIndex: number;
    complexity: number;
    qualityIndex: number;
    maturityIndex: number;
    convergenceThreshold: number;
    semanticCoverage: number;
    structuralCoverage: number;
    totalCoverage: number;
}

export interface EvolutionReport {
    generation: number;
    timestamp: string;
    summary: TestExecutionSummary;
    topIndividuals: {
        id: string;
        fitness: number;
    }[];
    recommendations: string[];
    trend?: EvolutionTrend;
}

export interface EvolutionTrend {
    avgFitness: number;
    avgAccuracy: number;
    entropyTrend: number;
    maturityTrend: number;
    convergenceScore: number;
    emergenceProbability: number;
}

export class ReportEngine {
    private evolutionHistory: EvolutionReport[] = [];
    private baseDir: string;

    constructor(baseDir: string = "./reports") {
        this.baseDir = baseDir;
    }

    // ===========================================================
    // 🔹 REPORT DI UNA GENERAZIONE
    // ===========================================================
    async generateGenerationReport(
        generation: number,
        population: EvolutionIndividual[],
        testResults: TestExecutionResult[]
    ): Promise<EvolutionReport> {
        const timestamp = new Date().toISOString();

        const total = testResults.length;
        const passed = testResults.filter((r) => r.passed).length;
        const failed = total - passed;
        const oracleAccuracy = passed / Math.max(1, total);

        const executionTimes = testResults.map((r) => r.executionTime ?? 0);
        const avgExecutionTime =
            executionTimes.reduce((a, b) => a + b, 0) / Math.max(1, executionTimes.length);
        const slowest = testResults.reduce(
            (max, r) => (r.executionTime > (max.executionTime ?? 0) ? r : max),
            { testName: "none", executionTime: 0 }
        );

        const fitnessValues = population.map((i) => i.fitness);
        const entropy = shannonEntropy(fitnessValues);
        const variance = listVariance(fitnessValues);

    const complexity = structuralComplexity(population.length, 1);
    const maturityIndex = systemMaturity(fitnessValues);
    const convergenceThreshold = adaptiveConvergenceThreshold(fitnessValues);
    const qualityIndex = qualityMetric(entropy, variance, complexity);

        const performanceIndex = 1.0 / (1.0 + avgExecutionTime / 1000);
        const discoveredPatterns = new Set(testResults.map((r) => r.error)).size;

        // ---------------------------------------------------
        // Coverage Metrics (semantic + structural)
        // semanticCoverage: proxy using normalized entropy of test names length distribution
        const testNameLengths = testResults.map(tr => tr.testName.length || 1);
        const semanticCoverage = shannonEntropyNormalized(testNameLengths); // placeholder for X-space sampling
        // structuralCoverage: proxy using diversity of errors (hit distinct patterns) and passed ratio
        const structuralCoverage = discoveredPatterns > 0 ? Math.min(1, (passed + discoveredPatterns) / Math.max(1, total)) : passed / Math.max(1, total);
        // Use coverageCombine with default beta=0.5
        const totalCoverage = coverageCombine(semanticCoverage, structuralCoverage);

        const summary: TestExecutionSummary = {
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

        const report: EvolutionReport = {
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
    private calculateTrend(population: EvolutionIndividual[]): EvolutionTrend {
        const fitnessValues = population.map((i) => i.fitness);
        const avgFitness =
            fitnessValues.reduce((a, b) => a + b, 0) / Math.max(1, fitnessValues.length);
        const avgAccuracy = avgFitness;
    const entropyTrend = shannonEntropy(fitnessValues);
    const maturityTrend = systemMaturity(fitnessValues);
    const convergenceScore = adaptiveConvergenceThreshold(fitnessValues);
    const emergenceProbability = 1 - emergenceThreshold(population.length);

        return {
            avgFitness,
            avgAccuracy,
            entropyTrend,
            maturityTrend,
            convergenceScore,
            emergenceProbability,
        };
    }

    private generateRecommendations(summary: TestExecutionSummary): string[] {
        const rec: string[] = [];

        // Use formal thresholds from metrics
        const popSize = summary.totalTests;
        const accuracyThreshold = 1 - emergenceThreshold(popSize);
        const entropyThreshold = emergenceThreshold(popSize);
        const varianceThreshold = adaptiveConvergenceThreshold([summary.variance]);
        const maturityThreshold = emergenceThreshold(popSize) * 6;
        const qualityHighThreshold = 1 - emergenceThreshold(popSize);
        const performanceThreshold = emergenceThreshold(popSize) * 5;

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

        if (rec.length === 0) rec.push("✅ Tutto stabile e coerente con le metriche formali.");

        return rec;
    }

    // ===========================================================
    // 💾 PERSISTENZA E REPORTING
    // ===========================================================
    private async saveReport(report: EvolutionReport): Promise<void> {
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            const filename = `evolution-gen-${report.generation}.json`;
            const filepath = path.join(this.baseDir, filename);
            await fs.writeFile(filepath, JSON.stringify(report, null, 2));
            console.log(`📊 Report salvato: ${filepath}`);
        } catch (err) {
            console.error("Errore nel salvataggio del report:", err);
        }
    }

    async generateFinalTrendReport(): Promise<void> {
        if (this.evolutionHistory.length < 2) return;

        const fitnessTrends = this.evolutionHistory.map((r) => r.summary.qualityIndex);
        const accTrends = this.evolutionHistory.map((r) => r.summary.oracleAccuracy);

        const avgFitness = fitnessTrends.reduce((a, b) => a + b, 0) / fitnessTrends.length;
        const avgAcc = accTrends.reduce((a, b) => a + b, 0) / accTrends.length;

    const [lowAcc, highAcc] = bayesianConfidence(accTrends);
    const [lowQ, highQ] = bayesianConfidence(fitnessTrends);

        const finalTrend = {
            avgFitness,
            avgAcc,
            bayesianAccuracy95: [lowAcc, highAcc],
            bayesianQuality95: [lowQ, highQ],
            totalGenerations: this.evolutionHistory.length,
        };

        const trendFile = path.join(this.baseDir, "trend-summary.json");
        await fs.writeFile(trendFile, JSON.stringify(finalTrend, null, 2));
        console.log("📈 Trend evolutivo finale salvato:", trendFile);
    }
}
