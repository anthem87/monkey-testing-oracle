# 🧊 Convergence Plateau Fix - Implementation Plan

## � **CRITICAL BUG DISCOVERED** (2025-11-03)

### **False Positive Fitness from Novelty Score**

**Problem**: Tests che **NON compilano** ricevono fitness > 0 grazie al novelty bonus.

**Root Cause**:
```typescript
// OLD (BUGGY):
baseFitness = 0 (all compilation errors)
novelty = 0.3-1.0 (Levenshtein distance)
TOTAL FITNESS = 0.7 * 0 + 0.3 * novelty = 0.15-0.30 ❌

// This allows non-compiling tests to survive and reproduce!
```

**Impact**:
- Gen 9 aveva fitness 0.037-0.062 con **100% compilation errors**
- Sistema evolveva **sintassi credibile ma semanticamente invalida**
- Popolazione convergeva su "test plausibili" invece di "test funzionanti"

**Fix Implemented**:
```typescript
// NEW (FIXED):
if (compilationRate === 0) {
  return 0.05 * novelty; // Max 5% fitness (debugging only)
}
// Novelty bonus applies ONLY if baseFitness > 0.1
```

**Expected Result**:
- Test non compilabili: fitness < 0.05 (estinzione rapida)
- Test compilabili ma failing: fitness 0.1-0.5 (evoluzione possibile)
- Test compilabili e passing: fitness 0.5-1.0 (dominanza)

---

## �📊 Problem Statement

**Observed**: Gen 6 → Gen 9 raggiunge convergenza semantica completa
- **Entropy**: 0.837 → 0.72 → plateau
- **Fitness**: 0.037 → 0.062 → stabile (no improvement)
- **Structure**: identica tra test, naming stabilizzato
- **Mutations**: eliminate, mantiene solo 5 pattern ottimali

**Impact**:
- ✅ **Positivo**: Test stabili, leggibili, path fondamentali coperti
- ⚠️ **Negativo**: Popolazione smette di esplorare edge cases
- ❌ **Critico**: Sistema non trova nuove vulnerabilità security

---

## 🎯 Solution Strategy

### Phase 1: Semantic Fitness Dimension ⏳
**Goal**: Incentivare esplorazione di nuovi code paths

**Tasks**:
- [ ] Implementare `DifferentialCoverageTracker`
  - Track `Set<string> coveredBranches` globale
  - Ogni test nuovo aggiunge branch → fitness bonus +0.2
  - Reset ogni 10 generazioni per re-exploration

- [ ] Estendere `calculateFitness()` con w₅·diffCoverage
  ```typescript
  const diffCovBonus = newBranchesCovered.length * 0.2;
  return baseFitness + diffCovBonus;
  ```

- [ ] Aggiungere SecurityContext validation
  - Verificare autenticazione corretta post-filtro
  - Check ruoli assegnati vs attesi

**Acceptance Criteria**:
- Fitness aumenta quando si copre nuova linea codice
- Entropy risale sopra 0.85

---

### Phase 2: Exploration Seeds Injection ⏳
**Goal**: Introdurre nuovi input patterns non coperti

**Tasks**:
- [x] Creare `exploration-seeds.ts` con edge cases
  - JWT expired/invalid/null signature
  - HTTP headers multipli/case-insensitive
  - Encoding UTF-8/null bytes/URL-encoded
  - Injection SQLi/XSS/path-traversal

- [ ] Integrare `selectSeedsForExploration()` in mutation pipeline
  - Trigger quando entropy < 0.7
  - Inject 3-5 seed per generazione
  - Convertire seed → full test via Copilot

- [ ] Validator per seed injection
  - Verificare seed compila correttamente
  - Skip seed se genera stesso errore ripetuto

**Acceptance Criteria**:
- 10+ nuovi test edge case generati
- Almeno 2 nuove vulnerabilità security trovate

---

### Phase 3: Exploration Burst Mode ⏳
**Goal**: Force diversity quando sistema stagna

**Tasks**:
- [x] Implementare `detectConvergencePlateau()` skeleton
- [ ] Completare detection logic
  ```typescript
  if (entropy < 0.7 for 3 gens && fitnessVariance < 0.05) {
    triggerExplorationBurst();
  }
  ```

- [ ] Implementare `triggerExplorationBurst()`
  - mutationRate: 0.18 → 0.35 (temporary)
  - elitismCount: 3 → 1 (force diversity)
  - Duration: 3 generations, then restore
  - Log: "🚀 Exploration Burst Mode activated"

- [ ] Auto-restore after burst
  - Contatore: `explorationBurstCountdown = 3`
  - Decrementa ogni generazione
  - Quando 0 → restore config originale

**Acceptance Criteria**:
- Entropy risale da 0.7 → 0.9 durante burst
- Almeno 5 nuovi test pattern emergono

---

### Phase 4: Multi-Objective Fitness (Pareto Front) 🔮
**Goal**: Sostituire weighted sum con ottimizzazione multi-obiettivo

**Tasks**:
- [ ] Studiare NSGA-II algorithm
- [ ] Implementare Pareto dominance check
  ```typescript
  function dominates(a: Individual, b: Individual): boolean {
    // a domina b se: migliore in almeno 1 obiettivo, non peggiore negli altri
  }
  ```

- [ ] Definire obiettivi multipli
  - `f₁`: Code Coverage (%)
  - `f₂`: Security Findings (count)
  - `f₃`: Novelty (Levenshtein avg)
  - `f₄`: Performance (ms avg)

- [ ] Selezione basata su Pareto ranking
  - Rank 1: individui non dominati
  - Rank 2: dominati solo da Rank 1
  - etc.

**Acceptance Criteria**:
- Popolazione preserva individui con trade-off coverage/security/novelty
- Non più convergenza su singolo ottimo locale

---

## 📈 Success Metrics

### Before (Gen 9 - Plateau)
```json
{
  "entropy": 0.72,
  "avgFitness": 0.062,
  "testMethods": 5,
  "securityFindings": 3,
  "newBranchesPerGen": 0
}
```

### After (Target - Post-Fix)
```json
{
  "entropy": 0.85+,
  "avgFitness": 0.25-0.30,
  "testMethods": 15+,
  "securityFindings": 8+,
  "newBranchesPerGen": 3-5
}
```

---

## 🗓️ Timeline

| Phase | Duration | Priority | Status |
|-------|----------|----------|--------|
| Phase 1 (Semantic Fitness) | 2-3 days | HIGH | ⏳ TODO |
| Phase 2 (Exploration Seeds) | 1-2 days | HIGH | 🟡 STARTED |
| Phase 3 (Burst Mode) | 1 day | MEDIUM | 🟡 SKELETON |
| Phase 4 (Pareto Front) | 5-7 days | LOW | 🔮 FUTURE |

**Total Estimated Time**: 9-13 giorni

---

## 🚀 Quick Wins (可立即实现)

### Immediate Actions (< 1 hour)
1. ✅ **Add TODO comments in code** (DONE)
2. ✅ **Create exploration-seeds.ts** (DONE)
3. [ ] **Enable entropy logging** in evolution.log
4. [ ] **Add fitness variance to report.json**

### Short-Term (1-2 days)
1. [ ] **Implement DifferentialCoverageTracker**
2. [ ] **Inject 3 exploration seeds per generation**
3. [ ] **Complete detectConvergencePlateau()**

---

## 📝 Notes

### Design Decisions
- **Why Levenshtein for novelty?** 
  - Fast, simple, language-agnostic
  - Alternative: AST diff (more accurate but slower)

- **Why 0.7 entropy threshold?**
  - Empirical observation: Gen 9 plateau at 0.72
  - 0.7 = clear signal of convergence
  - 0.85+ = healthy exploration

- **Why Pareto front instead of weighted sum?**
  - Weighted sum converges to single optimum
  - Pareto preserves diversity of trade-offs
  - Better for multi-criteria optimization

### Related Work
- Search-Based Software Testing (Harman et al.)
- Evolutionary Fuzzing (AFL, libFuzzer)
- Multi-Objective Evolutionary Algorithms (NSGA-II, SPEA2)

---

## 🔗 References

**Code Files**:
- `core/evolution.ts` - Main evolution logic + TODO comments
- `core/exploration-seeds.ts` - Edge case catalog
- `core/test-writer.ts` - Language-agnostic test generation

**Documentation**:
- `FUZZING-FRAMEWORK.md` - Overall architecture
- `README-ORACLE-TESTING.md` - Oracle integration guide

**Reports**:
- `reports/evolution-gen-9.json` - Current plateau state
- `checkpoints/checkpoint-gen-9.json` - Resume point

---

**Last Updated**: 2025-11-03  
**Status**: 🟡 In Progress (Phase 1-2)  
**Next Review**: After Phase 2 completion
