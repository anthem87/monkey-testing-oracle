# Playwright Login Testing Project

Progetto per automatizzare test di login utilizzando Playwright e TypeScript su una pagina web locale.

## 📋 Panoramica

Questo progetto contiene test automatizzati per verificare la funzionalità di login di un'applicazione web disponibile su `http://localhost:9000/`. I test sono progettati per verificare diversi scenari di autenticazione e gestire eventuali errori o popup.

## 🏗️ Struttura del Progetto

```
├── .github/
│   └── copilot-instructions.md    # Istruzioni per GitHub Copilot
├── login.spec.ts                  # File principale dei test
├── playwright.config.ts           # Configurazione Playwright
├── package.json                   # Dependencies e scripts npm
├── tsconfig.json                  # Configurazione TypeScript
└── README.md                      # Questo file
```

## 🧪 Scenari di Test

Il file `login.spec.ts` contiene tre test principali:

1. **Login con credenziali corrette**
   - Username: `luigi.verdi`
   - Password: `admin`
   - Aspettativa: Login riuscito ✅

2. **Login con username errato**
   - Username: `wronguser`
   - Password: `admin`
   - Aspettativa: Login fallito ❌

3. **Login con password errata**
   - Username: `luigi.verdi`
   - Password: `wrongpass`
   - Aspettativa: Login fallito ❌

4. **Test di connettività**
   - Verifica che la pagina sia raggiungibile
   - Controlla la presenza di elementi di login

## 🚀 Installazione

### Prerequisiti
- Node.js (versione 18 o superiore)
- npm
- Applicazione web in esecuzione su `http://localhost:9000/`

### Setup del progetto

1. **Clona il repository o naviga nella directory del progetto**

2. **Installa le dipendenze**
   ```bash
   npm install
   ```

3. **Installa i browser di Playwright**
   ```bash
   npx playwright install
   ```

4. **Installa le dipendenze di sistema (se necessario su Linux)**
   ```bash
   sudo npx playwright install-deps
   ```

## 🎯 Esecuzione dei Test

### Comandi Disponibili

```bash
# Esegui tutti i test (modalità headless)
npm test

# Esegui i test in modalità headed (visualizza il browser)
npm run test:headed

# Esegui i test in modalità debug
npm run test:debug

# Visualizza il report dei test
npm run report
```

### Esempi di Esecuzione

```bash
# Test base
npm test

# Test con browser visibile
npm run test:headed

# Debug interattivo
npm run test:debug
```

## 📊 Report e Risultati

Dopo l'esecuzione, i risultati saranno disponibili:
- **Console**: Messaggi di successo/fallimento per ogni test
- **Report HTML**: Generato automaticamente in `playwright-report/`
- **Screenshots**: Catturati automaticamente in caso di fallimento
- **Video**: Registrati per i test falliti

Per visualizzare il report HTML:
```bash
npm run report
```

## 🔧 Configurazione

### Configurazione Playwright (`playwright.config.ts`)

- **Base URL**: `http://localhost:9000`
- **Browser supportati**: Chromium, Firefox, WebKit
- **Retry**: 2 tentativi su CI, 0 in locale
- **Timeout**: 30 secondi per navigazione
- **Report**: HTML con traces e screenshots

### Configurazione TypeScript (`tsconfig.json`)

- **Target**: ES2020
- **Module**: CommonJS
- **Strict mode**: Abilitato
- **Types**: Node.js e Playwright

## 🛠️ Personalizzazione

### Modificare le Credenziali

Per cambiare le credenziali di test, modifica il file `login.spec.ts`:

```typescript
const credentials: LoginCredentials = {
  username: 'il_tuo_username',
  password: 'la_tua_password'
};
```

### Aggiungere Nuovi Test

1. Crea una nuova funzione test nel file `login.spec.ts`
2. Utilizza la funzione helper `performLogin()`
3. Aggiungi le asserzioni appropriate

### Selettori Personalizzati

I selettori per gli elementi di login sono configurabili nel file `login.spec.ts`. Modifica le righe:

```typescript
const usernameInput = page.locator('input[name="username"]');
const passwordInput = page.locator('input[name="password"]');
const loginButton = page.locator('button[type="submit"]');
```

## 🚨 Risoluzione Problemi

### Errori Comuni

1. **"Target closed" o timeout**
   - Verifica che l'applicazione sia in esecuzione su `http://localhost:9000/`
   - Controlla che la pagina di login sia accessibile

2. **Selettori non trovati**
   - Ispeziona la pagina HTML per verificare i selettori corretti
   - Modifica i selettori nel file `login.spec.ts`

3. **Errori di dipendenze su Linux**
   ```bash
   sudo npx playwright install-deps
   ```

4. **Test che falliscono inaspettatamente**
   - Esegui in modalità headed per visualizzare il comportamento
   - Controlla i log della console per errori JavaScript

### Debug

Per il debug dettagliato:

```bash
# Modalità debug con inspector
npm run test:debug

# Esecuzione con browser visibile
npm run test:headed

# Verbose logging
DEBUG=pw:api npm test
```

## 🎨 Caratteristiche Avanzate

### Gestione di Popup e Alert
I test gestiscono automaticamente dialog JavaScript e popup che possono apparire durante il login.

### Rilevamento Intelligente del Successo/Fallimento
Il sistema utilizza multiple strategie per determinare se il login è riuscito:
- Analisi dell'URL corrente
- Ricerca di elementi indicatori nella pagina
- Controllo del contenuto della pagina

### Multi-browser Testing
I test vengono eseguiti su:
- Chromium (Chrome)
- Firefox
- WebKit (Safari)

### Reporting Dettagliato
- HTML report con timeline e screenshots
- Video recordings per test falliti
- Traces per il debug

## 📈 Best Practices

1. **Mantieni i test isolati**: Ogni test è indipendente
2. **Usa dati di test realistici**: Le credenziali dovrebbero rispecchiare casi d'uso reali
3. **Gestisci i tempi di attesa**: I test includono wait appropriati
4. **Monitora i cambiamenti**: Aggiorna i selettori se la UI cambia

## 🤝 Contribuzione

Per contribuire al progetto:

1. Fai un fork del repository
2. Crea un branch per la tua feature
3. Scrivi test per le nuove funzionalità
4. Assicurati che tutti i test passino
5. Invia una pull request

## 📚 Risorse

- [Documentazione Playwright](https://playwright.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)

## 📄 Licenza

MIT License - vedi il file LICENSE per i dettagli.

---

**Nota**: Assicurati che l'applicazione web sia in esecuzione su `http://localhost:9000/` prima di eseguire i test.