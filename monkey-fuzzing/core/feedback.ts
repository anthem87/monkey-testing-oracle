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
    systemMaturity,
    adaptiveConvergenceThreshold,
    adaptivePopulationSize,
    optimalAdaptationRate,
    optimalExplorationFactors,
    optimalLearningRate,
    qualityMetric,
    listVariance,
    shannonEntropy,
    emergenceThreshold,
} from "../metrics/metrics";

import type { EvolutionReport } from "./report.ts";
import type { OracleManager } from "./oracle.ts";
import type { EvolutionConfig } from "./evolution.ts";
import type { MutationRegistry } from "./mutation.ts";

export interface FeedbackUpdate {
    newConfig: EvolutionConfig;
    newMutationWeights: Record<string, number>;
    oracleAdjusted: boolean;
    insights: string[];
}

// 🚨 POPULATION CAP: evita esplosione computazionale
const MIN_POPULATION = 10;
const MAX_POPULATION = 30;  // ✅ Limite ragionevole per codice complesso

export class FeedbackEngine {
    private maturityHistory: number[] = [];
    private entropyHistory: number[] = [];
    private stabilityHistory: number[] = [];

    constructor(
        private oracle: OracleManager,
        private mutationRegistry: MutationRegistry,
    private config: EvolutionConfig
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

    const convergence = adaptiveConvergenceThreshold(this.maturityHistory);
    const adaptationRate = optimalAdaptationRate(this.maturityHistory.length + 1);
        const explorationTemp = 1 - maturity; // meno maturo → più esplorazione
    const [shrink, expand] = optimalExplorationFactors(explorationTemp);

        const insights: string[] = [];

        // ===========================================================
        // 🧬 Aggiornamento Config Evolutiva
        // ===========================================================
    const newConfig: EvolutionConfig = { ...this.config };

        // Popolazione adattiva in base alla stabilità CON CAP
        const newPop = adaptivePopulationSize(
            this.config.populationSize,
            Math.sqrt(variance + 1e-6)
        );
        // 🚨 CRITICAL: Applica population cap per evitare esplosione computazionale
        const safePop = Math.min(MAX_POPULATION, Math.max(MIN_POPULATION, newPop));
        
        if (safePop !== this.config.populationSize) {
            newConfig.populationSize = safePop;
            if (newPop > MAX_POPULATION) {
                insights.push(`⚠️ Popolazione cappata da ${newPop} a ${MAX_POPULATION} (limite sicurezza)`);
            } else {
                insights.push(`👥 Adattata popolazione → ${safePop}`);
            }
        }

        // Mutazione dinamica (più alta se maturità bassa)
        const baseMut = this.config.mutationRate;
        const minMut = emergenceThreshold(this.config.populationSize);
        const maxMut = adaptiveConvergenceThreshold(this.maturityHistory.length > 0 ? this.maturityHistory : [maturity]) * 10;
        newConfig.mutationRate = Math.max(
            minMut,
            Math.min(maxMut, baseMut * expand * (1 - maturity + emergenceThreshold(this.config.populationSize)))
        );

        // Crossover dinamico
        const baseCross = this.config.crossoverRate;
        const minCross = emergenceThreshold(this.config.populationSize) * 3;
        const maxCross = 1 - emergenceThreshold(this.config.populationSize);
        newConfig.crossoverRate = Math.max(
            minCross,
            Math.min(maxCross, baseCross * shrink + adaptationRate)
        );

        // Elitismo: aumenta se sistema stabile
        newConfig.elitismCount = Math.max(1, Math.floor(5 * maturity + 1));

        // ===========================================================
        // 🧠 Ricalibrazione Oracolo
        // ===========================================================
        let oracleAdjusted = false;

        const accuracyThreshold = emergenceThreshold(this.maturityHistory.length + 1);
        const entropyUpperBound = adaptiveConvergenceThreshold(this.entropyHistory.length > 0 ? this.entropyHistory : [entropy]) * 15;
        
        if (accuracy < (1 - accuracyThreshold) || entropy > entropyUpperBound) {
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
    const qualityNow = qualityMetric(entropy, variance, summary.complexity);
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
    const weights: Record<string, number> = this.mutationRegistry.getWeights();
        const adjusted: Record<string, number> = {};

        const learningRate = optimalLearningRate(
            Math.sqrt(variance + 1e-6),
            this.maturityHistory.length
        );

        for (const [strategy, wRaw] of Object.entries(weights)) {
            const w = Number(wRaw);
            // Se sistema immaturo → aumenta diversità
            let delta = 0;
            const maturityThresh = emergenceThreshold(this.maturityHistory.length + 1);
            const entropyThresh = emergenceThreshold(this.entropyHistory.length + 1);
            const varianceThresh = adaptiveConvergenceThreshold(this.stabilityHistory.length > 0 ? this.stabilityHistory : [variance]) * 2;
            const qualityThresh = emergenceThreshold(this.maturityHistory.length + 1) * 4;
            
            if (maturity < maturityThresh) delta += (1 - maturity) * learningRate;
            if (entropy < entropyThresh) delta += learningRate / 2;
            if (variance > varianceThresh) delta -= learningRate / 2;
            if (quality < qualityThresh) delta += learningRate / 2;

            const newW = w + learningRate * delta;
            adjusted[strategy] = Math.max(emergenceThreshold(1) / 10, Math.min(1, newW));
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
    const maturity = systemMaturity(this.maturityHistory);
    const entropy = shannonEntropy(this.entropyHistory);
    const variance = listVariance(this.stabilityHistory);

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
