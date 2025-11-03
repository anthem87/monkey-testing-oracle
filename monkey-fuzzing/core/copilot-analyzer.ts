import { promises as fs } from 'fs';
import path from 'path';
import { CopilotAPI, FileAnalysis, GeneratedTest } from './types.js';

// Lightweight JSON normalization helpers
function extractJSON(raw: string): string {
  // Remove markdown code blocks if present (```json ... ``` or ``` ... ```)
  const markdownMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    return markdownMatch[1].trim();
  }
  return raw.trim();
}

function safeParse<T>(raw: string): T {
  try {
    const cleaned = extractJSON(raw);
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new Error(`Copilot response is not valid JSON. Raw:\n${raw}\nError: ${(e as Error).message}`);
  }
}

export class CopilotAnalyzer {
  constructor(private copilotAPI: CopilotAPI) {}

  async analyzeFile(projectPath: string, filePath: string): Promise<FileAnalysis> {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(projectPath, filePath);
    
    console.log(`🔍 Reading file: ${abs}`);
    
    // Try to read the file - if path is wrong, this will throw a clear error
    let fileContent: string;
    try {
      fileContent = await fs.readFile(abs, 'utf8');
      console.log(`✅ File read successfully (${fileContent.length} bytes)`);
    } catch (error) {
      console.error(`❌ Failed to read file: ${abs}`);
      console.error(`Error: ${(error as Error).message}`);
      throw new Error(`Cannot read file: ${abs}. Make sure the path is accessible. Error: ${(error as Error).message}`);
    }

    const languageGuess = this.detectLanguage(filePath);
    const prompt = `Analyze this ${languageGuess} file and extract:

1. Class/module name and namespace/package (if any)
2. Public (or exported) method/function signatures with return types
3. Dependencies/imports
4. Potential test scenarios (edge, normal, error)

**IMPORTANT**: Respond with ONLY valid JSON, no markdown code blocks, no explanations.

JSON schema:
{
  "className": "string | optional",
  "package": "string | optional",
  "methods": [
    {
      "name": "string",
      "parameters": ["<type> <name>", "..."],
      "returnType": "string",
      "testScenarios": ["scenario1", "scenario2"]
    }
  ],
  "dependencies": ["import1", "import2"],
  "language": "${languageGuess}"
}

File path: ${filePath}
Code:


${this.wrapCode(languageGuess, fileContent)}
`;

    const raw = await this.copilotAPI.generate(prompt);
    const parsed = safeParse<Omit<FileAnalysis, 'sourceFile'>>(raw);
    return { ...parsed, sourceFile: filePath };
  }

  async generateInitialTests(analysis: FileAnalysis): Promise<GeneratedTest[]> {
    const methodsForPrompt = analysis.methods.map(m => ({
      name: m.name,
      parameters: m.parameters,
      returnType: m.returnType,
      scenarios: m.testScenarios || []
    }));

    const prompt = `Generate 3-5 COMPLETE, COMPILABLE unit tests for the following ${analysis.language} class.

Each test must be a COMPLETE, standalone, executable test (not just assertion fragments).
Include: package declaration, imports, class/function declaration, setup code, test methods, and assertions.

**CRITICAL for Java/Kotlin**: 
- Start with: package ${analysis.package};
- Include all necessary imports (JUnit, Mockito, class under test, etc.)
- Make tests compilable as-is

**IMPORTANT**: Return ONLY valid JSON (no markdown blocks, no explanations).

JSON Schema:
[
  {
    "name": "testName_scenario",
    "code": "COMPLETE test code starting with package declaration, then imports, then test class",
    "input": "description of test input",
    "expected": "expected behavior"
  }
]

Class to test:
${JSON.stringify({
      className: analysis.className,
      package: analysis.package,
      methods: methodsForPrompt,
      language: analysis.language
    }, null, 2)}
`;

    const raw = await this.copilotAPI.generate(prompt);
    const tests = safeParse<any[]>(raw).map(rawTest => {
      const origin: 'copilot-initial' = 'copilot-initial';
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
      } as GeneratedTest;
    });
    return tests;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
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

  private wrapCode(_language: string, code: string): string {
    return `\n${code}`;
  }
}

// Simple in-memory stub for development & tests.
export class StubCopilotAPI implements CopilotAPI {
  async generate(prompt: string): Promise<string> {
    // Heuristic stub: if asking for analysis, return minimal synthetic JSON.
    if (/Analyze this/i.test(prompt) && /methods/i.test(prompt)) {
      const fake: Omit<FileAnalysis, 'sourceFile'> = {
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
      const tests: GeneratedTest[] = [
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
