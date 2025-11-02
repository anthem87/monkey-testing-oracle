/**
 * ===========================================================
 * FEEDBACK.TS
 * ===========================================================
 * Feedback Engine - adattamento dinamico e apprendimento
 * - Analizza i report evolutivi
 * - Aggiorna parametri dell’evoluzione e dell’oracolo
 * - Ribilancia le strategie di mutazione
 * - Implementa il ciclo di retroazione ℱ ↔ 𝒢
 * ===========================================================
 */

import {
    system_maturity,
    adaptive_convergence_threshold,
    adaptive_population_size,
    optimal_adaptation_rate,
    optimal_exploration_factors,
    optimal_learning_rate,
    quality_metric,
    list_variance,
    shannon_entropy,
} from "./metrics/metrics";

import type { EvolutionReport } from "./report";
import type { OracleManager } from "./oracle";
import type { EvolutionaryConfig } from "./evolution";
import type { MutationRegistry } from "./mutation";

export interface FeedbackUpdate {
    newConfig: EvolutionaryConfig;
    newMutationWeights: Record<string, number>;
    oracleAdjusted: boolean;
    insights: string[];
}

export class FeedbackEngine {
    private maturityHistory: number[] = [];
    private entropyHistory: number[] = [];
    private stabilityHistory: number[] = [];

    constructor(
        private oracle: OracleManager,
        private mutationRegistry: MutationRegistry,
        private config: EvolutionaryConfig
    ) { }

    // ===========================================================
    // 🔍 Analisi del Report Evolutivo
    // ===========================================================
    analyzeReport(report: EvolutionReport): FeedbackUpdate {
        const summary = report.summary;

        const maturity = summary.maturityIndex;
        const entropy = summary.entropy;
        const variance = summary.variance;
        const quality = summary.qualityIndex;
        const accuracy = summary.oracleAccuracy;

        this.maturityHistory.push(maturity);
        this.entropyHistory.push(entropy);
        this.stabilityHistory.push(1 - variance);

        const convergence = adaptive_convergence_threshold(this.maturityHistory);
        const adaptationRate = optimal_adaptation_rate(this.maturityHistory.length + 1);
        const explorationTemp = 1 - maturity; // meno maturo → più esplorazione
        const [shrink, expand] = optimal_exploration_factors(explorationTemp);

        const insights: string[] = [];

        // ===========================================================
        // 🧬 Aggiornamento Config Evolutiva
        // ===========================================================
        const newConfig: EvolutionaryConfig = { ...this.config };

        // Popolazione adattiva in base alla stabilità
        const newPop = adaptive_population_size(
            this.config.populationSize,
            Math.sqrt(variance + 1e-6)
        );
        if (newPop !== this.config.populationSize) {
            newConfig.populationSize = newPop;
            insights.push(`👥 Adattata popolazione → ${newPop}`);
        }

        // Mutazione dinamica (più alta se maturità bassa)
        const baseMut = this.config.mutationRate;
        newConfig.mutationRate = Math.max(
            0.05,
            Math.min(0.6, baseMut * expand * (1 - maturity + 0.5))
        );

        // Crossover dinamico
        const baseCross = this.config.crossoverRate;
        newConfig.crossoverRate = Math.max(
            0.3,
            Math.min(0.95, baseCross * shrink + adaptationRate)
        );

        // Elitismo: aumenta se sistema stabile
        newConfig.elitismCount = Math.max(1, Math.floor(5 * maturity + 1));

        // ===========================================================
        // 🧠 Ricalibrazione Oracolo
        // ===========================================================
        let oracleAdjusted = false;

        if (accuracy < 0.7 || entropy > 1.5) {
            this.oracle.adaptParameters();
            oracleAdjusted = true;
            insights.push("🧠 Oracolo riadattato (bassa accuratezza o alta entropia).");
        }

        // ===========================================================
        // 🔀 Ribilanciamento Mutation Strategies
        // ===========================================================
        const newWeights = this.adjustMutationWeights(
            entropy,
            variance,
            quality,
            maturity
        );

        insights.push(
            `⚙️ Mutation Weights aggiornati: ${Object.entries(newWeights)
                .map(([k, v]) => `${k}=${v.toFixed(2)}`)
                .join(", ")}`
        );

        // ===========================================================
        // 🎯 Sintesi
        // ===========================================================
        const qualityNow = quality_metric(entropy, variance, summary.complexity);
        insights.push(
            `🎯 Quality metric = ${qualityNow.toFixed(3)} | Maturity = ${maturity.toFixed(
                3
            )} | Convergence = ${convergence.toFixed(3)}`
        );

        this.config = newConfig;

        return {
            newConfig,
            newMutationWeights: newWeights,
            oracleAdjusted,
            insights,
        };
    }

    // ===========================================================
    // 🧩 Adattamento Ponderato delle Strategie di Mutazione
    // ===========================================================
    private adjustMutationWeights(
        entropy: number,
        variance: number,
        quality: number,
        maturity: number
    ): Record<string, number> {
        const weights = this.mutationRegistry.getWeights();
        const adjusted: Record<string, number> = {};

        const learningRate = optimal_learning_rate(
            Math.sqrt(variance + 1e-6),
            this.maturityHistory.length
        );

        for (const [strategy, w] of Object.entries(weights)) {
            // Se sistema immaturo → aumenta diversità
            let delta = 0;
            if (maturity < 0.5) delta += (1 - maturity) * 0.1;
            if (entropy < 0.5) delta += 0.05;
            if (variance > 0.2) delta -= 0.05;
            if (quality < 0.4) delta += 0.05;

            const newW = w + learningRate * delta;
            adjusted[strategy] = Math.max(0.01, Math.min(1, newW));
        }

        // Rinormalizza (somma = 1)
        const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
        for (const key in adjusted) adjusted[key] /= total;

        this.mutationRegistry.updateWeights(adjusted);
        return adjusted;
    }

    // ===========================================================
    // 📊 Diagnostica
    // ===========================================================
    printDiagnostics(): void {
        const maturity = system_maturity(this.maturityHistory);
        const entropy = shannon_entropy(this.entropyHistory);
        const variance = list_variance(this.stabilityHistory);

        console.log(`
    ================================
    🩺 FEEDBACK DIAGNOSTICS
    ================================
    🔹 Maturity:     ${maturity.toFixed(3)}
    🔹 Entropy:      ${entropy.toFixed(3)}
    🔹 Variance:     ${variance.toFixed(3)}
    🔹 History Len:  ${this.maturityHistory.length}
    ================================
    `);
    }
}
