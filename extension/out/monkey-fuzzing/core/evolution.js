"use strict";
/**
 * ===========================================================
 * EVOLUTION.TS
 * ===========================================================
 * Evolutionary Testing Engine
 * - Population-based mutation and selection
 * - Oracle-guided fitness evaluation
 * - Integrated with MutationRegistry (dynamic + Copilot)
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvolutionEngine = void 0;
// Import mutation framework (ensure 'core' folder included in tsconfig)
const mutation_1 = require("./mutation");
const metrics_1 = require("../metrics/metrics");
class EvolutionEngine {
    constructor(config, domain = "backend") {
        this.config = config;
        this.domain = domain;
        this.population = [];
        this.fitnessHistory = [];
        this.stateMeta = { fitnessHistory: [] };
        this.copilotAdapter = null;
        this.mutationRegistry = new mutation_1.MutationRegistry(domain);
    }
    setCopilotAdapter(adapter) {
        this.copilotAdapter = adapter;
    }
    setConfig(cfg) {
        this.config = cfg;
    }
    /** Resize population adaptively keeping best individuals */
    applyPopulationResize(newSize) {
        if (newSize === this.population.length)
            return;
        if (newSize > this.population.length) {
            // clone best to grow
            const best = [...this.population].sort((a, b) => b.fitness - a.fitness)[0];
            while (this.population.length < newSize) {
                this.population.push({
                    id: `clone_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    testSuite: structuredClone(best.testSuite),
                    fitness: best.fitness,
                    age: best.age
                });
            }
        }
        else {
            this.population = [...this.population].sort((a, b) => b.fitness - a.fitness).slice(0, newSize);
        }
        console.log(`📦 Population resized to ${newSize}`);
    }
    setStateTracker(tracker) {
        this.stateTracker = tracker;
    }
    /** Resume from a previously saved population (checkpoint) */
    resumeFromState(populationData, configOverride) {
        this.population = populationData.map(p => ({ id: p.id, fitness: p.fitness, age: p.age, testSuite: { tests: p.tests } }));
        if (configOverride) {
            this.config = { ...this.config, ...configOverride };
        }
        // rebuild fitness history baseline
        const avg = this.population.reduce((s, i) => s + i.fitness, 0) / Math.max(1, this.population.length);
        this.fitnessHistory = [avg];
        console.log(`↩️ Resume: population=${this.population.length} avgFitness=${avg.toFixed(3)}`);
    }
    /** Initialize once */
    initialize(baseSuite) {
        if (this.population.length === 0) {
            this.initializePopulation(baseSuite);
        }
    }
    async evolveOneGeneration(generation, testRunner, copilotAdapter) {
        // generation index handled externally; no internal field retained
        console.log(`🧬 Generation ${generation + 1}`);
        await this.evaluatePopulation(testRunner);
        const parents = this.selectParents();
        this.population = await this.createNextGeneration(parents, copilotAdapter);
        this.recordStats();
        this.stateMeta.fitnessHistory = [...this.fitnessHistory];
        this.stateMeta.lastMutationRate = this.config.mutationRate;
        this.stateMeta.lastCrossoverRate = this.config.crossoverRate;
        this.stateMeta.lastElitism = this.config.elitismCount;
        if (this.stateTracker) {
            const snapshot = this.stateTracker.createSnapshot(generation, this.population, this.stateMeta);
            console.log(`📊 State Snapshot dim(S_t)=${snapshot.dimTotal} H(P_t)=${snapshot.entropyPopulation.toFixed(3)}`);
        }
        return this.getBestIndividual();
    }
    initializePopulation(base) {
        this.population = [];
        // STRATEGIA: Ogni individuo rappresenta UN SINGOLO TEST
        // Questo riduce drasticamente le compilazioni Maven (da 20×5=100 a 20×1=20)
        const baseTests = base.tests;
        for (let i = 0; i < this.config.populationSize; i++) {
            // Ruota sui test base e crea varianti
            const testIndex = i % baseTests.length;
            const singleTest = baseTests[testIndex];
            this.population.push({
                id: `ind_${i}_${Date.now()}`,
                testSuite: {
                    tests: [singleTest] // SINGOLO TEST per individuo
                },
                fitness: 0,
                age: 0,
            });
        }
        console.log(`🧬 Population initialized: ${this.config.populationSize} individuals (1 test each)`);
    }
    async evaluatePopulation(testRunner) {
        // 🚀 BATCH COMPILATION MODE: Scrivi tutti i test insieme, compila UNA VOLTA
        // Invece di 20 compilazioni Maven sequenziali → 1 singola compilazione
        console.log(`🔬 Evaluating ${this.population.length} individuals (batch mode)...`);
        // Aggrega tutti i test in una singola suite
        const allTests = this.population.flatMap(ind => ind.testSuite.tests);
        const batchSuite = {
            id: 'batch_evaluation',
            targetLanguage: this.population[0]?.testSuite.tests[0]?.metadata?.language || 'typescript',
            tests: allTests
        };
        console.log(`📝 Writing ${allTests.length} tests in batch...`);
        // Esegui compilazione + tests in batch (UNA SOLA VOLTA)
        try {
            const batchResults = await testRunner.runGeneratedTests(batchSuite);
            // Distribuisci i risultati ai rispettivi individui
            let resultIndex = 0;
            for (const ind of this.population) {
                const numTests = ind.testSuite.tests.length; // sempre 1 ora
                const indResults = batchResults.slice(resultIndex, resultIndex + numTests);
                resultIndex += numTests;
                ind.fitness = this.calculateFitness(indResults, ind); // Pass individual for novelty
                ind.age++;
            }
            console.log(`✅ Batch evaluation completed for ${this.population.length} individuals`);
        }
        catch (error) {
            console.error(`❌ Batch compilation failed:`, error);
            // Fallback: assegna fitness minimo a tutti
            for (const ind of this.population) {
                ind.fitness = (0, metrics_1.emergenceThreshold)(this.config.populationSize);
                ind.age++;
            }
        }
    }
    calculateFitness(results, individual) {
        if (results.length === 0)
            return 0;
        // 🚨 CRITICAL FIX: If ALL tests fail compilation, fitness MUST be near-zero
        // Novelty should NOT compensate for non-compiling code
        const compileErrors = results.filter(r => r.error || (r.stderr && /SyntaxError|TypeError|ReferenceError|Parsing error|cannot find symbol|package .* does not exist/i.test(r.stderr || ''))).length;
        const compilationRate = 1 - compileErrors / results.length; // 0 if all fail, 1 if all compile
        // If NOTHING compiles, return minimal fitness (novelty-only mode)
        if (compilationRate === 0) {
            // Allow tiny fitness from novelty to preserve diverse errors for debugging
            const novelty = individual ? this.calculateNoveltyScore(individual) : 0;
            console.warn(`🚨 NON-COMPILING TEST: fitness=${(0.05 * novelty).toFixed(3)} (novelty=${novelty.toFixed(2)}, ${compileErrors}/${results.length} errors)`);
            return 0.05 * novelty; // Max 5% fitness for non-compiling code
        }
        // Normal fitness calculation for compilable tests
        const passRate = results.filter((r) => r.passed).length / results.length;
        const perf = 1 - Math.min(1, results.map((r) => r.executionTime).reduce((a, b) => a + b, 0) / 10000);
        const sec = results.filter((r) => r.securityAlert).length / results.length;
        // Use qualityMetric to derive weights: higher quality means more emphasis on pass rate
        const entropy = passRate;
        const variance = Math.abs(perf - passRate);
        const complexity = sec + (1 - compilationRate);
        const q = (0, metrics_1.qualityMetric)(entropy, variance, complexity);
        // Formal weights derived from quality metric
        const w_pass = 0.3 + 0.2 * q; // 0.3-0.5 based on quality
        const w_perf = 0.2 + 0.1 * (1 - q); // 0.2-0.3 inversely
        const w_sec = 0.1 + 0.1 * q; // 0.1-0.2 based on quality
        const w_comp = 0.4 - 0.2 * q; // 0.2-0.4 inversely (MUST compile!)
        const baseFitness = Math.max(0, Math.min(1, w_pass * passRate +
            w_perf * perf +
            w_sec * sec +
            w_comp * compilationRate // Changed from fComp to compilationRate
        ));
        // 🧬 NOVELTY BONUS: Only significant if base fitness > 0.1
        if (individual && baseFitness > 0.1) {
            const novelty = this.calculateNoveltyScore(individual);
            return 0.7 * baseFitness + 0.3 * novelty; // 70% fitness + 30% novelty
        }
        return baseFitness;
    }
    /**
     * 🔬 Calculate novelty score - semantic distance from rest of population
     * Higher = more unique = preserves edge cases
     */
    calculateNoveltyScore(individual) {
        if (this.population.length <= 1)
            return 1.0;
        const test = individual.testSuite.tests[0]; // Single test per individual
        if (!test)
            return 0;
        let maxDistance = 0;
        for (const other of this.population) {
            if (other.id === individual.id)
                continue;
            const otherTest = other.testSuite.tests[0];
            if (!otherTest)
                continue;
            // Levenshtein distance on input values (normalized)
            const distance = this.levenshteinDistance(test.input, otherTest.input) /
                Math.max(test.input.length, otherTest.input.length, 1);
            maxDistance = Math.max(maxDistance, distance);
        }
        return Math.min(1, maxDistance); // Cap at 1.0
    }
    /**
     * Calculate Levenshtein distance between two strings
     */
    levenshteinDistance(a, b) {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                }
                else {
                    matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
                }
            }
        }
        return matrix[b.length][a.length];
    }
    selectParents() {
        const parents = [];
        while (parents.length < this.config.populationSize / 2) {
            const t = [...this.population].sort(() => Math.random() - 0.5).slice(0, 4);
            parents.push(t.reduce((a, b) => (b.fitness > a.fitness ? b : a)));
        }
        return parents;
    }
    async createNextGeneration(parents, copilotAdapter) {
        const newPop = [];
        // Elitism
        newPop.push(...[...this.population]
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, this.config.elitismCount));
        while (newPop.length < this.config.populationSize) {
            const p1 = parents[Math.floor(Math.random() * parents.length)];
            const p2 = parents[Math.floor(Math.random() * parents.length)];
            // 🧬 SEMANTIC CROSSOVER: Combine tests with different strategies
            const child = Math.random() < 0.5
                ? await this.semanticCrossover(p1, p2)
                : structuredClone(p1);
            if (Math.random() < this.config.mutationRate) {
                const ctx = {
                    domain: this.domain,
                    language: this.domain === "backend" ? "java" : "typescript",
                    copilotAdapter,
                };
                child.testSuite = await this.mutateTestSuite(child.testSuite, ctx);
            }
            newPop.push(child);
        }
        return newPop;
    }
    /**
     * 🧬 SEMANTIC CROSSOVER: Combine input values from different tests
     * Creates hybrid edge cases by merging strategies
     */
    async semanticCrossover(p1, p2) {
        const t1 = p1.testSuite.tests[0];
        const t2 = p2.testSuite.tests[0];
        if (!t1 || !t2)
            return structuredClone(p1);
        // 🤖 Extract input values using Copilot (semantic understanding)
        const extractInputs = async (code) => {
            if (!this.copilotAdapter) {
                // Fallback: simple regex for literals
                const matches = code.matchAll(/"([^"]+)"|'([^']+)'|null|\d+/g);
                return Array.from(matches).map(m => m[0]);
            }
            try {
                const prompt = `Extract all input values from this test code. Return ONLY a JSON array of strings.

Test code:
\`\`\`
${code}
\`\`\`

Return format: ["value1", "value2", ...]`;
                const response = await this.copilotAdapter.sendPrompt(prompt);
                const jsonMatch = response.match(/\[[\s\S]*\]/);
                if (jsonMatch) {
                    return JSON.parse(jsonMatch[0]);
                }
                // Fallback on parse error
                const matches = code.matchAll(/"([^"]+)"|'([^']+)'|null|\d+/g);
                return Array.from(matches).map(m => m[0]);
            }
            catch {
                // Fallback on any error
                const matches = code.matchAll(/"([^"]+)"|'([^']+)'|null|\d+/g);
                return Array.from(matches).map(m => m[0]);
            }
        };
        const inputs1 = await extractInputs(t1.code);
        const inputs2 = await extractInputs(t2.code);
        // Hybrid strategy: mix inputs from both parents
        let childCode = t1.code;
        if (inputs1.length > 0 && inputs2.length > 0) {
            // Replace first input from t1 with random input from t2
            const randomInput2 = inputs2[Math.floor(Math.random() * inputs2.length)];
            childCode = childCode.replace(inputs1[0], randomInput2);
        }
        return {
            id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            testSuite: {
                tests: [{
                        ...t1,
                        code: childCode,
                        input: `hybrid(${t1.input},${t2.input})`,
                        metadata: {
                            ...t1.metadata,
                            origin: 'mutated',
                            generation: (t1.metadata.generation || 0) + 1
                        }
                    }]
            },
            fitness: 0,
            age: 0,
        };
    }
    // OLD crossover rimosso, ora usiamo semanticCrossover già definito sopra
    async mutateTestSuite(suite, ctx) {
        // Use optimalAdaptationRate based on test suite dimension
        const dim = suite.tests.length;
        const mutationProb = (0, metrics_1.optimalAdaptationRate)(dim);
        const mutated = await Promise.all(suite.tests.map(async (t) => Math.random() < mutationProb ? this.mutationRegistry.applyRandomMutation(t, ctx) : t));
        return { tests: mutated };
    }
    /** Propagate repaired tests into all individuals (shallow replace by name) */
    applyRepairs(repaired) {
        const map = new Map(repaired.map(t => [t.name, t]));
        for (const ind of this.population) {
            ind.testSuite.tests = ind.testSuite.tests.map(t => map.get(t.name) ? { ...map.get(t.name) } : t);
        }
        console.log(`🔁 Repair propagation applied to population (${this.population.length} individuals)`);
    }
    recordStats() {
        const avg = this.population.reduce((s, i) => s + i.fitness, 0) / this.population.length;
        this.fitnessHistory.push(avg);
        console.log(`📈 Avg fitness: ${avg.toFixed(3)}`);
    }
    getBestIndividual() {
        return this.population.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    }
}
exports.EvolutionEngine = EvolutionEngine;
//# sourceMappingURL=evolution.js.map