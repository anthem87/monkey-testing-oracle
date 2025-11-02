/**
 * ===========================================================
 * ORACLE.TS
 * ===========================================================
 * Oracle Engine: predizione, verifica e apprendimento
 * - Predizione basata su regole, pattern o LLM
 * - Aggiornamento adattivo con feedback
 * - Supporto diretto alle metriche matematiche (entropy, MI, ecc.)
 * ===========================================================
 */

import {
    shannon_entropy,
    mutual_information,
    list_variance,
    system_maturity,
    adaptive_convergence_threshold,
    optimal_adaptation_rate,
} from "./metrics/metrics";

export interface OraclePrediction {
    expected: any;
    confidence: number;
    reason?: string;
}

export interface OracleParameters {
    confidenceThreshold: number;
    maxInputLength: number;
    securityPatterns: string[];
    validationRules: string[];
}

export interface OracleAdapter {
    predict(input: any, context?: string): Promise<OraclePrediction>;
}

export interface OracleFeedback {
    input: any;
    expected: any;
    observed: any;
    passed: boolean;
    error?: string;
    latencyMs?: number;
}

export class OracleManager {
    private predictions: OraclePrediction[] = [];
    private feedbacks: OracleFeedback[] = [];
    private entropyHistory: number[] = [];
    private confidenceHistory: number[] = [];
    private accuracyHistory: number[] = [];
    private parameters: OracleParameters;
    private adapter?: OracleAdapter;

    constructor(parameters?: Partial<OracleParameters>, adapter?: OracleAdapter) {
        this.parameters = {
            confidenceThreshold: parameters?.confidenceThreshold ?? 0.7,
            maxInputLength: parameters?.maxInputLength ?? 2000,
            securityPatterns: parameters?.securityPatterns ?? [],
            validationRules: parameters?.validationRules ?? [],
        };
        this.adapter = adapter;
    }

    // ===========================================================
    // 🔮 PREDIZIONE
    // ===========================================================

    async predict(input: any, context: string = ""): Promise<OraclePrediction> {
        if (this.adapter) {
            return this.adapter.predict(input, context);
        }

        // fallback euristico basato su pattern
        const str = JSON.stringify(input);
        let confidence = 0.5;
        let expected: any = "unknown";

        if (/script|<|>|\$|\{|\}/i.test(str)) {
            expected = "invalid";
            confidence = 0.9;
        } else if (typeof input === "number" && (isNaN(input) || !isFinite(input))) {
            expected = "invalid";
            confidence = 0.95;
        } else if (typeof input === "string" && input.trim().length === 0) {
            expected = "invalid";
            confidence = 0.8;
        } else {
            expected = "valid";
            confidence = 0.6;
        }

        const prediction: OraclePrediction = {
            expected,
            confidence,
            reason: "heuristic fallback",
        };

        this.predictions.push(prediction);
        this.confidenceHistory.push(confidence);
        return prediction;
    }

    // ===========================================================
    // 📊 FEEDBACK
    // ===========================================================

    recordFeedback(feedback: OracleFeedback): void {
        this.feedbacks.push(feedback);
        const passed = feedback.passed ? 1 : 0;
        this.accuracyHistory.push(passed);
    }

    computeAccuracy(): number {
        if (this.accuracyHistory.length === 0) return 0;
        const mean = this.accuracyHistory.reduce((a, b) => a + b, 0) / this.accuracyHistory.length;
        return Number(mean.toFixed(3));
    }

    computeConfidenceEntropy(): number {
        return shannon_entropy(this.confidenceHistory);
    }

    computePredictionVariance(): number {
        return list_variance(this.confidenceHistory);
    }

    // ===========================================================
    // 🧮 AGGIORNAMENTO DINAMICO
    // ===========================================================

    adaptParameters(): void {
        const acc = this.computeAccuracy();
        const entropy = this.computeConfidenceEntropy();
        const convergence = adaptive_convergence_threshold(this.accuracyHistory);

        const adaptationRate = optimal_adaptation_rate(this.confidenceHistory.length + 1);
        const maturity = system_maturity(this.accuracyHistory);

        // aggiorna confidence threshold dinamicamente
        this.parameters.confidenceThreshold =
            this.parameters.confidenceThreshold * (1 - adaptationRate) +
            (acc * (1 - entropy) + maturity * 0.5) * adaptationRate;

        this.parameters.confidenceThreshold = Math.min(0.95, Math.max(0.4, this.parameters.confidenceThreshold));

        console.log(
            `🧠 Oracle adapted: accuracy=${acc.toFixed(2)}, entropy=${entropy.toFixed(2)}, maturity=${maturity.toFixed(
                2
            )}, newThreshold=${this.parameters.confidenceThreshold.toFixed(2)}`
        );
    }

    // ===========================================================
    // 🔁 RESET & EXPORT
    // ===========================================================

    reset(): void {
        this.predictions = [];
        this.feedbacks = [];
        this.confidenceHistory = [];
        this.accuracyHistory = [];
        this.entropyHistory = [];
    }

    exportState(): any {
        return {
            accuracy: this.computeAccuracy(),
            confidenceEntropy: this.computeConfidenceEntropy(),
            parameters: this.parameters,
            maturity: system_maturity(this.accuracyHistory),
        };
    }

    getParameters(): OracleParameters {
        return this.parameters;
    }

    setAdapter(adapter: OracleAdapter): void {
        this.adapter = adapter;
    }
}
