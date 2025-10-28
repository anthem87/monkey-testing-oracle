import { test, expect, Page } from '@playwright/test';

// Definizione dei tipi per le credenziali di login
interface LoginCredentials {
  username: string;
  password: string;
}

// Funzione helper per eseguire il login
async function performLogin(page: Page, credentials: LoginCredentials): Promise<boolean> {
  try {
    // Naviga alla pagina di login
    await page.goto('/');
    
    // Attendi che la pagina sia completamente caricata
    await page.waitForLoadState('networkidle');
    
    // Trova i campi di input per username e password
    // Nota: I selettori potrebbero dover essere adattati in base alla struttura HTML effettiva
    const usernameInput = page.locator('input[name="username"], input[type="text"], input[id*="user"], input[placeholder*="user" i]').first();
    const passwordInput = page.locator('input[name="password"], input[type="password"], input[id*="pass"], input[placeholder*="pass" i]').first();
    const loginButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("login"), button:has-text("accedi"), button:has-text("sign in")').first();
    
    // Verifica che gli elementi siano presenti
    await expect(usernameInput).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeVisible({ timeout: 10000 });
    await expect(loginButton).toBeVisible({ timeout: 10000 });
    
    // Compila i campi di login
    await usernameInput.fill(credentials.username);
    await passwordInput.fill(credentials.password);
    
    // Gestisci eventuali popup o alert prima del click
    page.on('dialog', async dialog => {
      console.log(`Dialog apparso: ${dialog.message()}`);
      await dialog.accept();
    });
    
    // Clicca sul pulsante di login
    await loginButton.click();
    
    // Attendi la risposta dopo il login
    await page.waitForTimeout(2000);
    
    // Verifica il risultato del login
    // Controlla vari indicatori di successo o fallimento
    const currentUrl = page.url();
    const pageContent = await page.content();
    
    console.log(`URL corrente: ${currentUrl}`);
    
    // PRIMA controlla gli indicatori di fallimento (più specifici)
    const failureIndicators = [
      () => pageContent.includes('Credenziali non valide'),
      () => pageContent.includes('invalid'),
      () => pageContent.includes('error'),
      () => pageContent.includes('errore'),
      () => pageContent.includes('wrong'),
      () => pageContent.includes('sbagliato'),
      () => pageContent.includes('failed'),
      () => page.locator('#error').isVisible(),
      () => page.locator('.error').isVisible(),
      () => currentUrl === 'http://localhost:9000/' || currentUrl === 'http://localhost:9000',
      () => currentUrl.includes('login')
    ];
    
    // Controlla prima gli indicatori di fallimento
    for (const indicator of failureIndicators) {
      try {
        if (await indicator()) {
          console.log('Indicatore di fallimento rilevato');
          return false;
        }
      } catch (e) {
        // Continua con il prossimo indicatore
      }
    }
    
    // SOLO SE non ci sono indicatori di fallimento, controlla il successo
    const successIndicators = [
      () => currentUrl.includes('dashboard'),
      () => currentUrl.includes('home'),  
      () => currentUrl.includes('welcome'),
      () => pageContent.includes('Benvenuto nella Dashboard'),
      () => pageContent.includes('welcome'),
      () => pageContent.includes('benvenuto'),
      () => pageContent.includes('dashboard'),
      () => page.locator('text=logout').first().isVisible(),
      () => page.locator('text=esci').first().isVisible(),
      () => page.locator('[data-testid="user-menu"], .user-menu, #user-menu').first().isVisible()
    ];
    
    // Controlla gli indicatori di successo
    for (const indicator of successIndicators) {
      try {
        if (await indicator()) {
          console.log('Indicatore di successo rilevato');
          return true;
        }
      } catch (e) {
        // Continua con il prossimo indicatore
      }
    }
    
    // Se nessun indicatore è chiaro, assumiamo fallimento per default
    console.log('Nessun indicatore chiaro, assumo fallimento');
    return false;
    
  } catch (error) {
    console.error('Errore durante il login:', error);
    return false;
  }
}

test.describe('Test di Login', () => {
  
  test('Login con credenziali corrette', async ({ page }) => {
    console.log('🔍 Inizio test: Login con credenziali corrette');
    
    const credentials: LoginCredentials = {
      username: 'luigi.verdi',
      password: 'admin'
    };
    
    const loginSuccess = await performLogin(page, credentials);
    
    if (loginSuccess) {
      console.log('✅ Login riuscito con credenziali corrette');
      expect(loginSuccess).toBe(true);
    } else {
      console.log('❌ Login fallito con credenziali corrette');
      expect(loginSuccess).toBe(true); // Il test dovrebbe fallire se il login non riesce
    }
  });

  test('Login con username errato', async ({ page }) => {
    console.log('🔍 Inizio test: Login con username errato');
    
    const credentials: LoginCredentials = {
      username: 'wronguser',
      password: 'admin'
    };
    
    const loginSuccess = await performLogin(page, credentials);
    
    if (!loginSuccess) {
      console.log('✅ Login correttamente fallito con username errato');
      expect(loginSuccess).toBe(false);
    } else {
      console.log('❌ Login inaspettatamente riuscito con username errato');
      expect(loginSuccess).toBe(false); // Il test dovrebbe fallire se il login riesce erroneamente
    }
  });

  test('Login con password errata', async ({ page }) => {
    console.log('🔍 Inizio test: Login con password errata');
    
    const credentials: LoginCredentials = {
      username: 'luigi.verdi',
      password: 'wrongpass'
    };
    
    const loginSuccess = await performLogin(page, credentials);
    
    if (!loginSuccess) {
      console.log('✅ Login correttamente fallito con password errata');
      expect(loginSuccess).toBe(false);
    } else {
      console.log('❌ Login inaspettatamente riuscito con password errata');
      expect(loginSuccess).toBe(false); // Il test dovrebbe fallire se il login riesce erroneamente
    }
  });
});

// Test bonus: Verifica che la pagina di login sia raggiungibile
test.describe('Test di Connettività', () => {
  
  test('Verifica che la pagina sia raggiungibile', async ({ page }) => {
    console.log('🔍 Verifica connettività alla pagina di login');
    
    try {
      await page.goto('/', { timeout: 30000 });
      await page.waitForLoadState('networkidle');
      
      const title = await page.title();
      console.log(`📄 Titolo della pagina: ${title}`);
      
      // Verifica che la pagina contenga elementi di login
      const hasLoginElements = await page.locator('input[type="password"], input[name="password"]').count() > 0;
      
      if (hasLoginElements) {
        console.log('✅ Pagina di login caricata correttamente');
        expect(hasLoginElements).toBe(true);
      } else {
        console.log('⚠️  Pagina caricata ma elementi di login non trovati');
        expect(hasLoginElements).toBe(true);
      }
      
    } catch (error) {
      console.log('❌ Impossibile raggiungere la pagina di login:', error);
      throw error;
    }
  });
});