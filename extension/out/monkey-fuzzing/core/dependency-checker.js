"use strict";
/**
 * ===========================================================
 * DEPENDENCY CHECKER
 * ===========================================================
 * Analyzes compilation errors and suggests missing dependencies
 * Helps identify pom.xml/build.gradle issues automatically
 * ===========================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyzeMissingDependencies = analyzeMissingDependencies;
exports.generateMavenDependencies = generateMavenDependencies;
exports.generateGradleDependencies = generateGradleDependencies;
exports.formatDependencyWarning = formatDependencyWarning;
/**
 * 🔍 Analyze compilation errors to detect missing dependencies
 * Uses Copilot AI for intelligent dependency detection
 */
async function analyzeMissingDependencies(errors, copilotAdapter) {
    if (!copilotAdapter) {
        console.warn('⚠️ No Copilot adapter, using static mappings fallback');
        return analyzeMissingDependenciesStaticFallback(errors);
    }
    // 🧠 Ask Copilot to analyze errors and suggest dependencies
    const errorSample = errors.slice(0, 20).join('\n'); // First 20 errors
    const prompt = `
You are a build system expert. Analyze these compilation errors and identify missing dependencies.

Compilation errors:
${errorSample}

Return ONLY valid JSON array (no markdown, no explanation):
[
  {
    "packageName": "org.junit.jupiter.api",
    "suggestedDependency": "org.junit.jupiter:junit-jupiter",
    "version": "5.10.1",
    "scope": "test",
    "buildTool": "maven"
  }
]

CRITICAL:
- Return ONLY the JSON array
- NO markdown code blocks
- Detect missing packages from "package X does not exist" errors
- Detect missing classes from "cannot find symbol: class Y" errors
- Suggest correct Maven coordinates (groupId:artifactId)
- Use latest stable versions
- scope: "test" for test dependencies, "compile" for production
- buildTool: always "maven"
- Common packages:
  * org.junit.jupiter -> org.junit.jupiter:junit-jupiter:5.10.1 (test)
  * org.mockito -> org.mockito:mockito-core:5.8.0 (test)
  * org.springframework.boot.test -> org.springframework.boot:spring-boot-starter-test:3.2.0 (test)
`;
    try {
        console.log('🧠 Asking Copilot to analyze missing dependencies...');
        const response = await copilotAdapter.generate(prompt);
        // Extract JSON from possible markdown wrapper
        const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/) ||
            response.match(/(\[[\s\S]*\])/);
        if (!jsonMatch) {
            console.error('❌ Copilot did not return valid JSON, using fallback');
            return analyzeMissingDependenciesStaticFallback(errors);
        }
        const dependencies = JSON.parse(jsonMatch[1]);
        console.log(`✅ Copilot detected ${dependencies.length} missing dependencies`);
        return dependencies;
    }
    catch (error) {
        console.error('❌ Copilot dependency analysis failed:', error);
        return analyzeMissingDependenciesStaticFallback(errors);
    }
}
/**
 * 📐 FALLBACK: Static mapping-based detection
 * Used when Copilot unavailable
 */
function analyzeMissingDependenciesStaticFallback(errors) {
    const missing = [];
    const seen = new Set();
    for (const error of errors) {
        // Maven/Java: "package org.junit.jupiter.api does not exist"
        const javaPackageMatch = error.match(/package\s+([\w.]+)\s+does not exist/);
        if (javaPackageMatch) {
            const packageName = javaPackageMatch[1];
            const dependency = detectJavaDependency(packageName);
            if (dependency && !seen.has(dependency.suggestedDependency)) {
                missing.push(dependency);
                seen.add(dependency.suggestedDependency);
            }
        }
        // Maven/Java: "cannot find symbol: class Mock"
        const symbolMatch = error.match(/cannot find symbol.*class\s+(\w+)/);
        if (symbolMatch) {
            const className = symbolMatch[1];
            const dependency = detectJavaClassDependency(className);
            if (dependency && !seen.has(dependency.suggestedDependency)) {
                missing.push(dependency);
                seen.add(dependency.suggestedDependency);
            }
        }
    }
    return missing;
}
/**
 * 🎯 Detect Java dependency from package name
 */
function detectJavaDependency(packageName) {
    const mappings = {
        'org.junit.jupiter.api': {
            packageName: 'org.junit.jupiter.api',
            suggestedDependency: 'org.junit.jupiter:junit-jupiter',
            version: '5.10.1',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.junit.jupiter': {
            packageName: 'org.junit.jupiter',
            suggestedDependency: 'org.junit.jupiter:junit-jupiter',
            version: '5.10.1',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.mockito': {
            packageName: 'org.mockito',
            suggestedDependency: 'org.mockito:mockito-core',
            version: '5.8.0',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.mockito.junit.jupiter': {
            packageName: 'org.mockito.junit.jupiter',
            suggestedDependency: 'org.mockito:mockito-junit-jupiter',
            version: '5.8.0',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.springframework.boot.test': {
            packageName: 'org.springframework.boot.test',
            suggestedDependency: 'org.springframework.boot:spring-boot-starter-test',
            version: '3.2.0',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.assertj.core': {
            packageName: 'org.assertj.core',
            suggestedDependency: 'org.assertj:assertj-core',
            version: '3.25.1',
            scope: 'test',
            buildTool: 'maven'
        },
        'org.hamcrest': {
            packageName: 'org.hamcrest',
            suggestedDependency: 'org.hamcrest:hamcrest',
            version: '2.2',
            scope: 'test',
            buildTool: 'maven'
        }
    };
    // Try exact match first
    if (mappings[packageName]) {
        return mappings[packageName];
    }
    // Try prefix match (e.g., org.junit.jupiter.api.extension → org.junit.jupiter)
    for (const [key, value] of Object.entries(mappings)) {
        if (packageName.startsWith(key)) {
            return value;
        }
    }
    return null;
}
/**
 * 🎯 Detect dependency from class name (when package import missing)
 */
function detectJavaClassDependency(className) {
    const classMappings = {
        'Test': 'org.junit.jupiter.api',
        'BeforeEach': 'org.junit.jupiter.api',
        'AfterEach': 'org.junit.jupiter.api',
        'BeforeAll': 'org.junit.jupiter.api',
        'AfterAll': 'org.junit.jupiter.api',
        'Mock': 'org.mockito',
        'InjectMocks': 'org.mockito',
        'Spy': 'org.mockito',
        'Captor': 'org.mockito'
    };
    const packageName = classMappings[className];
    return packageName ? detectJavaDependency(packageName) : null;
}
/**
 * 📝 Generate Maven XML snippet for missing dependencies
 */
function generateMavenDependencies(missing) {
    if (missing.length === 0)
        return '';
    const deps = missing
        .filter(d => d.buildTool === 'maven')
        .map(d => {
        const [groupId, artifactId] = d.suggestedDependency.split(':');
        return `    <dependency>
      <groupId>${groupId}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>${d.version}</version>
      <scope>${d.scope}</scope>
    </dependency>`;
    })
        .join('\n');
    return `
<!-- ⚠️ MISSING DEPENDENCIES DETECTED BY MONKEY-FUZZINGO -->
<!-- Add these to your pom.xml <dependencies> section: -->

${deps}
`;
}
/**
 * 📝 Generate Gradle snippet for missing dependencies
 */
function generateGradleDependencies(missing) {
    if (missing.length === 0)
        return '';
    const deps = missing
        .filter(d => d.buildTool === 'maven') // Maven deps work in Gradle too
        .map(d => `    ${d.scope}Implementation '${d.suggestedDependency}:${d.version}'`)
        .join('\n');
    return `
// ⚠️ MISSING DEPENDENCIES DETECTED BY MONKEY-FUZZINGO
// Add these to your build.gradle dependencies block:

${deps}
`;
}
/**
 * 🚨 Generate user-friendly warning message
 */
function formatDependencyWarning(missing) {
    if (missing.length === 0)
        return '';
    return `
╔════════════════════════════════════════════════════════════════╗
║  ⚠️  MISSING TEST DEPENDENCIES DETECTED                        ║
╚════════════════════════════════════════════════════════════════╝

Your project is missing ${missing.length} required test ${missing.length === 1 ? 'dependency' : 'dependencies'}:
${missing.map(d => `  • ${d.suggestedDependency} (${d.packageName})`).join('\n')}

${generateMavenDependencies(missing)}

💡 Action Required:
   1. Copy the XML above
   2. Add to your pom.xml in the <dependencies> section
   3. Run: mvn clean compile
   4. Re-run evolution

🔗 Documentation:
   - JUnit 5: https://junit.org/junit5/docs/current/user-guide/
   - Mockito: https://site.mockito.org/

════════════════════════════════════════════════════════════════
`;
}
//# sourceMappingURL=dependency-checker.js.map