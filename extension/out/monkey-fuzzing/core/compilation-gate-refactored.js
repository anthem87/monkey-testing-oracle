"use strict";
/**
 * ================================================================
 * COMPILATION GATE - DETERMINISTIC REPAIR ORCHESTRATOR
 * ================================================================
 *
 * Il "cancello" tra exploration e exploitation.
 *
 * Workflow:
 * 1. Compila test (Maven/Gradle)
 * 2. Se fallisce → estrai errori (deterministico via BuildToolAdapter)
 * 3. Check cache → se fix già noto, applicalo
 * 4. Se no cache → chiedi ad AI fix chirurgico
 * 5. Applica fix e ricompila
 * 6. Ripeti fino a MAX_ATTEMPTS o success
 * 7. Se irrecuperabile → return null (test viene scartato)
 *
 * Key Point: Separa EXPLORATION (generazione creativa) da
 * HARDENING (repair deterministico + AI surgical fix)
 *
 * ================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompilationGate = void 0;
const gene_marker_js_1 = require("./gene-marker.js");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class CompilationGate {
    constructor(buildTool, repairOracle, fixCache, projectRoot, maxAttempts = 3) {
        this.buildTool = buildTool;
        this.repairOracle = repairOracle;
        this.fixCache = fixCache;
        this.projectRoot = projectRoot;
        this.maxAttempts = maxAttempts;
    }
    /**
     * 🔥 HARDENING PHASE - Forza compilazione del test
     *
     * ⚠️ DEPRECATED: This method works on single test, use hardenPopulation() for batch
     *
     * Returns null se test irrecuperabile dopo MAX_ATTEMPTS
     */
    async harden(test, testFilePath) {
        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  🔧 COMPILATION GATE - Single Test Hardening (DEPRECATED)     ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
        console.log(`   ⚠️  Use hardenPopulation() for batch test hardening`);
        console.log(`   File: ${testFilePath}`);
        console.log(`   Max Attempts: ${this.maxAttempts}`);
        let attempts = 0;
        let fixesApplied = 0;
        let cacheHits = 0;
        let lastErrors = [];
        // ✅ Read existing file content (if exists)
        let currentFileContent;
        try {
            currentFileContent = await fs_1.promises.readFile(testFilePath, 'utf8');
            console.log(`   ✅ Existing file loaded (${currentFileContent.length} chars)`);
        }
        catch (err) {
            // File doesn't exist yet → create initial version
            currentFileContent = test.code;
            await this.writeTestFile(testFilePath, test);
            console.log(`   ✅ Initial file created`);
        }
        while (attempts < this.maxAttempts) {
            attempts++;
            console.log(`\n   [Attempt ${attempts}/${this.maxAttempts}] Compiling...`);
            // 1. File già sul disco (già scritto nel loop precedente o appena creato)
            // 2. Compile con BuildToolAdapter
            const buildResult = await this.buildTool.compile(this.projectRoot);
            if (buildResult.success) {
                console.log(`   [Attempt ${attempts}] ✅ COMPILATION SUCCESS!`);
                // ✅ Return test with updated code (from file)
                const successTest = {
                    ...test,
                    code: currentFileContent,
                    metadata: {
                        ...test.metadata,
                        repairAttempts: attempts,
                        lastRepairReason: `Compiled successfully after ${attempts} attempt(s)`
                    }
                };
                return {
                    success: true,
                    test: successTest,
                    attempts,
                    fixesApplied,
                    cacheHits,
                    errors: [],
                    reason: `Compiled successfully after ${attempts} attempt(s)`
                };
            }
            // 3. Parse errori con symbol metrics
            if (!buildResult.symbolMetrics || buildResult.symbolMetrics.unresolvedSymbols.length === 0) {
                console.warn(`   [Attempt ${attempts}] ⚠️  No parseable errors found`);
                lastErrors = [];
                const failedTest = {
                    ...test,
                    code: currentFileContent,
                    metadata: {
                        ...test.metadata,
                        repairAttempts: attempts,
                        lastRepairReason: 'Compilation failed but no parseable errors'
                    }
                };
                return {
                    success: false,
                    test: failedTest,
                    attempts,
                    fixesApplied,
                    cacheHits,
                    errors: [],
                    reason: 'Compilation failed but no parseable errors'
                };
            }
            lastErrors = buildResult.symbolMetrics.unresolvedSymbols;
            console.log(`   [Attempt ${attempts}] Found ${lastErrors.length} symbol error(s)`);
            // 4. Prendi primo errore (fix one by one)
            const error = lastErrors[0];
            console.log(`   [Attempt ${attempts}] Fixing: ${error.errorType} - ${error.symbol || 'N/A'}`);
            // 5. CHECK CACHE prima di chiedere ad AI
            const cachedFix = this.fixCache.get(error);
            let patchedContent;
            if (cachedFix && cachedFix.suggestedFix) {
                console.log(`   [Attempt ${attempts}] 💾 Using cached fix`);
                cacheHits++;
                // ✅ APPLY CACHED PATCH to current file content
                patchedContent = cachedFix.suggestedFix; // Cache stores full patched content
            }
            else {
                // 6. GATHER CONTEXT per AI fix
                console.log(`   [Attempt ${attempts}] 🔍 Gathering fix context...`);
                const context = await this.buildTool.gatherFixContext?.(this.projectRoot, error) || {
                    error
                };
                // Add current file content to context (for AI to generate patch)
                context.testFileContent = currentFileContent;
                // 7. CHIEDI AD AI fix chirurgico (AI returns PATCHED file content)
                console.log(`   [Attempt ${attempts}] 🤖 Requesting AI patch...`);
                // ⚠️ AIRepairOracle.fix() needs to return FULL patched file, not GeneratedTest
                // We'll create a temporary GeneratedTest wrapper for the API
                const tempTest = {
                    name: test.name,
                    code: currentFileContent, // ✅ Pass CURRENT file content
                    input: test.input,
                    expected: test.expected,
                    metadata: test.metadata
                };
                const fixResult = await this.repairOracle.fix(tempTest, context);
                if (!fixResult.success || !fixResult.fixedCode) {
                    console.warn(`   [Attempt ${attempts}] ❌ AI fix failed: ${fixResult.error || 'unknown'}`);
                    continue; // Try next attempt
                }
                patchedContent = fixResult.fixedCode;
                // 8. CACHE fix se successo
                this.fixCache.set(error, {
                    suggestedFix: patchedContent, // Cache full patched content
                    pomChanges: fixResult.pomChanges,
                    needsDependency: fixResult.needsDependency
                });
            }
            // 9. WRITE patched content back to file
            currentFileContent = patchedContent; // Update for next iteration
            await fs_1.promises.writeFile(testFilePath, patchedContent, 'utf8');
            fixesApplied++;
            console.log(`   [Attempt ${attempts}] ✅ Patch applied (${fixesApplied} total)`);
            // 10. Loop → ricompila con fix applicato
        }
        // MAX_ATTEMPTS raggiunto → test irrecuperabile
        console.log(`\n   [CompilationGate] ❌ FAILED: Max attempts (${this.maxAttempts}) reached`);
        console.log(`   [CompilationGate] Fixes applied: ${fixesApplied}, Cache hits: ${cacheHits}`);
        console.log(`   [CompilationGate] Final errors: ${lastErrors.length}`);
        const deadTest = {
            ...test,
            code: currentFileContent,
            metadata: {
                ...test.metadata,
                repairAttempts: attempts,
                lastRepairReason: `Failed after ${attempts} attempts (${lastErrors.length} unresolved errors)`
            }
        };
        return {
            success: false,
            test: deadTest,
            attempts,
            fixesApplied,
            cacheHits,
            errors: lastErrors,
            reason: `Failed after ${attempts} attempts (${lastErrors.length} unresolved errors)`
        };
    }
    /**
     * Write test to file (per compilazione)
     */
    async writeTestFile(filePath, test) {
        const dir = path_1.default.dirname(filePath);
        await fs_1.promises.mkdir(dir, { recursive: true });
        await fs_1.promises.writeFile(filePath, test.code, 'utf8');
    }
    /**
     * 🔥 Batch hardening di una popolazione
     *
     * 🧬 GENE MARKER SYSTEM: Ogni test riceve un ID univoco come commento
     *
     * Workflow:
     * 1. Add gene markers to all tests (ID, generation, role, hash)
     * 2. Write complete file with ALL tests + markers
     * 3. Compile → fix errors with AI
     * 4. Reconstruct individual tests from hardened file using gene markers
     * 5. Return viable tests (ALL or NONE - file-level compilation)
     *
     * Returns solo test che compilano
     */
    async hardenPopulation(tests, targetTestFilePath // ✅ Path completo al file di test (es: .../DeskJwtValidationFilterTest.java)
    ) {
        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  🏭 BATCH HARDENING - ${tests.length} tests as SINGLE FILE with GENE MARKERS ║`);
        console.log(`║  Target File: ${path_1.default.basename(targetTestFilePath).padEnd(42)} ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
        // 1. Add gene markers to all tests
        const testsWithMarkers = tests.map(test => {
            // Ensure geneId exists
            if (!test.metadata.geneId) {
                test.metadata.geneId = (0, gene_marker_js_1.generateGeneId)();
            }
            return {
                ...test,
                code: (0, gene_marker_js_1.addGeneMarker)(test, {
                    id: test.metadata.geneId,
                    generation: test.metadata.generation,
                    role: test.metadata.role,
                    mutationType: test.metadata.mutationType,
                    parentId: test.metadata.parentId
                })
            };
        });
        console.log(`   ✅ Added gene markers to ${testsWithMarkers.length} tests`);
        // 2. Build complete file with all methods
        const completeFileContent = this.buildCompleteTestFile(testsWithMarkers);
        await fs_1.promises.writeFile(targetTestFilePath, completeFileContent, 'utf8');
        console.log(`   ✅ Written file (${completeFileContent.length} chars)`);
        // 3. Hardening loop
        let currentFileContent = completeFileContent;
        let attempts = 0;
        let fixesApplied = 0;
        let cacheHits = 0;
        while (attempts < this.maxAttempts) {
            attempts++;
            console.log(`\n   [Attempt ${attempts}/${this.maxAttempts}] Compiling whole file...`);
            const buildResult = await this.buildTool.compile(this.projectRoot);
            if (buildResult.success) {
                console.log(`   [Attempt ${attempts}] ✅ WHOLE FILE COMPILED!`);
                // 4. Reconstruct tests from hardened file using gene markers
                const reconstructedTests = (0, gene_marker_js_1.reconstructTestsFromFile)(currentFileContent, tests[0].metadata.targetFile);
                console.log(`   ✅ Reconstructed ${reconstructedTests.length} tests from hardened file`);
                console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
                console.log(`║  📊 HARDENING COMPLETE                                        ║`);
                console.log(`╠═══════════════════════════════════════════════════════════════╣`);
                console.log(`║  Total Tests:      ${tests.length.toString().padStart(4)}                                      ║`);
                console.log(`║  Viable (✅):       ${reconstructedTests.length.toString().padStart(4)}  (100.0%)                                ║`);
                console.log(`║  Dead (❌):         ${(0).toString().padStart(4)}  (0.0%)                                  ║`);
                console.log(`║  Total Attempts:   ${attempts.toString().padStart(4)}                                      ║`);
                console.log(`║  Fixes Applied:    ${fixesApplied.toString().padStart(4)}                                      ║`);
                console.log(`║  Cache Hits:       ${cacheHits.toString().padStart(4)}  (${fixesApplied > 0 ? ((cacheHits / fixesApplied) * 100).toFixed(1) : '0.0'}%)                        ║`);
                console.log(`╚═══════════════════════════════════════════════════════════════╝`);
                return {
                    viable: reconstructedTests,
                    dead: [],
                    stats: {
                        total: tests.length,
                        success: reconstructedTests.length,
                        failed: 0,
                        totalAttempts: attempts,
                        totalFixes: fixesApplied,
                        totalCacheHits: cacheHits
                    }
                };
            }
            // Parse errors
            if (!buildResult.symbolMetrics || buildResult.symbolMetrics.unresolvedSymbols.length === 0) {
                console.warn(`   [Attempt ${attempts}] ⚠️  No parseable errors`);
                break;
            }
            const errors = buildResult.symbolMetrics.unresolvedSymbols;
            console.log(`   [Attempt ${attempts}] Found ${errors.length} errors, fixing...`);
            // Fix first error
            const error = errors[0];
            console.log(`   [Attempt ${attempts}] Fixing: ${error.errorType} - ${error.symbol || 'N/A'}`);
            // Check cache
            const cachedFix = this.fixCache.get(error);
            let patchedContent;
            if (cachedFix && cachedFix.suggestedFix) {
                console.log(`   [Attempt ${attempts}] 💾 Using cached fix`);
                cacheHits++;
                patchedContent = cachedFix.suggestedFix;
            }
            else {
                // Gather context
                const context = await this.buildTool.gatherFixContext?.(this.projectRoot, error) || { error };
                context.testFileContent = currentFileContent;
                // Request AI fix
                const tempTest = {
                    name: `WholeFile_${tests.length}methods`,
                    code: currentFileContent,
                    input: '',
                    expected: '',
                    metadata: { targetFile: targetTestFilePath, origin: 'mutated' }
                };
                const fixResult = await this.repairOracle.fix(tempTest, context);
                if (!fixResult.success || !fixResult.fixedCode) {
                    console.warn(`   [Attempt ${attempts}] ❌ AI fix failed`);
                    continue;
                }
                patchedContent = fixResult.fixedCode;
                // Cache fix
                this.fixCache.set(error, {
                    suggestedFix: patchedContent,
                    pomChanges: fixResult.pomChanges,
                    needsDependency: fixResult.needsDependency
                });
            }
            // Apply patch
            currentFileContent = patchedContent;
            await fs_1.promises.writeFile(targetTestFilePath, patchedContent, 'utf8');
            fixesApplied++;
            console.log(`   [Attempt ${attempts}] ✅ Patch applied (${fixesApplied} total)`);
        }
        // MAX_ATTEMPTS reached → all tests are dead
        console.log(`\n   ❌ Failed after ${attempts} attempts`);
        console.log(`\n╔═══════════════════════════════════════════════════════════════╗`);
        console.log(`║  📊 HARDENING FAILED                                          ║`);
        console.log(`╠═══════════════════════════════════════════════════════════════╣`);
        console.log(`║  Total Tests:      ${tests.length.toString().padStart(4)}                                      ║`);
        console.log(`║  Viable (✅):       ${(0).toString().padStart(4)}  (0.0%)                                  ║`);
        console.log(`║  Dead (❌):         ${tests.length.toString().padStart(4)}  (100.0%)                                ║`);
        console.log(`║  Total Attempts:   ${attempts.toString().padStart(4)}                                      ║`);
        console.log(`║  Fixes Applied:    ${fixesApplied.toString().padStart(4)}                                      ║`);
        console.log(`║  Cache Hits:       ${cacheHits.toString().padStart(4)}  (${fixesApplied > 0 ? ((cacheHits / fixesApplied) * 100).toFixed(1) : '0.0'}%)                        ║`);
        console.log(`╚═══════════════════════════════════════════════════════════════╝`);
        return {
            viable: [],
            dead: tests,
            stats: {
                total: tests.length,
                success: 0,
                failed: tests.length,
                totalAttempts: attempts,
                totalFixes: fixesApplied,
                totalCacheHits: cacheHits
            }
        };
    }
    /**
     * Build complete Java test file with all methods (WITH GENE MARKERS)
     */
    buildCompleteTestFile(tests) {
        // Extract class name from first test
        const firstTestCode = tests[0].code;
        const classMatch = firstTestCode.match(/public\s+class\s+(\w+)/);
        const className = classMatch ? classMatch[1] : 'GeneratedTest';
        // Extract package declaration
        const packageMatch = firstTestCode.match(/package\s+[\w.]+;/);
        const packageDecl = packageMatch ? packageMatch[0] : '';
        // Collect all unique imports
        const importsSet = new Set();
        for (const test of tests) {
            const importMatches = test.code.matchAll(/import\s+[\w.]+;/g);
            for (const match of importMatches) {
                importsSet.add(match[0]);
            }
        }
        // Extract test methods from each test (already have gene markers)
        const methods = tests.map(test => {
            // Extract method body (everything after imports/class declaration)
            const methodMatch = test.code.match(/@Test[\s\S]*$/);
            return methodMatch ? methodMatch[0].trim() : test.code;
        });
        // Build complete file
        return `${packageDecl}

${Array.from(importsSet).join('\n')}

public class ${className} {

${methods.join('\n\n')}

}
`;
    }
}
exports.CompilationGate = CompilationGate;
//# sourceMappingURL=compilation-gate-refactored.js.map