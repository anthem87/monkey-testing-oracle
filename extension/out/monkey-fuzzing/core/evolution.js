"use strict";
/**
 * ===========================================================
 * EVOLUTION.TS (DETERMINISTIC VERSION)
 * ===========================================================
 * Evolutionary Testing Engine - NO Math.random()
 * - Population-based mutation and selection (deterministic)
 * - Oracle-guided fitness evaluation
 * - Uses generation number as seed for reproducibility
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EvolutionEngine = void 0;
const mutation_1 = require("./mutation");
const metrics_1 = require("../metrics/metrics");
const multi_objective_1 = require("./multi-objective");
// Deterministic hash (same as mutation.ts)
function deterministicHash(str, seed) {
    let h = seed;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(31, h) + str.charCodeAt(i);
        h |= 0;
    }
    return Math.abs(h);
}
// Deterministic shuffle (Fisher-Yates with seed)
function deterministicShuffle(arr, seed) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = deterministicHash(`${seed}_${i}`, seed) % (i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}
class EvolutionEngine {
    constructor(config, domain = "backend") {
        this.config = config;
        this.domain = domain;
        this.population = [];
        this.fitnessHistory = [];
        this.stateMeta = { fitnessHistory: [] };
        this.copilotAdapter = null; // Copilot adapter for mutations
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
            const best = [...this.population].sort((a, b) => b.fitness - a.fitness)[0];
            let counter = 0;
            while (this.population.length < newSize) {
                this.population.push({
                    id: `clone_${counter}_${this.population.length}`,
                    testSuite: structuredClone(best.testSuite),
                    fitness: best.fitness,
                    age: best.age
                });
                counter++;
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
    async initialize(baseSuite) {
        if (this.population.length === 0) {
            await this.initializePopulation(baseSuite);
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
    async initializePopulation(base) {
        this.population = [];
        const baseTest = base.tests[0]; // Single test method
        if (!baseTest) {
            throw new Error('No base test provided for population initialization');
        }
        console.log(`🧬 Generating test class with ${this.config.populationSize} methods incrementally...`);
        // 📝 Build the class incrementally - start with base method
        const generatedMethods = [baseTest.code];
        const methodNames = [baseTest.name];
        // Generate remaining methods one by one, showing context to AI
        for (let i = 1; i < this.config.populationSize; i++) {
            const role = i % 3 === 0 ? 'fixer' : i % 3 === 1 ? 'explorer' : 'breaker';
            if (this.copilotAdapter) {
                try {
                    // Build current class state to show AI what already exists
                    const currentClassState = `Current test class has ${generatedMethods.length} methods:

${generatedMethods.map((m, idx) => `// Method ${idx + 1}:\n${m}`).join('\n\n')}`;
                    let roleInstructions = '';
                    if (role === 'fixer') {
                        roleInstructions = `You are a FIXER. Generate a conservative test that:
- Tests edge cases (null, empty, invalid input)
- Validates error handling
- Checks boundary conditions`;
                    }
                    else if (role === 'explorer') {
                        roleInstructions = `You are an EXPLORER. Generate a creative test that:
- Tests unusual scenarios
- Uses boundary values (max, min, zero)
- Explores different code paths`;
                    }
                    else {
                        roleInstructions = `You are a BREAKER. Generate an aggressive test that:
- Tests with invalid/malicious input
- Tries to break the code
- Tests security vulnerabilities (injection, XSS, etc.)`;
                    }
                    const prompt = `${currentClassState}

${roleInstructions}

CRITICAL REQUIREMENTS:
1. Generate method #${i + 1} that is COMPLETELY DIFFERENT from all ${generatedMethods.length} existing methods
2. Test a NEW scenario not covered above
3. Use a UNIQUE method name (different from: ${methodNames.join(', ')})
4. Return ONLY the @Test method (complete with closing })
5. NO markdown, NO backticks, NO class wrapper, NO explanations

Generate the next @Test method now:`;
                    const newMethod = await this.copilotAdapter.generate(prompt);
                    let cleanedCode = newMethod.replace(/```java/g, '').replace(/```/g, '').trim();
                    // Ensure closing brace
                    if (!cleanedCode.endsWith('}')) {
                        cleanedCode += '\n    }';
                    }
                    // Extract method name
                    const nameMatch = cleanedCode.match(/void\s+(\w+)\s*\(/);
                    const methodName = nameMatch ? nameMatch[1] : `testMethod_${role}_${i}`;
                    // Add to accumulated methods
                    generatedMethods.push(cleanedCode);
                    methodNames.push(methodName);
                    console.log(`   ✓ Generated method ${i + 1}/${this.config.populationSize}: ${methodName} (${role})`);
                }
                catch (error) {
                    console.error(`❌ Failed to generate method ${i + 1}:`, error);
                    console.warn(`⚠️ Using fallback for method ${i + 1}`);
                    const fallbackMethod = `@Test\n    public void testFallback_${i}() {\n        // Fallback test\n        assertTrue(true);\n    }`;
                    generatedMethods.push(fallbackMethod);
                    methodNames.push(`testFallback_${i}`);
                }
            }
            else {
                // No Copilot - simple fallback
                const fallbackMethod = `@Test\n    public void testFallback_${i}() {\n        // Fallback test\n        assertTrue(true);\n    }`;
                generatedMethods.push(fallbackMethod);
                methodNames.push(`testFallback_${i}`);
            }
        }
        // Now create ONE individual per method (population = methods in one class)
        console.log(`\n✅ Generated ${generatedMethods.length} unique methods`);
        console.log(`   Creating population where each individual = one method...`);
        for (let i = 0; i < generatedMethods.length; i++) {
            const role = i === 0 ? 'fixer' : (i % 3 === 0 ? 'fixer' : i % 3 === 1 ? 'explorer' : 'breaker');
            this.population.push({
                id: `ind_${i}_gen0`,
                testSuite: {
                    tests: [{
                            name: methodNames[i],
                            code: generatedMethods[i],
                            input: 'generated',
                            expected: 'pass',
                            metadata: {
                                targetFile: baseTest.metadata.targetFile,
                                language: 'java',
                                origin: 'copilot-initial',
                                generation: 0
                            }
                        }]
                },
                fitness: 0,
                age: 0,
                role
            });
        }
        console.log(`✅ Population initialized: ${this.config.populationSize} individuals`);
        console.log(`   🟢 Fixers: ${this.population.filter(i => i.role === 'fixer').length}`);
        console.log(`   🔵 Explorers: ${this.population.filter(i => i.role === 'explorer').length}`);
        console.log(`   🔴 Breakers: ${this.population.filter(i => i.role === 'breaker').length}`);
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
            // 🎯 PHASE 1: Calculate multi-objective metrics for each individual
            let resultIndex = 0;
            for (const ind of this.population) {
                const numTests = ind.testSuite.tests.length;
                const indResults = batchResults.slice(resultIndex, resultIndex + numTests);
                resultIndex += numTests;
                // Calculate multi-objective fitness
                const { objectives, aggregatedFitness } = this.calculateMultiObjectiveFitness(indResults, ind);
                ind.objectives = objectives;
                ind.fitness = aggregatedFitness; // Keep for backward compatibility
                ind.age++;
            }
            // 🏆 PHASE 2: Pareto ranking - assign ranks and crowding distance
            const rankedIndividuals = this.population.map(ind => ({
                id: ind.id,
                testCode: ind.testSuite.tests[0]?.code || '',
                testName: ind.testSuite.tests[0]?.name || ind.id,
                generation: ind.age,
                objectives: ind.objectives,
                rank: 0,
                crowdingDistance: 0,
                dominationCount: 0,
                dominatedSet: new Set()
            }));
            const fronts = (0, multi_objective_1.fastNonDominatedSort)(rankedIndividuals);
            // Assign ranks and crowding distance
            fronts.forEach((front, rankIndex) => {
                // Calculate crowding distance (modifies in-place)
                (0, multi_objective_1.calculateCrowdingDistance)(front);
                // Assign rank and crowding distance to population
                front.forEach((rankedInd) => {
                    const ind = this.population.find(i => i.id === rankedInd.id);
                    if (ind) {
                        ind.paretoRank = rankIndex + 1; // Rank 1 = best front
                        ind.crowdingDistance = rankedInd.crowdingDistance;
                    }
                });
            });
            // 🎭 PHASE 3: Assign behavioral roles based on objectives
            this.assignRoles();
            console.log(`✅ Batch evaluation completed for ${this.population.length} individuals`);
            console.log(`   🏆 Pareto Fronts: ${fronts.length}`);
            console.log(`   🟢 Fixers: ${this.population.filter(i => i.role === 'fixer').length}`);
            console.log(`   🔵 Explorers: ${this.population.filter(i => i.role === 'explorer').length}`);
            console.log(`   🔴 Breakers: ${this.population.filter(i => i.role === 'breaker').length}`);
            // 🔬 DETAILED PARETO ANALYSIS
            this.logParetoFrontsDetailed(fronts);
        }
        catch (error) {
            console.error(`❌ Batch compilation failed:`, error);
            // Fallback: assegna fitness minimo a tutti
            for (const ind of this.population) {
                ind.fitness = (0, metrics_1.emergenceThreshold)(this.config.populationSize);
                ind.objectives = { loss: 1.0, diversity: 0, novelty: 0, coverage: 0 };
                ind.age++;
            }
        }
    }
    /**
     * 🔬 Log detailed Pareto front analysis
     * Shows all fronts with individual fitness components and crowding distances
     */
    logParetoFrontsDetailed(fronts) {
        console.log(`\n=== 🔬 PARETO FRONT ANALYSIS ===`);
        console.log(`Total Fronts: ${fronts.length} (Target: 3-5 for healthy diversity)\n`);
        fronts.forEach((front, idx) => {
            console.log(`📊 Front ${idx + 1} (${front.length} individuals):`);
            // Calculate average crowding distance
            const avgCrowding = front.reduce((sum, ind) => sum + ind.crowdingDistance, 0) / front.length;
            console.log(`   Avg Crowding Distance: ${avgCrowding.toFixed(3)} (Target: >0.5)\n`);
            // Show top 3 individuals from each front
            const topIndividuals = front.slice(0, Math.min(3, front.length));
            topIndividuals.forEach(ind => {
                const role = this.population.find(p => p.id === ind.id)?.role || '?';
                const roleEmoji = role === 'fixer' ? '🟢' : role === 'explorer' ? '🔵' : '🔴';
                console.log(`   ${roleEmoji} ${role.padEnd(8)} | loss=${ind.objectives.loss.toFixed(2)} ` +
                    `div=${ind.objectives.diversity.toFixed(2)} ` +
                    `nov=${ind.objectives.novelty.toFixed(2)} ` +
                    `cov=${ind.objectives.coverage.toFixed(2)} ` +
                    `| crowd=${ind.crowdingDistance.toFixed(2)}`);
            });
            if (front.length > 3) {
                console.log(`   ... and ${front.length - 3} more individuals`);
            }
            console.log('');
        });
        // Calculate variance across all individuals
        const allLosses = fronts.flat().map(ind => ind.objectives.loss);
        const avgLoss = allLosses.reduce((a, b) => a + b, 0) / allLosses.length;
        const variance = allLosses.reduce((sum, loss) => sum + Math.pow(loss - avgLoss, 2), 0) / allLosses.length;
        console.log(`📈 Population Metrics:`);
        console.log(`   Variance (σ²): ${variance.toFixed(4)} (Target: >0.05)`);
        console.log(`   Best Loss: ${Math.min(...allLosses).toFixed(2)}`);
        console.log(`   Worst Loss: ${Math.max(...allLosses).toFixed(2)}`);
        console.log(`===================================\n`);
    }
    /**
     * 🎭 ASSIGN BEHAVIORAL ROLES
     *
     * Based on multi-objective performance with forced balancing:
     * - FIXER: Low compilation loss (good at fixing syntax) - 30%
     * - EXPLORER: High coverage (good at branching/assertions) - 40%
     * - BREAKER: High chaos/novelty (good at edge cases/fuzzing) - 30%
     *
     * Strategy: Sort by performance and assign roles to maintain balance
     */
    assignRoles() {
        const targetFixers = Math.floor(this.population.length * 0.3);
        const targetExplorers = Math.floor(this.population.length * 0.4);
        const targetBreakers = this.population.length - targetFixers - targetExplorers;
        // Create sorted lists by each metric
        const byCompilation = [...this.population].sort((a, b) => {
            const aScore = a.objectives ? (1 - a.objectives.loss) : 0;
            const bScore = b.objectives ? (1 - b.objectives.loss) : 0;
            return bScore - aScore; // Descending
        });
        const byCoverage = [...this.population].sort((a, b) => {
            const aScore = a.objectives?.coverage || 0;
            const bScore = b.objectives?.coverage || 0;
            return bScore - aScore;
        });
        const byNovelty = [...this.population].sort((a, b) => {
            const aScore = a.objectives?.novelty || 0;
            const bScore = b.objectives?.novelty || 0;
            return bScore - aScore;
        });
        // Assign roles ensuring balanced distribution
        const assigned = new Set();
        // Top compilation performers → Fixers
        for (let i = 0; i < targetFixers && i < byCompilation.length; i++) {
            byCompilation[i].role = 'fixer';
            assigned.add(byCompilation[i].id);
        }
        // Top coverage performers (not already fixers) → Explorers
        let explorerCount = 0;
        for (const ind of byCoverage) {
            if (!assigned.has(ind.id) && explorerCount < targetExplorers) {
                ind.role = 'explorer';
                assigned.add(ind.id);
                explorerCount++;
            }
        }
        // Top novelty performers (not already assigned) → Breakers
        let breakerCount = 0;
        for (const ind of byNovelty) {
            if (!assigned.has(ind.id) && breakerCount < targetBreakers) {
                ind.role = 'breaker';
                assigned.add(ind.id);
                breakerCount++;
            }
        }
        // Fallback: assign any remaining individuals
        for (const ind of this.population) {
            if (!assigned.has(ind.id)) {
                // Assign based on what's needed
                const currentFixers = this.population.filter(i => i.role === 'fixer').length;
                const currentExplorers = this.population.filter(i => i.role === 'explorer').length;
                if (currentFixers < targetFixers) {
                    ind.role = 'fixer';
                }
                else if (currentExplorers < targetExplorers) {
                    ind.role = 'explorer';
                }
                else {
                    ind.role = 'breaker';
                }
            }
        }
    }
    /**
     * 🎯 MULTI-OBJECTIVE FITNESS CALCULATION
     *
     * Instead of single fitness, calculate 4 objectives in parallel:
     * 1. Compilation Score (semantic symbol-level)
     * 2. Coverage Score (line + branch)
     * 3. Chaos Score (edge cases + failures)
     * 4. Novelty Score (diversity from population)
     *
     * Then use Pareto ranking to avoid premature convergence!
     */
    calculateMultiObjectiveFitness(results, individual) {
        if (results.length === 0) {
            return {
                objectives: { loss: 1.0, diversity: 0, novelty: 0, coverage: 0 },
                aggregatedFitness: 0
            };
        }
        // � OBJECTIVE 1: COMPILATION (minimize loss)
        const compileErrors = results.filter(r => r.error || (r.stderr && /SyntaxError|TypeError|ReferenceError|Parsing error|cannot find symbol|package .* does not exist/i.test(r.stderr || ''))).length;
        const compilationScore = 1 - (compileErrors / results.length);
        // 🔵 OBJECTIVE 2: COVERAGE (maximize)
        const passRate = results.filter(r => r.passed).length / results.length;
        const coverageScore = passRate; // Simplified - could integrate real coverage data
        // 🔴 OBJECTIVE 3: CHAOS / EDGE CASES (maximize failure diversity)
        const failureRate = 1 - passRate;
        const securityAlerts = results.filter(r => r.securityAlert).length / results.length;
        const chaosScore = Math.min(1, failureRate * 0.6 + securityAlerts * 0.4);
        // 🟡 OBJECTIVE 4: NOVELTY (maximize diversity)
        const noveltyScore = individual ? this.calculateNoveltyScore(individual) : 0.5;
        // Calculate LOSS (minimize) - compilation is critical
        const loss = (1 - compilationScore) * 0.5 + // 50% weight on compilation
            (1 - coverageScore) * 0.2 + // 20% weight on coverage
            (1 - chaosScore) * 0.15 + // 15% weight on chaos
            (1 - noveltyScore) * 0.15; // 15% weight on novelty
        const objectives = {
            loss: Math.max(0, Math.min(1, loss)),
            diversity: noveltyScore,
            novelty: chaosScore, // Reuse chaos as novelty for edge cases
            coverage: coverageScore
        };
        // Aggregated fitness for simple comparison (1 - loss)
        const aggregatedFitness = 1 - objectives.loss;
        return { objectives, aggregatedFitness };
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
    /**
     * 🏅 Calculate archetype-specific bonus score
     * Rewards individuals for excelling at their role
     */
    // @ts-ignore: Unused but kept for future role-based scoring
    calculateArchetypeBonus(results, individual) {
        if (!individual.role)
            return 0;
        const role = individual.role;
        switch (role) {
            case 'fixer':
                // Reward error reduction compared to previous generation
                const errorReduction = results.reduce((sum, r) => sum + (r.errorReduction || 0), 0);
                const previousErrors = results.reduce((sum, r) => sum + (r.previousErrors || 1), 1);
                return errorReduction / previousErrors;
            case 'explorer':
                // Reward new branch coverage
                const newBranches = results.reduce((sum, r) => sum + (r.newBranchesCovered || 0), 0);
                const totalBranches = results.reduce((sum, r) => sum + (r.totalBranches || 1), 1);
                return newBranches / totalBranches;
            case 'breaker':
                // Reward discovery of unique exceptions
                const uniqueExceptions = results.reduce((sum, r) => sum + (r.uniqueExceptionsFound || 0), 0);
                const totalTests = results.reduce((sum, r) => sum + (r.totalTests || 1), 1);
                return uniqueExceptions / totalTests;
            default:
                return 0;
        }
    }
    selectParents() {
        const parents = [];
        const tournamentSize = 4;
        while (parents.length < this.config.populationSize / 2) {
            // Deterministic tournament selection
            const seed = parents.length;
            const shuffled = deterministicShuffle(this.population, seed);
            const tournament = shuffled.slice(0, tournamentSize);
            const winner = tournament.reduce((a, b) => (b.fitness > a.fitness ? b : a));
            parents.push(winner);
        }
        return parents;
    }
    async createNextGeneration(parents, copilotAdapter) {
        const newPop = [];
        // Elitism
        newPop.push(...[...this.population]
            .sort((a, b) => b.fitness - a.fitness)
            .slice(0, this.config.elitismCount));
        let childCounter = 0;
        while (newPop.length < this.config.populationSize) {
            // Deterministic parent selection
            const seed1 = deterministicHash(`parent1_${childCounter}`, childCounter);
            const seed2 = deterministicHash(`parent2_${childCounter}`, childCounter);
            const p1 = parents[seed1 % parents.length];
            const p2 = parents[seed2 % parents.length];
            // Deterministic crossover decision
            const crossoverSeed = deterministicHash(`crossover_${childCounter}`, childCounter);
            const doCrossover = (crossoverSeed % 100) < (this.config.crossoverRate * 100);
            const child = doCrossover
                ? await this.semanticCrossover(p1, p2, childCounter)
                : structuredClone(p1);
            // Deterministic mutation decision
            const mutationSeed = deterministicHash(`mutation_${childCounter}`, childCounter);
            const doMutate = (mutationSeed % 100) < (this.config.mutationRate * 100);
            if (doMutate) {
                // 🎭 ROLE-BASED MUTATION: Use parent's role to guide mutation strategy
                const parentRole = p1.role || 'explorer'; // Default to explorer if no role
                const ctx = {
                    domain: this.domain,
                    language: this.domain === "backend" ? "java" : "typescript",
                    generation: childCounter,
                    copilotAdapter,
                    role: parentRole // 🆕 Pass role to mutation engine
                };
                child.testSuite = await this.mutateTestSuite(child.testSuite, ctx);
                child.role = parentRole; // Inherit parent's role
            }
            childCounter++;
            newPop.push(child);
        }
        return newPop;
    }
    /**
     * 🧬 SEMANTIC CROSSOVER: Combine input values from different tests (deterministic)
     */
    async semanticCrossover(p1, p2, seed) {
        const t1 = p1.testSuite.tests[0];
        const t2 = p2.testSuite.tests[0];
        if (!t1 || !t2)
            return structuredClone(p1);
        // Simple hybrid: alternate characters deterministically
        const input1 = t1.input || '';
        const input2 = t2.input || '';
        const hybridInput = input1.substring(0, input1.length / 2) + input2.substring(input2.length / 2);
        return {
            id: `child_${seed}`,
            testSuite: {
                tests: [{
                        ...t1,
                        input: hybridInput,
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
        const dim = suite.tests.length;
        const mutationProb = (0, metrics_1.optimalAdaptationRate)(dim);
        const mutated = await Promise.all(suite.tests.map(async (t, idx) => {
            const seed = deterministicHash(`${t.name}_${ctx.generation}_${idx}`, ctx.generation);
            const shouldMutate = (seed % 100) < (mutationProb * 100);
            return shouldMutate ? this.mutationRegistry.applyRandomMutation(t, ctx) : t;
        }));
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