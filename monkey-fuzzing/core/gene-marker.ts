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

import crypto from 'crypto';
import { GeneratedTest } from './types.js';

export interface GeneMarker {
  id: string;
  generation?: number;
  role?: 'fixer' | 'explorer' | 'breaker';
  fitness?: number;
  mutationType?: string;
  hash?: string;
  parentId?: string;
}

/**
 * Generate unique gene ID (UUID v4 short)
 */
export function generateGeneId(): string {
  return crypto.randomUUID().substring(0, 8);
}

/**
 * Calculate hash of method body (for change detection)
 */
export function calculateMethodHash(methodCode: string): string {
  // Normalize whitespace for stable hashing
  const normalized = methodCode
    .replace(/\s+/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove gene markers
    .trim();
  
  return crypto.createHash('sha1')
    .update(normalized)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Extract gene marker from method code
 */
export function extractGeneMarker(methodCode: string): GeneMarker | null {
  const markerRegex = /\/\*\s*(\{[\s\S]*?\})\s*\*\//;
  const match = methodCode.match(markerRegex);
  
  if (!match) {
    return null;
  }
  
  try {
    return JSON.parse(match[1]);
  } catch (err) {
    console.warn(`Failed to parse gene marker: ${err}`);
    return null;
  }
}

/**
 * Add gene marker to test method
 */
export function addGeneMarker(test: GeneratedTest, marker: Partial<GeneMarker>): string {
  // Generate ID if not provided
  const id = marker.id || test.metadata.geneId || generateGeneId();
  
  // Calculate hash of current code
  const hash = calculateMethodHash(test.code);
  
  // Build complete marker
  const completeMarker: GeneMarker = {
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
  } else {
    methodBody = markerComment + methodBody;
  }
  
  return methodBody;
}

/**
 * Extract all tests from merged file with gene markers
 */
export function extractTestsFromFile(fileContent: string): Array<{
  marker: GeneMarker;
  code: string;
  methodName: string;
}> {
  const tests: Array<{ marker: GeneMarker; code: string; methodName: string }> = [];
  
  // Regex to match: gene marker + @Test + method
  const testRegex = /\/\*\s*(\{[\s\S]*?\})\s*\*\/\s*@Test[\s\S]*?(?:public|private|protected)?\s*void\s+(\w+)\s*\([^)]*\)[\s\S]*?\{([\s\S]*?)\n\s*\}/gm;
  
  let match;
  while ((match = testRegex.exec(fileContent)) !== null) {
    try {
      const marker = JSON.parse(match[1]);
      const methodName = match[2];
      const code = match[0]; // Full method including marker
      
      tests.push({ marker, code, methodName });
    } catch (err) {
      console.warn(`Failed to parse test method: ${err}`);
    }
  }
  
  return tests;
}

/**
 * Reconstruct GeneratedTest[] from hardened file
 */
export function reconstructTestsFromFile(
  fileContent: string,
  targetFile: string
): GeneratedTest[] {
  const extractedTests = extractTestsFromFile(fileContent);
  
  return extractedTests.map(({ marker, code, methodName }) => ({
    name: methodName,
    code,
    input: '', // Lost after merge, could regenerate via AI
    expected: '', // Lost after merge, could regenerate via AI
    metadata: {
      targetFile,
      origin: 'repaired' as const,
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
export function hasMethodChanged(
  originalTest: GeneratedTest,
  patchedCode: string
): boolean {
  const originalHash = originalTest.metadata.geneHash || calculateMethodHash(originalTest.code);
  const newHash = calculateMethodHash(patchedCode);
  
  return originalHash !== newHash;
}
