"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubCopilotAPI = exports.CopilotAnalyzer = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class CopilotAnalyzer {
    constructor(copilotAPI) {
        this.copilotAPI = copilotAPI;
    }
    /**
     * 🎯 NEW WORKFLOW (100% Copilot, NO regex/parsing):
     * 1. Read Java class from absolute path
     * 2. Ask Copilot to extract package AND find pom.xml path
     * 3. Analyze via Copilot LLM (NO parser/AST/regex)
     * 4. Return analysis with projectRoot
     */
    async analyzeFile(absolutePath) {
        console.log(`🔍 Analyzing: ${absolutePath}`);
        const content = await fs_1.promises.readFile(absolutePath, 'utf8');
        console.log(`✅ Read ${content.length} bytes`);
        // Find project root by locating src/main/java
        const projectRoot = await this.findProjectRoot(absolutePath);
        console.log(`📦 Module root: ${projectRoot}`);
        // 🤖 Ask Copilot for package and className via structured JSON
        const locationPrompt = `Analyze this Java source file and return ONLY valid JSON:

${content}

Return JSON format:
{
  "package": "com.example.package",
  "className": "ClassName"
}`;
        const locationRaw = await this.copilotAPI.generate(locationPrompt);
        // Extract package via Copilot - be VERY explicit
        const packagePrompt = `Look at this JSON response and return ONLY the package name as plain text (no code, no JSON, no quotes):

${locationRaw}

Example response: it.aicof.desk.security.filter

Your response (package name only):`;
        let packageName = (await this.copilotAPI.generate(packagePrompt)).trim();
        // Clean up common Copilot artifacts
        packageName = packageName
            .replace(/^```[\w]*\n?/g, '') // Remove code block markers
            .replace(/\n?```$/g, '')
            .replace(/^["'`]/g, '') // Remove quotes
            .replace(/["'`]$/g, '')
            .replace(/^package\s+/g, '') // Remove 'package' keyword
            .replace(/;$/g, '') // Remove semicolon
            .split('\n')[0] // Take first line only
            .trim();
        console.log(`📋 Package: ${packageName || 'default'}`);
        // 🤖 STEP 2: Analyze class structure via Copilot
        const analysisPrompt = `Analyze this Java class. Extract methods, dependencies, and test scenarios.

**RESPOND ONLY WITH JSON**:
{
  "className": "ClassName",
  "package": "${packageName}",
  "methods": [
    {
      "name": "methodName",
      "parameters": ["Type paramName"],
      "returnType": "Type",
      "testScenarios": ["normal case", "edge case", "error case"]
    }
  ],
  "dependencies": ["import statements"],
  "language": "java"
}

Code:
${content}
`;
        const analysisRaw = await this.copilotAPI.generate(analysisPrompt);
        // 🤖 Let Copilot extract fields from its own response
        const classNamePrompt = `Extract the className from this JSON response:

${analysisRaw}

Return ONLY the class name:`;
        const className = (await this.copilotAPI.generate(classNamePrompt)).trim();
        return {
            className,
            package: packageName,
            methods: [], // Copilot will generate tests directly
            dependencies: [],
            language: 'java',
            sourceFile: absolutePath,
            projectRoot
        };
    }
    /**
     * Find Maven module root by locating src/main/java in path
     * For multi-module projects, returns the module directory (where pom.xml is)
     *
     * Example:
     *   Input:  /project/module/src/main/java/com/example/MyClass.java
     *   Output: /project/module
     */
    async findProjectRoot(startPath) {
        // Normalize path separators (Windows uses backslash)
        const normalizedPath = startPath.replace(/\\/g, '/');
        // Look for src/main/java in the path
        const srcMainJavaIndex = normalizedPath.indexOf('src/main/java');
        if (srcMainJavaIndex === -1) {
            throw new Error(`Path does not contain 'src/main/java': ${startPath}`);
        }
        // Extract everything before src/main/java (that's the module root)
        const moduleRoot = normalizedPath.substring(0, srcMainJavaIndex);
        // Remove trailing slash if present
        const cleanRoot = moduleRoot.replace(/\/$/, '');
        // Convert back to Windows path if original was Windows
        const finalRoot = startPath.includes('\\') ? cleanRoot.replace(/\//g, '\\') : cleanRoot;
        // Verify pom.xml exists at this location
        const pomPath = path_1.default.join(finalRoot, 'pom.xml');
        try {
            await fs_1.promises.access(pomPath);
            return finalRoot; // Found pom.xml at module root
        }
        catch {
            throw new Error(`No pom.xml found at expected module root: ${finalRoot}`);
        }
    }
    /**
     * Generate initial test suite via Copilot
     * Returns ONE SINGLE @Test METHOD (not a class!)
     * The method will be aggregated with others into a class later
     */
    async generateInitialTests(analysis) {
        const prompt = `Generate ONE SINGLE JUnit 5 test method for this Java class.

**CRITICAL REQUIREMENTS**:
1. Generate ONLY the method body (start with @Test, end with closing })
2. Do NOT include package, imports, or class declaration
3. Use descriptive test name (e.g., testValidateJwt_whenNull_thenThrowsException)
4. Include proper assertions
5. NO MARKDOWN, NO BACKTICKS, NO EXPLANATIONS

**EXAMPLE OUTPUT**:
@Test
public void testMethodName_scenario() {
    // Arrange
    MyClass obj = new MyClass();
    
    // Act
    Result result = obj.methodUnderTest();
    
    // Assert
    assertNotNull(result);
}

Class to test: ${analysis.className}
Package: ${analysis.package}
Methods available: ${analysis.methods.map(m => m.name).join(', ')}

Generate a test method for the first/main method.
Return ONLY the @Test method code:`;
        const methodCode = await this.copilotAPI.generate(prompt);
        // Extract method name from @Test annotation
        const methodNameMatch = methodCode.match(/void\s+(\w+)\s*\(/);
        const methodName = methodNameMatch ? methodNameMatch[1] : 'testMethod';
        return [{
                name: methodName,
                code: methodCode.trim(),
                input: 'initial',
                expected: 'pass',
                metadata: {
                    targetFile: analysis.sourceFile,
                    language: 'java',
                    origin: 'copilot-initial',
                    generation: 0
                }
            }];
    }
}
exports.CopilotAnalyzer = CopilotAnalyzer;
// Stub for development
class StubCopilotAPI {
    async generate(prompt) {
        if (/Analyze this Java class/i.test(prompt)) {
            return JSON.stringify({
                className: 'StubClass',
                package: 'com.example',
                methods: [{ name: 'doThing', parameters: ['String input'], returnType: 'int', testScenarios: ['normal', 'error'] }],
                dependencies: ['java.util.List'],
                language: 'java'
            });
        }
        if (/Generate a COMPLETE.*JUnit/i.test(prompt)) {
            return JSON.stringify([{
                    name: 'StubClassTest',
                    code: 'package com.example;\n\nimport org.junit.jupiter.api.Test;\n\npublic class StubClassTest {\n  @Test void testDoThing() {}\n}',
                    input: 'initial',
                    expected: 'pass'
                }]);
        }
        return '[]';
    }
}
exports.StubCopilotAPI = StubCopilotAPI;
//# sourceMappingURL=copilot-analyzer.js.map