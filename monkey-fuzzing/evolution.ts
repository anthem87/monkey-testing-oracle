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

import { MutationRegistry, MutationContext, GeneratedTest } from "./mutation";

export interface GeneratedTestSuite {
    tests: GeneratedTest[];
}

export interface TestExecutionResult {
    testName: string;
    passed: boolean;
    error?: string;
    executionTime: number;
    securityAlert?: boolean;
}

export interface EvolutionConfig {
    populationSize: number;
    generations: number;
    mutationRate: number;
    crossoverRate: number;
    elitismCount: number;
}

export interface EvolutionIndividual {
    id: string;
    testSuite: GeneratedTestSuite;
    fitness: number;
    age: number;
}

export class EvolutionEngine {
    private population: EvolutionIndividual[] = [];
    private generation = 0;
    private fitnessHistory: number[] = [];
    private mutationRegistry: MutationRegistry;

    constructor(
        private config: EvolutionConfig,
        private domain: "frontend" | "backend" = "backend"
    ) {
        this.mutationRegistry = new MutationRegistry(domain);
    }

    async evolve(
        baseSuite: GeneratedTestSuite,
        testRunner: {
            runGeneratedTests: (suite: GeneratedTestSuite) => Promise<TestExecutionResult[]>;
        },
        copilotAdapter?: any
    ): Promise<EvolutionIndividual> {
        this.initializePopulation(baseSuite);

        for (let g = 0; g < this.config.generations; g++) {
            this.generation = g;
            console.log(`🧬 Generation ${g + 1}/${this.config.generations}`);

            await this.evaluatePopulation(testRunner);
            const parents = this.selectParents();
            this.population = await this.createNextGeneration(parents, copilotAdapter);
            this.recordStats();

            if (this.hasConverged()) break;
        }

        return this.getBestIndividual();
    }

    private initializePopulation(base: GeneratedTestSuite) {
        this.population = [];
        for (let i = 0; i < this.config.populationSize; i++) {
            this.population.push({
                id: `ind_${i}_${Date.now()}`,
                testSuite: base,
                fitness: 0,
                age: 0,
            });
        }
    }

    private async evaluatePopulation(testRunner: any) {
        await Promise.all(
            this.population.map(async (ind) => {
                try {
                    const results = await testRunner.runGeneratedTests(ind.testSuite);
                    ind.fitness = this.calculateFitness(results);
                    ind.age++;
                } catch {
                    ind.fitness = 0.1;
                }
            })
        );
    }

    private calculateFitness(results: TestExecutionResult[]): number {
        if (results.length === 0) return 0;
        const passRate = results.filter((r) => r.passed).length / results.length;
        const perf = 1 - Math.min(1, results.map((r) => r.executionTime).reduce((a, b) => a + b, 0) / 10000);
        const sec = results.filter((r) => r.securityAlert).length / results.length;
        return Math.max(0, Math.min(1, 0.5 * passRate + 0.3 * perf + 0.2 * sec));
    }

    private selectParents(): EvolutionIndividual[] {
        const parents: EvolutionIndividual[] = [];
        while (parents.length < this.config.populationSize / 2) {
            const t = [...this.population].sort(() => Math.random() - 0.5).slice(0, 4);
            parents.push(t.reduce((a, b) => (b.fitness > a.fitness ? b : a)));
        }
        return parents;
    }

    private async createNextGeneration(
        parents: EvolutionIndividual[],
        copilotAdapter?: any
    ): Promise<EvolutionIndividual[]> {
        const newPop: EvolutionIndividual[] = [];

        // Elitism
        newPop.push(
            ...[...this.population]
                .sort((a, b) => b.fitness - a.fitness)
                .slice(0, this.config.elitismCount)
        );

        while (newPop.length < this.config.populationSize) {
            const p1 = parents[Math.floor(Math.random() * parents.length)];
            const p2 = parents[Math.floor(Math.random() * parents.length)];

            const child = Math.random() < this.config.crossoverRate
                ? this.crossover(p1, p2)
                : structuredClone(p1);

            if (Math.random() < this.config.mutationRate) {
                const ctx: MutationContext = {
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

    private crossover(p1: EvolutionIndividual, p2: EvolutionIndividual): EvolutionIndividual {
        const tests: GeneratedTest[] = [];
        const max = Math.max(p1.testSuite.tests.length, p2.testSuite.tests.length);
        for (let i = 0; i < max; i++) {
            const t1 = p1.testSuite.tests[i];
            const t2 = p2.testSuite.tests[i];
            tests.push(Math.random() < 0.5 ? t1 || t2 : t2 || t1);
        }
        return {
            id: `child_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            testSuite: { tests },
            fitness: 0,
            age: 0,
        };
    }

    private async mutateTestSuite(
        suite: GeneratedTestSuite,
        ctx: MutationContext
    ): Promise<GeneratedTestSuite> {
        const mutated = await Promise.all(
            suite.tests.map(async (t) =>
                Math.random() < 0.3 ? this.mutationRegistry.applyRandomMutation(t, ctx) : t
            )
        );
        return { tests: mutated };
    }

    private recordStats() {
        const avg = this.population.reduce((s, i) => s + i.fitness, 0) / this.population.length;
        this.fitnessHistory.push(avg);
        console.log(`📈 Avg fitness: ${avg.toFixed(3)}`);
    }

    private getBestIndividual() {
        return this.population.reduce((a, b) => (b.fitness > a.fitness ? b : a));
    }

    private hasConverged(): boolean {
        if (this.fitnessHistory.length < 5) return false;
        const last = this.fitnessHistory.slice(-5);
        const mean = last.reduce((a, b) => a + b, 0) / last.length;
        const var_ = last.reduce((s, v) => s + (v - mean) ** 2, 0) / last.length;
        return var_ < 0.005;
    }
}
