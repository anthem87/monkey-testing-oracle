"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleManager = void 0;
const metrics_1 = require("../metrics/metrics");
class OracleManager {
    constructor(parameters, adapter) {
        this.predictions = [];
        this.feedbacks = [];
        // private entropyHistory: number[] = []; // unused for now
        this.confidenceHistory = [];
        this.accuracyHistory = [];
        // Use bayesianConfidence to derive initial threshold from empty history
        const [lowerBound, _] = (0, metrics_1.bayesianConfidence)([]);
        const baseThreshold = lowerBound > 0 ? lowerBound : (0, metrics_1.emergenceThreshold)(1);
        this.parameters = {
            confidenceThreshold: parameters?.confidenceThreshold ?? Math.max(baseThreshold, (0, metrics_1.emergenceThreshold)(10)),
            maxInputLength: parameters?.maxInputLength ?? 2000,
            securityPatterns: parameters?.securityPatterns ?? [],
            validationRules: parameters?.validationRules ?? [],
        };
        this.adapter = adapter;
    }
    // ===========================================================
    // 🔮 PREDIZIONE
    // ===========================================================
    async predict(input, context = "") {
        if (this.adapter) {
            return this.adapter.predict(input, context);
        }
        // Use bayesianConfidence for heuristic confidence computation
        const recentHistory = this.confidenceHistory.slice(-10);
        const [lower, upper] = (0, metrics_1.bayesianConfidence)(recentHistory.length > 0 ? recentHistory : [(0, metrics_1.emergenceThreshold)(1)]);
        const baseConfidence = (lower + upper) / 2;
        // fallback euristico basato su pattern
        const str = JSON.stringify(input);
        let confidence = baseConfidence;
        let expected = "unknown";
        if (/script|<|>|\$|\{|\}/i.test(str)) {
            expected = "invalid";
            confidence = Math.min(1.0, upper + (0, metrics_1.emergenceThreshold)(this.confidenceHistory.length));
        }
        else if (typeof input === "number" && (isNaN(input) || !isFinite(input))) {
            expected = "invalid";
            confidence = Math.min(1.0, upper + 2 * (0, metrics_1.emergenceThreshold)(this.confidenceHistory.length));
        }
        else if (typeof input === "string" && input.trim().length === 0) {
            expected = "invalid";
            confidence = Math.min(1.0, baseConfidence + (0, metrics_1.emergenceThreshold)(this.confidenceHistory.length));
        }
        else {
            expected = "valid";
            confidence = Math.max(lower, baseConfidence);
        }
        const prediction = {
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
    recordFeedback(feedback) {
        this.feedbacks.push(feedback);
        const passed = feedback.passed ? 1 : 0;
        this.accuracyHistory.push(passed);
    }
    computeAccuracy() {
        if (this.accuracyHistory.length === 0)
            return 0;
        const mean = this.accuracyHistory.reduce((a, b) => a + b, 0) / this.accuracyHistory.length;
        return Number(mean.toFixed(3));
    }
    computeConfidenceEntropy() {
        return (0, metrics_1.shannonEntropy)(this.confidenceHistory);
    }
    computePredictionVariance() {
        return (0, metrics_1.listVariance)(this.confidenceHistory);
    }
    // ===========================================================
    // 🧮 AGGIORNAMENTO DINAMICO
    // ===========================================================
    adaptParameters() {
        const acc = this.computeAccuracy();
        const entropy = this.computeConfidenceEntropy();
        (0, metrics_1.adaptiveConvergenceThreshold)(this.accuracyHistory); // convergence currently unused
        const adaptationRate = (0, metrics_1.optimalAdaptationRate)(this.confidenceHistory.length + 1);
        const maturity = (0, metrics_1.systemMaturity)(this.accuracyHistory);
        // Formal maturity weight derived from emergence threshold
        const maturityWeight = (0, metrics_1.emergenceThreshold)(this.accuracyHistory.length);
        // aggiorna confidence threshold dinamicamente
        this.parameters.confidenceThreshold =
            this.parameters.confidenceThreshold * (1 - adaptationRate) +
                (acc * (1 - entropy) + maturity * maturityWeight) * adaptationRate;
        // Use bayesian bounds for clamping
        const [lower, upper] = (0, metrics_1.bayesianConfidence)(this.confidenceHistory.length > 0 ? this.confidenceHistory : [(0, metrics_1.emergenceThreshold)(1)]);
        const minThreshold = Math.max((0, metrics_1.emergenceThreshold)(this.confidenceHistory.length), lower);
        const maxThreshold = Math.min(upper, 1.0 - (0, metrics_1.emergenceThreshold)(this.confidenceHistory.length));
        this.parameters.confidenceThreshold = Math.min(maxThreshold, Math.max(minThreshold, this.parameters.confidenceThreshold));
        console.log(`🧠 Oracle adapted: accuracy=${acc.toFixed(2)}, entropy=${entropy.toFixed(2)}, maturity=${maturity.toFixed(2)}, newThreshold=${this.parameters.confidenceThreshold.toFixed(2)}`);
    }
    // ===========================================================
    // 🔁 RESET & EXPORT
    // ===========================================================
    reset() {
        this.predictions = [];
        this.feedbacks = [];
        this.confidenceHistory = [];
        this.accuracyHistory = [];
        // entropyHistory field removed
    }
    exportState() {
        return {
            accuracy: this.computeAccuracy(),
            confidenceEntropy: this.computeConfidenceEntropy(),
            parameters: this.parameters,
            maturity: (0, metrics_1.systemMaturity)(this.accuracyHistory),
        };
    }
    getParameters() {
        return this.parameters;
    }
    setAdapter(adapter) {
        this.adapter = adapter;
    }
}
exports.OracleManager = OracleManager;
//# sourceMappingURL=oracle.js.map