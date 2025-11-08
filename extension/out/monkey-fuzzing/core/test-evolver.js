"use strict";
/**
 * =============================================================
 * TEST-EVOLVER.TS
 * =============================================================
 * Evolve test tra generazioni usando contesto del progetto
 * - Aggiunge nuovi test case
 * - Migliora assertion con DTOs trovati
 * - Usa dipendenze disponibili (Mockito, etc.)
 * =============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestEvolver = void 0;
class TestEvolver {
    constructor(copilotAPI) {
        this.copilotAPI = copilotAPI;
    }
    /**
     * 🧬 Evolve test usando contesto del progetto
     */
    async evolveTest(currentTestCode, projectContext, generation, previousMetrics) {
        if (!this.copilotAPI) {
            return {
                code: currentTestCode,
                strategy: { type: 'refactor', description: 'No evolution (Copilot unavailable)' },
                confidence: 0,
                changes: []
            };
        }
        console.log(`\n🧬 Evolving test (generation ${generation})...`);
        console.log(`   Previous fitness: ${previousMetrics.fitness.toFixed(3)}`);
        console.log(`   Tests run: ${previousMetrics.testsRun}`);
        // Seleziona strategia basata su fitness e generazione
        const strategy = this.selectStrategy(previousMetrics, generation);
        console.log(`   Strategy: ${strategy.type} - ${strategy.description}`);
        // Genera prompt contestuale
        const prompt = this.buildEvolutionPrompt(currentTestCode, projectContext, strategy);
        try {
            const response = await this.copilotAPI.generate(prompt);
            // Estrai codice Java
            let evolvedCode = response.trim();
            if (evolvedCode.includes('```java')) {
                const match = evolvedCode.match(/```java\n([\s\S]*?)\n```/);
                if (match)
                    evolvedCode = match[1];
            }
            else if (evolvedCode.includes('```')) {
                const match = evolvedCode.match(/```\n([\s\S]*?)\n```/);
                if (match)
                    evolvedCode = match[1];
            }
            // Estrai lista di cambiamenti
            const changes = this.extractChanges(response);
            console.log(`   ✅ Evolved with ${changes.length} changes`);
            changes.forEach((c, i) => console.log(`      ${i + 1}. ${c}`));
            return {
                code: evolvedCode,
                strategy,
                confidence: 0.7 + Math.random() * 0.2, // 0.7-0.9
                changes
            };
        }
        catch (err) {
            console.error(`   ❌ Evolution failed: ${err.message}`);
            return {
                code: currentTestCode,
                strategy,
                confidence: 0,
                changes: []
            };
        }
    }
    /**
     * 🎯 Seleziona strategia di evoluzione
     */
    selectStrategy(metrics, generation) {
        // Se fitness bassa → aggiungi test case
        if (metrics.fitness < 0.5 || metrics.testsRun === 0) {
            return {
                type: 'add_test_case',
                description: 'Add more test cases to increase coverage'
            };
        }
        // Se alcuni test falliscono → migliora assertion
        if (metrics.testsPassed < metrics.testsRun) {
            return {
                type: 'improve_assertions',
                description: 'Improve assertions based on actual behavior'
            };
        }
        // Nelle generazioni intermedie → aggiungi edge cases
        if (generation >= 2 && generation <= 5) {
            return {
                type: 'add_edge_cases',
                description: 'Add edge cases (null, empty, boundary values)'
            };
        }
        // Nelle generazioni avanzate → aggiungi mock
        if (generation > 5) {
            return {
                type: 'add_mocks',
                description: 'Add mocks for dependencies'
            };
        }
        // Default → refactor per leggibilità
        return {
            type: 'refactor',
            description: 'Refactor for clarity and maintainability'
        };
    }
    /**
     * 📝 Costruisce prompt contestuale per evoluzione
     */
    buildEvolutionPrompt(currentTest, context, strategy) {
        const dtos = context.relatedClasses.filter(c => c.type === 'dto');
        const services = context.relatedClasses.filter(c => c.type === 'service');
        const repositories = context.relatedClasses.filter(c => c.type === 'repository');
        const utils = context.relatedClasses.filter(c => c.type === 'util');
        const frameworks = context.testingFrameworks;
        let prompt = `You are an expert Java test engineer. Evolve this JUnit test class.

**CURRENT TEST**:
\`\`\`java
${currentTest}
\`\`\`

**TARGET CLASS BEING TESTED**:
- Name: ${context.targetClass.name}
- Methods: ${context.targetClass.methods.slice(0, 5).join(', ')}
- Fields: ${context.targetClass.fields.slice(0, 5).join(', ')}

`;
        // Aggiungi DTOs disponibili
        if (dtos.length > 0) {
            prompt += `**AVAILABLE DTOs** (use these in test data):\n`;
            dtos.slice(0, 3).forEach(dto => {
                prompt += `- ${dto.name}\n`;
                if (dto.content) {
                    prompt += `\`\`\`java\n${dto.content.substring(0, 500)}\n\`\`\`\n`;
                }
            });
            prompt += '\n';
        }
        // Aggiungi Services disponibili
        if (services.length > 0) {
            prompt += `**AVAILABLE SERVICES** (dependencies to mock):\n`;
            services.slice(0, 3).forEach(svc => {
                prompt += `- ${svc.name}\n`;
                if (svc.content) {
                    prompt += `\`\`\`java\n${svc.content.substring(0, 500)}\n\`\`\`\n`;
                }
            });
            prompt += '\n';
        }
        // Aggiungi Repositories disponibili
        if (repositories.length > 0) {
            prompt += `**AVAILABLE REPOSITORIES** (data access to mock):\n`;
            repositories.slice(0, 3).forEach(repo => {
                prompt += `- ${repo.name}\n`;
                if (repo.content) {
                    prompt += `\`\`\`java\n${repo.content.substring(0, 500)}\n\`\`\`\n`;
                }
            });
            prompt += '\n';
        }
        // Aggiungi Utils disponibili
        if (utils.length > 0) {
            prompt += `**AVAILABLE UTILITIES**:\n`;
            utils.slice(0, 2).forEach(util => {
                prompt += `- ${util.name}\n`;
            });
            prompt += '\n';
        }
        // Aggiungi framework disponibili
        if (frameworks.length > 0) {
            prompt += `**AVAILABLE TESTING FRAMEWORKS**: ${frameworks.join(', ')}\n\n`;
        }
        // Strategia specifica
        prompt += `**EVOLUTION STRATEGY**: ${strategy.type}\n`;
        prompt += `${strategy.description}\n\n`;
        switch (strategy.type) {
            case 'add_test_case':
                prompt += `Add 2-3 new @Test methods covering different scenarios.\n`;
                break;
            case 'improve_assertions':
                prompt += `Improve existing assertions to be more specific and use available DTOs.\n`;
                break;
            case 'add_edge_cases':
                prompt += `Add test methods for edge cases: null inputs, empty collections, boundary values.\n`;
                break;
            case 'add_mocks':
                prompt += `Add @Mock annotations and Mockito.when() stubs for dependencies.\n`;
                break;
            case 'refactor':
                prompt += `Refactor for better readability: extract setup methods, use @BeforeEach, clear naming.\n`;
                break;
        }
        prompt += `\n**INSTRUCTIONS**:
1. Keep all existing passing tests
2. Return the COMPLETE evolved test class
3. Use proper JUnit 5 annotations
4. Include imports
5. Return ONLY Java code, no explanations

Evolved test class:`;
        return prompt;
    }
    /**
     * 📋 Estrai lista di cambiamenti dalla risposta
     */
    extractChanges(response) {
        const changes = [];
        // Cerca pattern come "Added:", "Improved:", "Changed:"
        const patterns = [
            /Added[:\s]+([^\n]+)/gi,
            /Improved[:\s]+([^\n]+)/gi,
            /Changed[:\s]+([^\n]+)/gi,
            /New test[:\s]+([^\n]+)/gi
        ];
        for (const pattern of patterns) {
            const matches = response.matchAll(pattern);
            for (const match of matches) {
                changes.push(match[1].trim());
            }
        }
        // Se non trova pattern, ritorna placeholder
        if (changes.length === 0) {
            changes.push('Test class evolved with improvements');
        }
        return changes;
    }
}
exports.TestEvolver = TestEvolver;
//# sourceMappingURL=test-evolver.js.map