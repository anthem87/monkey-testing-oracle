"use strict";
/**
 * =============================================================
 * COPILOT-FIX.TS
 * =============================================================
 * Motore di proposta patch (LLM / Copilot) per errori classificati.
 * - Riceve NormalizedError
 * - Genera suggerimenti di correzione test / input / mutation strategy
 * - Output strutturato per EvolutionEngine / MutationRegistry
 * =============================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CopilotFixEngine = void 0;
const metrics_1 = require("../metrics/metrics");
const typescript_1 = __importDefault(require("typescript"));
class CopilotFixEngine {
    constructor(adapter) {
        this.adapter = adapter;
    }
    /** Generate multiple candidate fixes for an error */
    async generateFixes(err, generation, maxCandidates = 3) {
        if (!this.adapter)
            return [];
        const tokens = this.tokenize(err.raw).slice(0, 60);
        const entropy = (0, metrics_1.shannonEntropy)(tokens.map(t => t.length));
        const lrBase = (0, metrics_1.optimalLearningRate)(entropy, generation + 1);
        const patchType = err.kind === 'compile' ? 'syntax'
            : err.kind === 'runtime' ? 'logic'
                : err.kind === 'security' ? 'input-sanitization'
                    : 'mutation-weight';
        const proposals = [];
        for (let i = 0; i < maxCandidates; i++) {
            const focus = i === 0 ? 'minimal' : i === 1 ? 'robust' : 'edge_case';
            const prompt = `You are an autonomous test repair engine.\nError kind: ${err.kind}\nMessage: ${err.message}\nSeverity: ${err.severity}\nEntropyTokens: ${entropy.toFixed(3)}\nMode: ${focus}\nProvide ONE ${focus} patch. If compile error: syntax fix. If runtime: logic adjust. If security: sanitize input. Return ONLY patch code or mutated input.`;
            try {
                const suggestion = await this.adapter.generateMutation(prompt);
                // Use bayesianConfidence for formal confidence bounds
                const [lower, upper] = (0, metrics_1.bayesianConfidence)([lrBase]);
                const baseConf = (lower + upper) / 2;
                const decayFactor = (0, metrics_1.optimalLearningRate)(i + 1, generation + 1);
                const confidence = Math.min(1, baseConf + lrBase * (1 - decayFactor));
                proposals.push({
                    testName: err.testName,
                    originalMessage: err.message,
                    patchType,
                    patchContent: suggestion.trim().slice(0, 2000),
                    confidence: Number(confidence.toFixed(3)),
                    derivedFrom: tokens.slice(0, 8)
                });
            }
            catch {
                /* skip failed candidate */
            }
        }
        return proposals;
    }
    /** Single best fix (compat API) */
    async proposeFix(err, generation) {
        const fixes = await this.generateFixes(err, generation, 1);
        return fixes[0];
    }
    selectBestFix(fixes) {
        if (!fixes.length)
            return undefined;
        // naive selection: highest confidence, tie-break by shortest patch (minimal change principle)
        return fixes.slice().sort((a, b) => b.confidence - a.confidence || a.patchContent.length - b.patchContent.length)[0];
    }
    /** Apply patch to a test object (simple heuristic: if syntax/logic replace code, if input-sanitization mutate input) */
    applyFix(test, fix) {
        if (!fix)
            return test;
        if (fix.patchType === 'input-sanitization') {
            return { ...test, input: fix.patchContent };
        }
        if (fix.patchType === 'mutation-weight') {
            // Could adjust mutation metadata weights; placeholder attaches hint
            return { ...test, metadata: { ...(test.metadata || {}), mutationHint: fix.patchContent } };
        }
        // syntax or logic -> treat as code replacement if feasible
        if (typeof test.code === 'string') {
            if (this.isValidTypeScript(fix.patchContent)) {
                return { ...test, code: fix.patchContent };
            }
            else {
                return { ...test, metadata: { ...(test.metadata || {}), skippedInvalidPatch: true } };
            }
        }
        return { ...test, metadata: { ...(test.metadata || {}), fixPatch: fix.patchContent } };
    }
    tokenize(raw) {
        return raw.split(/[^A-Za-z0-9_]+/).filter(Boolean);
    }
    isValidTypeScript(code) {
        try {
            const transpiled = typescript_1.default.transpileModule(code, { compilerOptions: { module: typescript_1.default.ModuleKind.ESNext } });
            return transpiled.outputText.length > 0;
        }
        catch {
            return false;
        }
    }
}
exports.CopilotFixEngine = CopilotFixEngine;
//# sourceMappingURL=copilot-fix.js.map