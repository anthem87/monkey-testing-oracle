"use strict";
/**
 * ================================================================
 * GENE MARKER SYSTEM - Individual Test Tracking
 * ================================================================
 *
 * Quando tutti i test sono in un unico file, serve un sistema per:
 * 1. Identificare univocamente ogni metodo test
 * 2. Tracciare mutazioni/modifiche (hash del contenuto)
 * 3. Preservare metadata evolutivi (generation, role, fitness)
 * 4. Ricostruire individui dopo hardening/patching AI
 *
 * Formato:
 * ```java
 * /* {
 *   "id": "a94f3c12",
 *   "generation": 3,
 *   "role": "explorer",
 *   "fitness": 0.421,
 *   "hash": "f01a7f9b1b3c6"
 * } *\/
 * @Test
 * void testMethod() { ... }
 * ```
 * ================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateGeneId = generateGeneId;
exports.calculateMethodHash = calculateMethodHash;
exports.extractGeneMarker = extractGeneMarker;
exports.addGeneMarker = addGeneMarker;
exports.extractTestsFromFile = extractTestsFromFile;
exports.reconstructTestsFromFile = reconstructTestsFromFile;
exports.hasMethodChanged = hasMethodChanged;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate unique gene ID (UUID v4 short)
 */
function generateGeneId() {
    return crypto_1.default.randomUUID().substring(0, 8);
}
/**
 * Calculate hash of method body (for change detection)
 */
function calculateMethodHash(methodCode) {
    // Normalize whitespace for stable hashing
    const normalized = methodCode
        .replace(/\s+/g, ' ')
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove gene markers
        .trim();
    return crypto_1.default.createHash('sha1')
        .update(normalized)
        .digest('hex')
        .substring(0, 12);
}
/**
 * Extract gene marker from method code
 */
function extractGeneMarker(methodCode) {
    const markerRegex = /\/\*\s*(\{[\s\S]*?\})\s*\*\//;
    const match = methodCode.match(markerRegex);
    if (!match) {
        return null;
    }
    try {
        return JSON.parse(match[1]);
    }
    catch (err) {
        console.warn(`Failed to parse gene marker: ${err}`);
        return null;
    }
}
/**
 * Add gene marker to test method
 */
function addGeneMarker(test, marker) {
    // Generate ID if not provided
    const id = marker.id || test.metadata.geneId || generateGeneId();
    // Calculate hash of current code
    const hash = calculateMethodHash(test.code);
    // Build complete marker
    const completeMarker = {
        id,
        generation: marker.generation ?? test.metadata.generation,
        role: marker.role ?? test.metadata.role,
        fitness: marker.fitness,
        mutationType: marker.mutationType ?? test.metadata.mutationType,
        hash,
        parentId: marker.parentId ?? test.metadata.parentId
    };
    // Format as JSON comment
    const markerComment = `/* ${JSON.stringify(completeMarker, null, 0)} */\n`;
    // Extract method body (remove existing marker if present)
    let methodBody = test.code.replace(/\/\*[\s\S]*?\*\/\s*/, '').trim();
    // Add marker before @Test annotation
    if (methodBody.includes('@Test')) {
        methodBody = methodBody.replace(/(@Test)/, `${markerComment}$1`);
    }
    else {
        methodBody = markerComment + methodBody;
    }
    return methodBody;
}
/**
 * Extract all tests from merged file with gene markers
 */
function extractTestsFromFile(fileContent) {
    const tests = [];
    // Regex to match: gene marker + @Test + method
    const testRegex = /\/\*\s*(\{[\s\S]*?\})\s*\*\/\s*@Test[\s\S]*?(?:public|private|protected)?\s*void\s+(\w+)\s*\([^)]*\)[\s\S]*?\{([\s\S]*?)\n\s*\}/gm;
    let match;
    while ((match = testRegex.exec(fileContent)) !== null) {
        try {
            const marker = JSON.parse(match[1]);
            const methodName = match[2];
            const code = match[0]; // Full method including marker
            tests.push({ marker, code, methodName });
        }
        catch (err) {
            console.warn(`Failed to parse test method: ${err}`);
        }
    }
    return tests;
}
/**
 * Reconstruct GeneratedTest[] from hardened file
 */
function reconstructTestsFromFile(fileContent, targetFile) {
    const extractedTests = extractTestsFromFile(fileContent);
    return extractedTests.map(({ marker, code, methodName }) => ({
        name: methodName,
        code,
        input: '', // Lost after merge, could regenerate via AI
        expected: '', // Lost after merge, could regenerate via AI
        metadata: {
            targetFile,
            origin: 'repaired',
            generation: marker.generation,
            geneId: marker.id,
            geneHash: marker.hash,
            role: marker.role,
            mutationType: marker.mutationType,
            parentId: marker.parentId
        }
    }));
}
/**
 * Check if method has been modified (hash changed)
 */
function hasMethodChanged(originalTest, patchedCode) {
    const originalHash = originalTest.metadata.geneHash || calculateMethodHash(originalTest.code);
    const newHash = calculateMethodHash(patchedCode);
    return originalHash !== newHash;
}
//# sourceMappingURL=gene-marker.js.map