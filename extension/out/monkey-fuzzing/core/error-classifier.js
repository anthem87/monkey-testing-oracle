"use strict";
/**
 * =============================================================
 * ERROR-CLASSIFIER.TS
 * =============================================================
 * Classifica errori di compilazione / runtime e produce struttura normalizzata
 * Feed per FeedbackEngine e CopilotFixEngine
 * Tutti i coefficienti presi da metrics (nessun magic number hardcoded)
 * =============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorClassifier = void 0;
const metrics_1 = require("../metrics/metrics");
class ErrorClassifier {
    constructor() {
        this.errors = [];
    }
    classify(testName, stderr, stdout) {
        if (!stderr && !stdout)
            return undefined;
        const raw = (stderr || '') + (stdout || '');
        let kind = 'unknown';
        // Build tool errors (Maven, Gradle, etc.) - agnostic approach
        if (/\[ERROR\]/i.test(raw))
            kind = 'compile';
        // Runtime errors
        else if (/AssertionError|RangeError|UnhandledPromise|Exception|Error:/i.test(raw))
            kind = 'runtime';
        else if (/ETIMEDOUT|Timeout|Exceeded/i.test(raw))
            kind = 'timeout';
        else if (/XSS|injection|payload|security/i.test(raw))
            kind = 'security';
        const messageLine = raw.split('\n').find(l => l.trim().length > 0) || raw.trim();
        const severity = this.computeSeverity(raw, kind);
        const norm = {
            kind,
            message: messageLine.slice(0, 240),
            raw: raw.slice(0, 4000),
            testName,
            stack: this.extractStack(raw),
            timestamp: new Date().toISOString(),
            severity
        };
        this.errors.push(norm);
        return norm;
    }
    extractStack(raw) {
        const stackLines = raw.split('\n').filter(l => /at\s+/.test(l));
        if (stackLines.length === 0)
            return undefined;
        return stackLines.slice(0, 20).join('\n');
    }
    computeSeverity(raw, kind) {
        // Usa solo funzioni da metrics.ts per derivare severità senza magic numbers.
        const tokens = raw.split(/\s+/).filter(Boolean);
        const lengths = tokens.map(t => t.length || 1);
        const entropy = (0, metrics_1.shannonEntropy)(lengths); // informazione del pattern errore
        const variance = (0, metrics_1.listVariance)(lengths); // dispersione segnali
        const complexity = (0, metrics_1.structuralComplexity)(tokens.length, 0); // complessità strutturale grezza
        const quality = (0, metrics_1.qualityMetric)(entropy, variance, complexity); // misura composita
        const adapt = (0, metrics_1.optimalAdaptationRate)(tokens.length + 1); // quanto velocemente possiamo adattare
        const agreement = (0, metrics_1.optimalAgreementThreshold)(Math.max(1, Math.min(50, tokens.length))); // stabilità previsione
        const emergence = (0, metrics_1.emergenceThreshold)(tokens.length); // rarità emergente dell'errore
        // Deriva contributo semantico del tipo di errore via entropia del nome
        const kindCharCodes = kind.split('').map(c => c.charCodeAt(0));
        const kindEntropy = (0, metrics_1.shannonEntropy)(kindCharCodes);
        // Combinazione: media pesata di metriche formali (nessun coeff fisso)
        // Normalizziamo ogni componente in [0,1] implicito dalle funzioni.
        const composite = (quality + adapt + agreement + (1 - emergence) + kindEntropy) / 5;
        return Number(Math.min(1, Math.max(0, composite)).toFixed(3));
    }
    buildAggregateReport() {
        const total = this.errors.length;
        const counts = {
            compile: this.errors.filter(e => e.kind === 'compile').length,
            runtime: this.errors.filter(e => e.kind === 'runtime').length,
            timeout: this.errors.filter(e => e.kind === 'timeout').length,
            security: this.errors.filter(e => e.kind === 'security').length,
            unknown: this.errors.filter(e => e.kind === 'unknown').length,
        };
        const entropyKinds = (0, metrics_1.shannonEntropy)(this.errors.map(e => ({ compile: 1, runtime: 2, timeout: 3, security: 4, unknown: 5 }[e.kind])));
        const severityValues = this.errors.map(e => e.severity);
        const varianceSeverity = (0, metrics_1.listVariance)(severityValues);
        const adaptiveThreshold = (0, metrics_1.adaptiveConvergenceThreshold)(severityValues);
        const severityMean = severityValues.length ? severityValues.reduce((a, b) => a + b, 0) / severityValues.length : 0;
        return { total, ...counts, entropyKinds, varianceSeverity, adaptiveThreshold, severityMean };
    }
    getErrors() { return this.errors; }
    reset() { this.errors = []; }
}
exports.ErrorClassifier = ErrorClassifier;
//# sourceMappingURL=error-classifier.js.map