"use strict";
/**
 * ================================================================
 * FIX CACHE - INTELLIGENT ERROR FIX MEMOIZATION
 * ================================================================
 *
 * Cache fixes basato su "error signature" per evitare di chiedere
 * a Copilot lo stesso fix 100 volte.
 *
 * Error Signature = hash di:
 * - errorType (cannot find symbol, package not exist, etc)
 * - symbol name
 * - error message (sanitized)
 *
 * Risultato: velocità ×10 nelle generazioni successive
 * ================================================================
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FixCache = void 0;
const crypto_1 = __importDefault(require("crypto"));
class FixCache {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            totalSaved: 0 // Fix applicati da cache
        };
    }
    /**
     * Genera signature univoca per un errore
     *
     * 🆕 IMPROVED: Usa tripletta (errorType, symbol, contextHash)
     *
     * Context include:
     * - Imports presenti nel file
     * - Package declaration
     * - Available dependencies (da pom.xml/build.gradle)
     *
     * Esempio: stesso errore "cannot find HttpServletRequest" può avere
     * fix diversi se il file ha javax.servlet vs jakarta.servlet imports
     */
    generateSignature(error, context) {
        // Componenti chiave dell'errore
        const errorComponents = [
            error.errorType,
            error.symbol || '',
            this.sanitizeMessage(error.message)
        ];
        // 🆕 Context hash (se disponibile)
        let contextHash = 'no-context';
        if (context) {
            const contextComponents = [
                context.packageName || '',
                ...(context.imports || []).sort(), // Sort per stabilità
                ...(context.availableDependencies || []).sort()
            ];
            contextHash = crypto_1.default.createHash('sha256')
                .update(contextComponents.join('|'))
                .digest('hex')
                .substring(0, 8); // Solo 8 char per context
        }
        const payload = [...errorComponents, contextHash].join('|');
        return crypto_1.default.createHash('sha256').update(payload).digest('hex').substring(0, 16);
    }
    /**
     * Sanitizza error message rimuovendo path specifici e numeri
     * Es: "/path/to/Test.java:[42,15]" → "Test.java"
     */
    sanitizeMessage(message) {
        return message
            .replace(/\/[^\s]+\.java/g, 'FILE.java') // rimuovi path
            .replace(/:\[\d+,\d+\]/g, '') // rimuovi line:column
            .replace(/line \d+/g, 'line N') // rimuovi line numbers
            .trim()
            .toLowerCase();
    }
    /**
     * Check se esiste un fix in cache
     *
     * 🆕 CONTEXT-AWARE: Passa context per signature matching
     */
    get(error, context) {
        const signature = this.generateSignature(error, context);
        const cached = this.cache.get(signature);
        if (cached) {
            this.stats.hits++;
            cached.hitCount++;
            console.log(`   [FixCache] ✅ HIT: ${signature} (used ${cached.hitCount} times)`);
            return cached;
        }
        this.stats.misses++;
        console.log(`   [FixCache] ❌ MISS: ${signature}`);
        return undefined;
    }
    /**
     * Salva fix in cache
     *
     * 🆕 CONTEXT-AWARE: Salva anche context hash per debugging
     */
    set(error, fix, context) {
        const signature = this.generateSignature(error, context);
        // Generate context hash for debugging
        let contextHash;
        if (context) {
            const contextComponents = [
                context.packageName || '',
                ...(context.imports || []).sort(),
                ...(context.availableDependencies || []).sort()
            ];
            contextHash = crypto_1.default.createHash('sha256')
                .update(contextComponents.join('|'))
                .digest('hex')
                .substring(0, 8);
        }
        const cached = {
            signature,
            originalError: error,
            contextHash, // 🆕 Store for debugging
            suggestedFix: fix.suggestedFix,
            pomChanges: fix.pomChanges,
            needsDependency: fix.needsDependency,
            timestamp: new Date().toISOString(),
            hitCount: 0
        };
        this.cache.set(signature, cached);
        console.log(`   [FixCache] 💾 SAVED: ${signature}${contextHash ? ` (ctx: ${contextHash})` : ''}`);
    }
    /**
     * Statistiche cache
     */
    getStats() {
        const total = this.stats.hits + this.stats.misses;
        const hitRate = total > 0 ? this.stats.hits / total : 0;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate,
            cacheSize: this.cache.size,
            totalSaved: this.stats.totalSaved
        };
    }
    /**
     * Log statistiche formattate
     */
    printStats() {
        const stats = this.getStats();
        return `
╔═══════════════════════════════════════════╗
║          FIX CACHE STATISTICS             ║
╠═══════════════════════════════════════════╣
║ Cache Size:     ${String(stats.cacheSize).padStart(4)} entries         ║
║ Hits:           ${String(stats.hits).padStart(4)}                  ║
║ Misses:         ${String(stats.misses).padStart(4)}                  ║
║ Hit Rate:       ${(stats.hitRate * 100).toFixed(1).padStart(5)}%             ║
║ Total Saved:    ${String(stats.totalSaved).padStart(4)} Copilot calls   ║
╚═══════════════════════════════════════════╝
`.trim();
    }
    /**
     * Clear cache (per testing o reset)
     */
    clear() {
        this.cache.clear();
        this.stats = { hits: 0, misses: 0, totalSaved: 0 };
        console.log('   [FixCache] 🗑️  Cache cleared');
    }
    /**
     * Esporta cache per persistence (opzionale)
     */
    export() {
        return Array.from(this.cache.values());
    }
    /**
     * Importa cache da persistence (opzionale)
     */
    import(fixes) {
        for (const fix of fixes) {
            this.cache.set(fix.signature, fix);
        }
        console.log(`   [FixCache] 📥 Imported ${fixes.length} cached fixes`);
    }
}
exports.FixCache = FixCache;
//# sourceMappingURL=fix-cache.js.map