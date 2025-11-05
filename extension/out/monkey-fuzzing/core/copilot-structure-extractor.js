"use strict";
/**
 * ===========================================================
 * COPILOT STRUCTURE EXTRACTOR
 * ===========================================================
 * Uses Copilot AI to extract test structure in language-agnostic way
 * Replaces fragile regex parsing with semantic understanding
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTestStructure = extractTestStructure;
exports.extractAndMergeStructures = extractAndMergeStructures;
exports.buildTestClassFromStructure = buildTestClassFromStructure;
/**
 * 🧠 Extract test structure using Copilot AI
 * Language-agnostic, semantically aware parsing
 */
async function extractTestStructure(testCode, language, copilotAdapter) {
    if (!copilotAdapter) {
        console.warn('⚠️ No Copilot adapter available, falling back to regex parsing');
        return null;
    }
    const prompt = `
You are a code parser. Extract the structure of this ${language} test class and return ONLY valid JSON.

Test code:
\`\`\`${language}
${testCode}
\`\`\`

Return EXACTLY this JSON structure (no markdown, no explanation):
{
  "className": "TestClassName",
  "package": "com.example.package",
  "imports": [
    "import org.junit.jupiter.api.Test;",
    "import static org.mockito.Mockito.*;"
  ],
  "fields": [
    {
      "annotation": "@Mock",
      "type": "JwtDecoder",
      "name": "jwtDecoder",
      "initializer": null
    },
    {
      "annotation": null,
      "type": "DeskJwtValidationFilter",
      "name": "filter",
      "initializer": null
    }
  ],
  "setupMethods": [
    {
      "annotation": "@BeforeEach",
      "name": "setUp",
      "body": "MockitoAnnotations.openMocks(this);\\nfilter = new DeskJwtValidationFilter(...);"
    }
  ],
  "testMethods": [
    {
      "name": "testValidJwt",
      "signature": "void testValidJwt() throws Exception",
      "body": "// test body here"
    }
  ]
}

CRITICAL: 
- Return ONLY the JSON object
- NO markdown code blocks
- NO explanations
- Escape newlines as \\n in body strings
- Extract ALL test methods (@Test annotated)
- Extract ALL setup/teardown methods (@BeforeEach, @AfterEach, @BeforeAll, @AfterAll)
- Include BOTH @Mock fields AND regular private fields
`;
    try {
        console.log('🧠 Asking Copilot to extract test structure...');
        const response = await copilotAdapter.generate(prompt);
        // Extract JSON from possible markdown wrapper
        const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) ||
            response.match(/(\{[\s\S]*\})/);
        if (!jsonMatch) {
            console.error('❌ Copilot did not return valid JSON');
            console.log('Response:', response.substring(0, 200));
            return null;
        }
        const structure = JSON.parse(jsonMatch[1]);
        console.log(`✅ Copilot extracted structure: ${structure.testMethods?.length || 0} tests, ${structure.setupMethods?.length || 0} setup methods`);
        return structure;
    }
    catch (error) {
        console.error('❌ Copilot structure extraction failed:', error);
        return null;
    }
}
/**
 * 🔄 Extract and merge structures from multiple test files
 */
async function extractAndMergeStructures(testCodes, language, copilotAdapter) {
    if (testCodes.length === 0)
        return null;
    // Extract structure from first test (for class metadata)
    const firstStructure = await extractTestStructure(testCodes[0].code, language, copilotAdapter);
    if (!firstStructure) {
        console.warn('⚠️ Failed to extract structure from first test, using fallback');
        return null;
    }
    // Merge all test methods from all files
    const allTestMethods = [];
    const allSetupMethods = new Map();
    const allFields = new Map();
    const allImports = new Set();
    for (const testCode of testCodes) {
        const structure = await extractTestStructure(testCode.code, language, copilotAdapter);
        if (!structure)
            continue;
        // Merge imports
        structure.imports.forEach(imp => allImports.add(imp));
        // Merge fields (deduplicate by name)
        structure.fields.forEach(field => {
            if (!allFields.has(field.name)) {
                allFields.set(field.name, field);
            }
        });
        // Merge setup methods (deduplicate by name)
        structure.setupMethods.forEach(method => {
            if (!allSetupMethods.has(method.name)) {
                allSetupMethods.set(method.name, method);
            }
        });
        // Merge test methods (preserve all with metadata)
        structure.testMethods.forEach(method => {
            allTestMethods.push({
                ...method,
                origin: testCode.origin,
                generation: testCode.generation
            });
        });
    }
    return {
        className: firstStructure.className,
        package: firstStructure.package,
        imports: Array.from(allImports),
        fields: Array.from(allFields.values()),
        setupMethods: Array.from(allSetupMethods.values()),
        testMethods: allTestMethods
    };
}
/**
 * 🏗️ Build test class from Copilot-extracted structure
 */
function buildTestClassFromStructure(structure, language) {
    if (language === 'java') {
        return buildJavaTestClass(structure);
    }
    else if (language === 'python') {
        return buildPythonTestClass(structure);
    }
    else if (language === 'typescript' || language === 'javascript') {
        return buildTypeScriptTestClass(structure);
    }
    throw new Error(`Unsupported language: ${language}`);
}
/**
 * 🔨 Build Java test class
 */
function buildJavaTestClass(structure) {
    const { className, package: pkg, imports, fields, setupMethods, testMethods } = structure;
    const importLines = imports.join('\n');
    const fieldLines = fields.map(f => {
        const annotation = f.annotation ? `    ${f.annotation}\n` : '';
        const initializer = f.initializer ? ` = ${f.initializer}` : '';
        return `${annotation}    private ${f.type} ${f.name}${initializer};`;
    }).join('\n\n');
    const setupLines = setupMethods.map(m => {
        const bodyLines = m.body.split('\n').map(line => `        ${line}`).join('\n');
        return `    ${m.annotation}
    void ${m.name}() {
${bodyLines}
    }`;
    }).join('\n\n');
    const testLines = testMethods.map(t => {
        const comment = t.origin ? `    /* ${t.origin} - Gen ${t.generation || 0} */\n` : '';
        const bodyLines = t.body.split('\n').map(line => `        ${line}`).join('\n');
        return `${comment}    @Test
    ${t.signature} {
${bodyLines}
    }`;
    }).join('\n\n');
    return `/* Generated by Monkey-Fuzzingo - Evolutionary Test Suite */
package ${pkg};

${importLines}

class ${className} {

${fieldLines}

${setupLines}

${testLines}
}
`;
}
/**
 * 🐍 Build Python test class
 */
function buildPythonTestClass(structure) {
    const { className, imports, setupMethods, testMethods } = structure;
    const importLines = imports.join('\n');
    const setupLines = setupMethods.map(m => {
        const bodyLines = m.body.split('\n').map(line => `        ${line}`).join('\n');
        return `    def ${m.name}(self):
${bodyLines}`;
    }).join('\n\n');
    const testLines = testMethods.map(t => {
        const comment = t.origin ? `    # ${t.origin} - Gen ${t.generation || 0}\n` : '';
        const bodyLines = t.body.split('\n').map(line => `        ${line}`).join('\n');
        return `${comment}    def ${t.name}(self):
${bodyLines}`;
    }).join('\n\n');
    return `# Generated by Monkey-Fuzzingo - Evolutionary Test Suite
${importLines}

class ${className}:

${setupLines}

${testLines}
`;
}
/**
 * 📘 Build TypeScript test class
 */
function buildTypeScriptTestClass(structure) {
    const { className, imports, fields, setupMethods, testMethods } = structure;
    const importLines = imports.join('\n');
    const fieldLines = fields.map(f => {
        const initializer = f.initializer ? ` = ${f.initializer}` : '';
        return `  private ${f.name}: ${f.type}${initializer};`;
    }).join('\n');
    const setupLines = setupMethods.map(m => {
        const bodyLines = m.body.split('\n').map(line => `    ${line}`).join('\n');
        return `  ${m.name}() {
${bodyLines}
  }`;
    }).join('\n\n');
    const testLines = testMethods.map(t => {
        const comment = t.origin ? `  // ${t.origin} - Gen ${t.generation || 0}\n` : '';
        const bodyLines = t.body.split('\n').map(line => `    ${line}`).join('\n');
        return `${comment}  ${t.signature} {
${bodyLines}
  }`;
    }).join('\n\n');
    return `/* Generated by Monkey-Fuzzingo - Evolutionary Test Suite */
${importLines}

class ${className} {

${fieldLines}

${setupLines}

${testLines}
}
`;
}
//# sourceMappingURL=copilot-structure-extractor.js.map