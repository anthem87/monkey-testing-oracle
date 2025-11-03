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
    shannonEntropy,
    listVariance,
    systemMaturity,
    adaptiveConvergenceThreshold,
    optimalAdaptationRate,
    bayesianConfidence,
    emergenceThreshold,
} from "../metrics/metrics";

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
    // private entropyHistory: number[] = []; // unused for now
    private confidenceHistory: number[] = [];
    private accuracyHistory: number[] = [];
    private parameters: OracleParameters;
    private adapter?: OracleAdapter;

    constructor(parameters?: Partial<OracleParameters>, adapter?: OracleAdapter) {
        // Use bayesianConfidence to derive initial threshold from empty history
        const [lowerBound, _] = bayesianConfidence([]);
        const baseThreshold = lowerBound > 0 ? lowerBound : emergenceThreshold(1);
        
        this.parameters = {
            confidenceThreshold: parameters?.confidenceThreshold ?? Math.max(baseThreshold, emergenceThreshold(10)),
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

        // Use bayesianConfidence for heuristic confidence computation
        const recentHistory = this.confidenceHistory.slice(-10);
        const [lower, upper] = bayesianConfidence(recentHistory.length > 0 ? recentHistory : [emergenceThreshold(1)]);
        const baseConfidence = (lower + upper) / 2;

        // fallback euristico basato su pattern
        const str = JSON.stringify(input);
        let confidence = baseConfidence;
        let expected: any = "unknown";

        if (/script|<|>|\$|\{|\}/i.test(str)) {
            expected = "invalid";
            confidence = Math.min(1.0, upper + emergenceThreshold(this.confidenceHistory.length));
        } else if (typeof input === "number" && (isNaN(input) || !isFinite(input))) {
            expected = "invalid";
            confidence = Math.min(1.0, upper + 2 * emergenceThreshold(this.confidenceHistory.length));
        } else if (typeof input === "string" && input.trim().length === 0) {
            expected = "invalid";
            confidence = Math.min(1.0, baseConfidence + emergenceThreshold(this.confidenceHistory.length));
        } else {
            expected = "valid";
            confidence = Math.max(lower, baseConfidence);
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
        return shannonEntropy(this.confidenceHistory);
    }

    computePredictionVariance(): number {
        return listVariance(this.confidenceHistory);
    }

    // ===========================================================
    // 🧮 AGGIORNAMENTO DINAMICO
    // ===========================================================

    adaptParameters(): void {
        const acc = this.computeAccuracy();
        const entropy = this.computeConfidenceEntropy();
        adaptiveConvergenceThreshold(this.accuracyHistory); // convergence currently unused
        const adaptationRate = optimalAdaptationRate(this.confidenceHistory.length + 1);
        const maturity = systemMaturity(this.accuracyHistory);

        // Formal maturity weight derived from emergence threshold
        const maturityWeight = emergenceThreshold(this.accuracyHistory.length);

        // aggiorna confidence threshold dinamicamente
        this.parameters.confidenceThreshold =
            this.parameters.confidenceThreshold * (1 - adaptationRate) +
            (acc * (1 - entropy) + maturity * maturityWeight) * adaptationRate;

        // Use bayesian bounds for clamping
        const [lower, upper] = bayesianConfidence(this.confidenceHistory.length > 0 ? this.confidenceHistory : [emergenceThreshold(1)]);
        const minThreshold = Math.max(emergenceThreshold(this.confidenceHistory.length), lower);
        const maxThreshold = Math.min(upper, 1.0 - emergenceThreshold(this.confidenceHistory.length));
        
        this.parameters.confidenceThreshold = Math.min(maxThreshold, Math.max(minThreshold, this.parameters.confidenceThreshold));

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
    // entropyHistory field removed
    }

    exportState(): any {
        return {
            accuracy: this.computeAccuracy(),
            confidenceEntropy: this.computeConfidenceEntropy(),
            parameters: this.parameters,
            maturity: systemMaturity(this.accuracyHistory),
        };
    }

    getParameters(): OracleParameters {
        return this.parameters;
    }

    setAdapter(adapter: OracleAdapter): void {
        this.adapter = adapter;
    }
}
