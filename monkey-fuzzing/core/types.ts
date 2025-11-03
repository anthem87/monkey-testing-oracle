// Core type definitions for Copilot-centric evolutionary testing
// These interfaces intentionally keep language-specific parsing out of the system.
// Copilot is expected to return JSON conforming to these shapes for any language.

export interface MethodInfo {
  name: string;
  parameters: string[]; // Represented as "<type> <name>" strings for simplicity
  returnType: string;
  testScenarios?: string[]; // High-level scenario descriptors produced by Copilot
}

export interface FileAnalysis {
  className?: string; // Optional: some files (e.g. scripts) may not have a class
  package?: string; // Namespace / module / package path
  methods: MethodInfo[];
  dependencies: string[]; // Imports / requires / using statements
  sourceFile: string; // Absolute or project-relative file path analyzed
  language?: string; // Language hint (e.g. 'java', 'python', 'ts') returned by Copilot
}

export interface GeneratedTest {
  name: string; // Test function / method name
  code: string; // Full test code snippet (language-specific)
  input: string; // Human-readable description of input/setup
  expected: string; // Expected behavior / assertion intent
  metadata: {
    targetFile: string; // The file under test
    targetMethod?: string; // Optional: method under test
    complexity?: number; // Heuristic complexity (e.g., branch count estimate)
    language?: string; // Language of the test code
    origin: 'copilot-initial' | 'mutated' | 'repaired';
    generation?: number; // Evolution generation when produced
  };
}

export interface CopilotAPI {
  generate(prompt: string): Promise<string>; // Returns raw JSON string according to prompt instructions
}

export interface TestWriteResult {
  writtenFiles: string[];
  metadataFiles: string[];
}

export interface SandboxInfo {
  sandboxPath: string; // Root sandbox directory
  testsPath: string; // Where generated tests are placed inside sandbox
  sourceMirrorPath: string; // Mirror/copy of the source file under test
  createdAt: string;
}
