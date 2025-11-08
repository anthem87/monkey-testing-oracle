"use strict";
/**
 * =============================================================
 * PROJECT-EXPLORER.TS
 * =============================================================
 * Esplora il progetto target per raccogliere contesto:
 * - DTOs e classi correlate
 * - Dipendenze dal pom.xml
 * - Metodi della classe sotto test
 * - Strutture dati e annotazioni
 * =============================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectExplorer = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
class ProjectExplorer {
    constructor(copilotAPI) {
        this.copilotAPI = copilotAPI;
    }
    /**
     * 🔍 Esplora il progetto e raccogli contesto completo
     */
    async exploreProject(targetClassPath, projectRoot) {
        console.log(`\n🔍 Exploring project context...`);
        console.log(`   Target class: ${targetClassPath}`);
        console.log(`   Project root: ${projectRoot}`);
        // 1. Leggi la classe target
        const targetClass = await this.analyzeTargetClass(targetClassPath);
        // 2. Trova classi correlate (DTOs, services, etc.)
        const relatedClasses = await this.findRelatedClasses(targetClass, projectRoot);
        // 3. Analizza pom.xml per dipendenze
        const dependencies = await this.extractDependencies(projectRoot);
        // 4. Identifica framework di testing disponibili
        const testingFrameworks = this.detectTestingFrameworks(dependencies);
        console.log(`   Found ${relatedClasses.length} related classes`);
        console.log(`   Found ${dependencies.length} dependencies`);
        console.log(`   Testing frameworks: ${testingFrameworks.join(', ')}`);
        return {
            targetClass,
            relatedClasses,
            dependencies,
            testingFrameworks
        };
    }
    /**
     * 📖 Analizza la classe Java target
     */
    async analyzeTargetClass(classPath) {
        const content = await fs_1.promises.readFile(classPath, 'utf8');
        const className = path_1.default.basename(classPath, '.java');
        // Extract methods, fields, imports usando Copilot se disponibile
        if (this.copilotAPI) {
            const prompt = `Analyze this Java class and extract:
1. All public method signatures
2. All field declarations
3. All import statements

Return JSON format:
{
  "methods": ["method1()", "method2(String param)"],
  "fields": ["private String field1", "private int field2"],
  "imports": ["import java.util.List", "import com.example.Dto"]
}

Java class:
\`\`\`java
${content.substring(0, 3000)}
\`\`\``;
            try {
                const response = await this.copilotAPI.generate(prompt);
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    const parsed = JSON.parse(jsonMatch[0]);
                    return {
                        name: className,
                        path: classPath,
                        content,
                        methods: parsed.methods || [],
                        fields: parsed.fields || [],
                        imports: parsed.imports || []
                    };
                }
            }
            catch (err) {
                console.warn('⚠️ Copilot analysis failed, using regex fallback');
            }
        }
        // Fallback: regex-based extraction
        const methods = this.extractMethodsRegex(content);
        const fields = this.extractFieldsRegex(content);
        const imports = this.extractImportsRegex(content);
        return {
            name: className,
            path: classPath,
            content,
            methods,
            fields,
            imports
        };
    }
    /**
     * 🔗 Trova classi correlate (DTOs, services, repositories)
     */
    async findRelatedClasses(targetClass, projectRoot) {
        const related = [];
        // Estrai classi dagli import
        const importedClasses = targetClass.imports
            .filter(imp => imp.includes('import') && !imp.includes('java.'))
            .map(imp => {
            const match = imp.match(/import\s+([a-zA-Z0-9_.]+);?/);
            return match ? match[1] : null;
        })
            .filter(Boolean);
        console.log(`   Analyzing ${importedClasses.length} imported classes...`);
        for (const fullClassName of importedClasses) {
            const className = fullClassName.split('.').pop();
            const possiblePath = await this.findClassInProject(className, projectRoot);
            if (possiblePath) {
                const type = this.classifyType(className);
                const content = await fs_1.promises.readFile(possiblePath, 'utf8').catch(() => undefined);
                related.push({
                    name: className,
                    path: possiblePath,
                    type,
                    content: content?.substring(0, 2000) // Prime 2000 chars per contesto
                });
                console.log(`      ✅ Found ${type}: ${className}`);
            }
        }
        return related;
    }
    /**
     * 🔎 Cerca una classe nel progetto
     */
    async findClassInProject(className, projectRoot) {
        const searchDirs = [
            path_1.default.join(projectRoot, 'src', 'main', 'java'),
            path_1.default.join(projectRoot, 'src', 'test', 'java'),
            path_1.default.join(projectRoot, '..', '..', 'src', 'main', 'java'), // Moduli Maven
        ];
        for (const dir of searchDirs) {
            try {
                const result = await this.findFileRecursive(dir, `${className}.java`);
                if (result)
                    return result;
            }
            catch {
                // Directory non esiste, continua
            }
        }
        return null;
    }
    /**
     * 📂 Cerca file ricorsivamente
     */
    async findFileRecursive(dir, filename) {
        try {
            const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path_1.default.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const result = await this.findFileRecursive(fullPath, filename);
                    if (result)
                        return result;
                }
                else if (entry.name === filename) {
                    return fullPath;
                }
            }
        }
        catch {
            // Ignora errori di permessi
        }
        return null;
    }
    /**
     * 🏷️ Classifica il tipo di classe
     */
    classifyType(className) {
        const lower = className.toLowerCase();
        if (lower.includes('dto') || lower.includes('request') || lower.includes('response')) {
            return 'dto';
        }
        if (lower.includes('service')) {
            return 'service';
        }
        if (lower.includes('repository') || lower.includes('dao')) {
            return 'repository';
        }
        if (lower.includes('util') || lower.includes('helper')) {
            return 'util';
        }
        return 'other';
    }
    /**
     * 📦 Estrai dipendenze dal pom.xml
     */
    async extractDependencies(projectRoot) {
        const pomPath = path_1.default.join(projectRoot, 'pom.xml');
        try {
            const pomContent = await fs_1.promises.readFile(pomPath, 'utf8');
            const dependencies = [];
            // Regex per estrarre dipendenze
            const depRegex = /<dependency>\s*<groupId>([^<]+)<\/groupId>\s*<artifactId>([^<]+)<\/artifactId>\s*<version>([^<]+)<\/version>/g;
            let match;
            while ((match = depRegex.exec(pomContent)) !== null) {
                dependencies.push({
                    groupId: match[1].trim(),
                    artifactId: match[2].trim(),
                    version: match[3].trim()
                });
            }
            return dependencies;
        }
        catch (err) {
            console.warn(`⚠️ Could not read pom.xml: ${err.message}`);
            return [];
        }
    }
    /**
     * 🧪 Rileva framework di testing disponibili
     */
    detectTestingFrameworks(dependencies) {
        const frameworks = new Set();
        for (const dep of dependencies) {
            const artifact = dep.artifactId.toLowerCase();
            if (artifact.includes('junit'))
                frameworks.add('JUnit');
            if (artifact.includes('mockito'))
                frameworks.add('Mockito');
            if (artifact.includes('spring-boot-test'))
                frameworks.add('SpringBootTest');
            if (artifact.includes('testcontainers'))
                frameworks.add('Testcontainers');
            if (artifact.includes('rest-assured'))
                frameworks.add('RestAssured');
        }
        return Array.from(frameworks);
    }
    // === REGEX FALLBACKS ===
    extractMethodsRegex(content) {
        const methodRegex = /(?:public|protected|private)\s+[\w<>\[\]]+\s+(\w+)\s*\([^)]*\)/g;
        const methods = [];
        let match;
        while ((match = methodRegex.exec(content)) !== null) {
            methods.push(match[0]);
        }
        return methods;
    }
    extractFieldsRegex(content) {
        const fieldRegex = /(?:private|protected|public)\s+[\w<>\[\]]+\s+\w+\s*[;=]/g;
        const fields = [];
        let match;
        while ((match = fieldRegex.exec(content)) !== null) {
            fields.push(match[0].replace(/[;=].*/, '').trim());
        }
        return fields;
    }
    extractImportsRegex(content) {
        const importRegex = /import\s+[a-zA-Z0-9_.]+;?/g;
        return content.match(importRegex) || [];
    }
}
exports.ProjectExplorer = ProjectExplorer;
//# sourceMappingURL=project-explorer.js.map