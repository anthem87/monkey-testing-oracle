"use strict";
/**
 * ================================================================
 * AI REPAIR ORACLE - SURGICAL COMPILATION FIX ENGINE
 * ================================================================
 *
 * Copilot in modalità "chirurgo", NON generatore.
 *
 * Prompt characteristics:
 * - Bassa temperatura (0.1-0.2) → determinismo
 * - Fix minimale, zero creatività
 * - Contesto ricco da Maven/Gradle parsing
 * - Usa SOLO import disponibili
 *
 * Input: SymbolError + ErrorContext (da BuildToolAdapter)
 * Output: Fixed code (minimal diff)
 *
 * ================================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AIRepairOracle = void 0;
class AIRepairOracle {
    constructor(copilot) {
        this.copilot = copilot;
    }
    /**
     * 🔧 Fix compilation error con prompt chirurgico
     *
     * Temperature: 0.1 → vogliamo determinismo, non creatività
     * Stop sequences: fermiamo quando ha finito il fix
     */
    async fix(test, context) {
        const prompt = this.buildSurgicalPrompt(test, context);
        console.log('\n   [AIRepair] 🔬 Sending surgical fix prompt...');
        console.log(`   [AIRepair] Error: ${context.error.errorType} - ${context.error.symbol || 'N/A'}`);
        try {
            // 🎯 Call Copilot con temperatura bassa (se supportata)
            // Note: VS Code Language Model API non supporta temperature custom yet
            // ma il prompt "surgical" guida verso fix deterministico
            const response = await this.copilot.generate(prompt);
            console.log(`   [AIRepair] ✅ Received response (${response.length} chars)`);
            // Parse JSON response (patch instructions)
            const parsed = this.parseFixResponse(response);
            if (!parsed.patchType || !parsed.newContent) {
                console.warn('   [AIRepair] ⚠️  No valid patch in response');
                return {
                    success: false,
                    error: 'Copilot did not provide a valid patch'
                };
            }
            console.log(`   [AIRepair] ✅ Patch parsed: ${parsed.patchType} - ${parsed.explanation || 'no explanation'}`);
            // Apply patch to existing code
            const patchedCode = this.applyPatch(test.code, parsed);
            return {
                success: true,
                fixedCode: patchedCode,
                pomChanges: parsed.pomChanges,
                needsDependency: parsed.needsDependency,
                explanation: parsed.explanation
            };
        }
        catch (error) {
            console.error(`   [AIRepair] ❌ Fix failed: ${error.message}`);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * 🎯 Build prompt chirurgico (surgical, not creative)
     *
     * Caratteristiche:
     * - RULES chiare e deterministiche
     * - Contesto ricco (imports, pom.xml, project structure)
     * - Output format rigido (JSON)
     * - Zero ambiguità
     */
    buildSurgicalPrompt(test, ctx) {
        const { error } = ctx;
        return `You are a COMPILER ERROR FIXER (not a test generator).
Your ONLY job is to fix compilation errors with MINIMAL changes.

═══════════════════════════════════════════════════════════════
ERROR TO FIX:
═══════════════════════════════════════════════════════════════
- Type: ${error.errorType}
- Symbol: ${error.symbol || 'N/A'}
- Location: ${error.location || 'N/A'}
- File: ${error.file}
- Line: ${error.line}, Column: ${error.column}
- Message: ${error.message}

═══════════════════════════════════════════════════════════════
AVAILABLE CONTEXT:
═══════════════════════════════════════════════════════════════

${ctx.pomXml ? `**Project pom.xml (dependencies):**
\`\`\`xml
${ctx.pomXml.substring(0, 2000)}
\`\`\`
` : ''}

${ctx.similarClasses && ctx.similarClasses.length > 0 ? `**Similar classes found in project:**
${ctx.similarClasses.slice(0, 10).join('\n')}
` : ''}

${ctx.projectStructure && ctx.projectStructure.length > 0 ? `**Project structure:**
${ctx.projectStructure.slice(0, 20).join('\n')}
` : ''}

═══════════════════════════════════════════════════════════════
BROKEN TEST CODE:
═══════════════════════════════════════════════════════════════
\`\`\`java
${test.code}
\`\`\`

${ctx.testFileContent ? `═══════════════════════════════════════════════════════════════
CODE AROUND ERROR (context):
═══════════════════════════════════════════════════════════════
\`\`\`java
${ctx.testFileContent}
\`\`\`
` : ''}

═══════════════════════════════════════════════════════════════
STRICT RULES:
═══════════════════════════════════════════════════════════════
1. Fix ONLY the compilation error at line ${error.line}
2. Do NOT modify test logic, assertions, or expected behavior
3. Use ONLY imports available in pom.xml or standard library
4. If missing dependency, specify in "needsDependency" field
5. Return MINIMAL PATCH (e.g., "add import X", "change line Y to Z")
6. Do NOT add comments, explanations, or creative mutations
7. Keep changes SURGICAL (only what's needed to compile)
8. ⚠️ NEVER duplicate existing methods or add new test methods!
9. ⚠️ Apply fixes to EXISTING file content, don't replace everything!

═══════════════════════════════════════════════════════════════
COMMON FIXES (MINIMAL PATCHES):
═══════════════════════════════════════════════════════════════
- Missing import: "Add import: import static org.mockito.Mockito.*;"
- Wrong package: "Change javax.servlet to jakarta.servlet"
- Missing method: "Add static import: import static org.junit.jupiter.api.Assertions.assertThat;"
- Missing dependency: Specify in needsDependency
- Wrong type: "Change line 23: HttpServletRequest request = ..."
- Syntax error: "Fix line 15: remove extra semicolon"

═══════════════════════════════════════════════════════════════
RESPONSE FORMAT (JSON ONLY - PATCH INSTRUCTIONS):
═══════════════════════════════════════════════════════════════
\`\`\`json
{
  "patchType": "add_import|replace_line|fix_syntax",
  "targetLine": 10,
  "oldContent": "// Original line content (if replace_line)",
  "newContent": "// New content to apply",
  "pomChanges": "<!-- Maven dependency if needed, else null -->",
  "needsDependency": {
    "groupId": "...",
    "artifactId": "...",
    "version": "..."
  },
  "explanation": "Brief explanation of what was fixed (1 sentence)"
}
\`\`\`

**PATCH TYPES:**
- "add_import": Add import at top (newContent = "import ...")
- "replace_line": Replace specific line (oldContent + newContent + targetLine)
- "fix_syntax": Fix syntax error at targetLine (newContent = corrected line)

Return ONLY the JSON object above. No markdown, no extra text.
`;
    }
    /**
     * Parse Copilot response and extract PATCH instructions
     * Handles both JSON and markdown-wrapped JSON
     */
    parseFixResponse(response) {
        try {
            // Try to extract JSON from markdown code blocks
            const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ||
                response.match(/(\{[\s\S]*\})/);
            if (!jsonMatch) {
                console.warn('   [AIRepair] ⚠️  No JSON found in response');
                return {};
            }
            const parsed = JSON.parse(jsonMatch[1]);
            return {
                patchType: parsed.patchType,
                targetLine: parsed.targetLine,
                oldContent: parsed.oldContent,
                newContent: parsed.newContent,
                pomChanges: parsed.pomChanges,
                needsDependency: parsed.needsDependency,
                explanation: parsed.explanation || parsed.reason
            };
        }
        catch (parseError) {
            console.error(`   [AIRepair] ❌ JSON parse error: ${parseError}`);
            console.log(`   [AIRepair] Response preview: ${response.substring(0, 200)}`);
            return {};
        }
    }
    /**
     * 🔧 Apply PATCH to existing code (MINIMAL DIFF)
     *
     * Patch types:
     * - add_import: Add import statement after package declaration
     * - replace_line: Replace specific line with new content
     * - fix_syntax: Fix syntax error at specific line
     */
    applyPatch(originalCode, patch) {
        const lines = originalCode.split('\n');
        switch (patch.patchType) {
            case 'add_import':
                // Find last import or package line
                let insertIndex = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith('import ') || lines[i].startsWith('package ')) {
                        insertIndex = i + 1;
                    }
                }
                // Insert new import after last import/package
                lines.splice(insertIndex, 0, patch.newContent || '');
                break;
            case 'replace_line':
            case 'fix_syntax':
                if (patch.targetLine && patch.targetLine > 0 && patch.targetLine <= lines.length) {
                    // Replace specific line (1-indexed)
                    lines[patch.targetLine - 1] = patch.newContent || '';
                }
                break;
            default:
                console.warn(`   [AIRepair] ⚠️  Unknown patch type: ${patch.patchType}`);
                return originalCode;
        }
        return lines.join('\n');
    }
    /**
     * Apply fix to test code
     * Returns new GeneratedTest with updated code and metadata
     */
    applyFix(test, fixResult) {
        if (!fixResult.success || !fixResult.fixedCode) {
            return test; // No change
        }
        return {
            ...test,
            code: fixResult.fixedCode,
            metadata: {
                ...test.metadata,
                origin: 'repaired',
                repairAttempts: (test.metadata.repairAttempts || 0) + 1,
                lastRepairReason: fixResult.explanation
            }
        };
    }
}
exports.AIRepairOracle = AIRepairOracle;
//# sourceMappingURL=ai-repair-oracle.js.map