"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StubCopilotAPI = exports.CopilotAnalyzer = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
// Lightweight JSON normalization helpers
function safeParse(raw) {
    try {
        return JSON.parse(raw);
    }
    catch (e) {
        throw new Error(`Copilot response is not valid JSON. Raw:\n${raw}\nError: ${e.message}`);
    }
}
class CopilotAnalyzer {
    constructor(copilotAPI) {
        this.copilotAPI = copilotAPI;
    }
    async analyzeFile(projectPath, filePath) {
        const abs = path_1.default.isAbsolute(filePath) ? filePath : path_1.default.join(projectPath, filePath);
        const fileContent = await fs_1.promises.readFile(abs, 'utf8');
        const languageGuess = this.detectLanguage(filePath);
        const prompt = `Analyze this ${languageGuess} file and extract:\n\n1. Class/module name and namespace/package (if any)\n2. Public (or exported) method/function signatures with return types\n3. Dependencies/imports\n4. Potential test scenarios (edge, normal, error)\n\nRespond strictly in JSON format matching this schema:\n{\n  "className": "string | optional",\n  "package": "string | optional",\n  "methods": [\n    {\n      "name": "string",\n      "parameters": ["<type> <name>", "..."],\n      "returnType": "string",\n      "testScenarios": ["scenario1", "scenario2"]\n    }\n  ],\n  "dependencies": ["import1", "import2"],\n  "language": "${languageGuess}"\n}\n\nFile path: ${filePath}\nCode:\n\n\n\n${this.wrapCode(languageGuess, fileContent)}\n`;
        const raw = await this.copilotAPI.generate(prompt);
        const parsed = safeParse(raw);
        return { ...parsed, sourceFile: filePath };
    }
    async generateInitialTests(analysis) {
        const methodsForPrompt = analysis.methods.map(m => ({
            name: m.name,
            parameters: m.parameters,
            returnType: m.returnType,
            scenarios: m.testScenarios || []
        }));
        const prompt = `Generate 3-5 unit tests for the following ${analysis.language} component.\nFocus on: normal cases, boundary values, error handling, null/empty inputs. Prefer concise but meaningful assertions.\nReturn JSON array of objects with fields: name, code, input, expected.\n\nContext JSON:\n${JSON.stringify({
            className: analysis.className,
            package: analysis.package,
            methods: methodsForPrompt,
            sourceFile: analysis.sourceFile
        }, null, 2)}\n`;
        const raw = await this.copilotAPI.generate(prompt);
        const tests = safeParse(raw).map(rawTest => {
            const origin = 'copilot-initial';
            return {
                name: rawTest.name,
                code: rawTest.code,
                input: rawTest.input || '',
                expected: rawTest.expected || '',
                metadata: {
                    targetFile: analysis.sourceFile,
                    language: analysis.language,
                    origin,
                    targetMethod: rawTest.metadata?.targetMethod,
                    complexity: rawTest.metadata?.complexity,
                    generation: rawTest.metadata?.generation
                }
            };
        });
        return tests;
    }
    detectLanguage(filePath) {
        const ext = path_1.default.extname(filePath).toLowerCase();
        switch (ext) {
            case '.java': return 'java';
            case '.py': return 'python';
            case '.ts': return 'typescript';
            case '.tsx': return 'typescript';
            case '.js': return 'javascript';
            case '.c': return 'c';
            case '.cpp': return 'cpp';
            case '.rs': return 'rust';
            default: return 'unknown';
        }
    }
    wrapCode(_language, code) {
        return `\n${code}`;
    }
}
exports.CopilotAnalyzer = CopilotAnalyzer;
// Simple in-memory stub for development & tests.
class StubCopilotAPI {
    async generate(prompt) {
        // Heuristic stub: if asking for analysis, return minimal synthetic JSON.
        if (/Analyze this/i.test(prompt) && /methods/i.test(prompt)) {
            const fake = {
                className: 'StubClass',
                package: 'com.example',
                methods: [
                    { name: 'doThing', parameters: ['String input'], returnType: 'int', testScenarios: ['normal', 'empty', 'error'] }
                ],
                dependencies: ['java.util.List'],
                language: 'java'
            };
            return JSON.stringify(fake);
        }
        if (/Generate 3-5 unit tests/i.test(prompt)) {
            const tests = [
                {
                    name: 'testDoThingNormal',
                    code: '/* JUnit test stub */',
                    input: 'normal string',
                    expected: 'returns positive int',
                    metadata: { targetFile: 'Example.java', origin: 'copilot-initial' }
                }
            ];
            return JSON.stringify(tests);
        }
        return '[]';
    }
}
exports.StubCopilotAPI = StubCopilotAPI;
//# sourceMappingURL=copilot-analyzer.js.map