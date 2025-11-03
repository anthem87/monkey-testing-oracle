"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealCoverageEngine = void 0;
/**
 * REAL COVERAGE ENGINE (TypeScript)
 * Provides approximate real coverage metrics by parsing project sources.
 * Focus: statement count, branch-like indicators (if/for/while), and function count vs touched.
 * Execution mapping is heuristic: we correlate test names to source identifiers by substring matching.
 */
const typescript_1 = __importDefault(require("typescript"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const metrics_1 = require("../metrics/metrics");
class RealCoverageEngine {
    constructor(projectRoot = process.cwd()) {
        this.projectRoot = projectRoot;
    }
    async instrumentCode(testNames) {
        const srcDir = path_1.default.join(this.projectRoot, 'src');
        let files = [];
        try {
            files = await this.collectTsFiles(srcDir);
        }
        catch {
            return this.empty();
        }
        let statementsTotal = 0;
        let branchesTotal = 0;
        let functionsTotal = 0;
        const identifiers = [];
        for (const file of files) {
            const sourceText = await promises_1.default.readFile(file, 'utf-8');
            const sf = typescript_1.default.createSourceFile(file, sourceText, typescript_1.default.ScriptTarget.ES2020, true);
            this.walk(sf, node => {
                switch (node.kind) {
                    case typescript_1.default.SyntaxKind.ExpressionStatement:
                    case typescript_1.default.SyntaxKind.ReturnStatement:
                    case typescript_1.default.SyntaxKind.VariableStatement:
                    case typescript_1.default.SyntaxKind.IfStatement:
                    case typescript_1.default.SyntaxKind.ForStatement:
                    case typescript_1.default.SyntaxKind.ForOfStatement:
                    case typescript_1.default.SyntaxKind.WhileStatement:
                    case typescript_1.default.SyntaxKind.DoStatement:
                        statementsTotal++;
                        break;
                }
                if (node.kind === typescript_1.default.SyntaxKind.IfStatement || node.kind === typescript_1.default.SyntaxKind.ForStatement || node.kind === typescript_1.default.SyntaxKind.WhileStatement) {
                    branchesTotal++;
                }
                if (typescript_1.default.isFunctionDeclaration(node) && node.name) {
                    functionsTotal++;
                    identifiers.push(node.name.text);
                }
                if (typescript_1.default.isMethodDeclaration(node) && node.name && typescript_1.default.isIdentifier(node.name)) {
                    functionsTotal++;
                    identifiers.push(node.name.text);
                }
            });
        }
        if (statementsTotal === 0)
            return this.empty();
        // Heuristic coverage: test names referencing identifiers
        const coveredIds = new Set();
        for (const name of testNames) {
            for (const id of identifiers) {
                if (name.includes(id))
                    coveredIds.add(id);
            }
        }
        const functionsCovered = coveredIds.size;
        // Approximate statement/branch coverage scale by functions touched
        const coverageRatio = functionsTotal > 0 ? functionsCovered / functionsTotal : 0;
        const statementsCovered = Math.round(statementsTotal * coverageRatio);
        const branchesCovered = Math.round(branchesTotal * coverageRatio);
        const semanticCoverage = coverageRatio; // using touched identifiers as semantic signal
        const structuralCoverage = (statementsCovered + branchesCovered) / Math.max(1, statementsTotal + branchesTotal);
        // Use coverageCombine with default beta=0.5
        const totalCoverage = (0, metrics_1.coverageCombine)(semanticCoverage, structuralCoverage);
        return {
            statementsTotal,
            statementsCovered,
            branchesTotal,
            branchesCovered,
            functionsTotal,
            functionsCovered,
            semanticCoverage,
            structuralCoverage,
            totalCoverage
        };
    }
    async collectTsFiles(dir) {
        const entries = await promises_1.default.readdir(dir, { withFileTypes: true });
        const files = [];
        for (const e of entries) {
            const full = path_1.default.join(dir, e.name);
            if (e.isDirectory()) {
                files.push(...await this.collectTsFiles(full));
            }
            else if (e.isFile() && full.endsWith('.ts')) {
                files.push(full);
            }
        }
        return files;
    }
    walk(node, visit) {
        visit(node);
        node.forEachChild(child => this.walk(child, visit));
    }
    empty() {
        return { statementsTotal: 0, statementsCovered: 0, branchesTotal: 0, branchesCovered: 0, functionsTotal: 0, functionsCovered: 0, semanticCoverage: 0, structuralCoverage: 0, totalCoverage: 0 };
    }
}
exports.RealCoverageEngine = RealCoverageEngine;
//# sourceMappingURL=coverage-engine.js.map