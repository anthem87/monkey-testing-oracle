/**
 * InputMutator - Fuzzing Intelligente per Oracle-Based Testing
 * 
 * Questo modulo applica trasformazioni randomiche semantiche agli input heuristici
 * per scoprire corner case emergenti non esplicitamente codificati.
 * 
 * Filosofia: Caos + Controllo = Fuzzing + Oracle
 * - Il Mutator introduce variabilità (fuzzing)
 * - L'Oracle mantiene il controllo (validation)
 */

export interface MutationResult {
  original: string;
  mutated: string;
  mutationType: string;
}

/**
 * Strategia di mutazione per input testuali
 */
export const StringMutations = {
  /**
   * Converte tutto in maiuscolo (test case sensitivity)
   */
  uppercase: (s: string) => s.toUpperCase(),

  /**
   * Converte tutto in minuscolo
   */
  lowercase: (s: string) => s.toLowerCase(),

  /**
   * Aggiunge whitespace trailing/leading
   */
  addWhitespace: (s: string) => '   ' + s + '   ',

  /**
   * Inserisce emoji unicode (test UTF-8)
   */
  addEmoji: (s: string) => '👾' + s + '👾',

  /**
   * Sostituisce caratteri con asterischi (test masking)
   */
  maskChars: (s: string) => s.replace(/./g, '*'),

  /**
   * Inverte la stringa
   */
  reverse: (s: string) => s.split('').reverse().join(''),

  /**
   * Ripete la stringa (test lunghezza)
   */
  repeat: (s: string) => s.repeat(3).slice(0, 100),

  /**
   * Sostituisce vocali con emoji (test encoding)
   */
  replaceVowels: (s: string) => s.replace(/[aeiouAEIOU]/g, '💥'),

  /**
   * Aggiunge newline (test multiline)
   */
  addNewlines: (s: string) => s + '\nnewline\n',

  /**
   * Aggiunge caratteri speciali SQL (test injection)
   */
  sqlInjection: (s: string) => s + "'; DROP TABLE users;--",

  /**
   * Aggiunge null bytes (test security)
   */
  nullBytes: (s: string) => s + '\0\0\0',

  /**
   * Aggiunge caratteri di controllo
   */
  controlChars: (s: string) => '\x00\x01\x02' + s + '\x03\x04',
};

/**
 * Strategia di mutazione per email
 */
export const EmailMutations = {
  /**
   * Sostituisce @ con emoji
   */
  emojiAt: (email: string) => email.replace('@', '💥'),

  /**
   * Aggiunge punti multipli
   */
  doubleDots: (email: string) => email.replace('.', '..'),

  /**
   * Domain con caratteri unicode
   */
  unicodeDomain: (email: string) => email.replace('.com', '.💻com'),

  /**
   * Case mixing (tEsT@ExAmPlE.cOm)
   */
  caseMixing: (email: string) => {
    return email
      .split('')
      .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
      .join('');
  },

  /**
   * Aggiunge spazi
   */
  addSpaces: (email: string) => email.replace('@', ' @ '),

  /**
   * Domain estremamente lungo
   */
  longDomain: (email: string) => email.replace('.com', '.verylongdomainname.com'),
};

/**
 * Strategia di mutazione per JSON
 */
export const JSONMutations = {
  /**
   * Aggiunge nesting profondo
   */
  deepNesting: (json: string) => {
    try {
      const obj = JSON.parse(json);
      let nested = obj;
      for (let i = 0; i < 50; i++) {
        nested = { level: i, data: nested };
      }
      return JSON.stringify(nested);
    } catch {
      return json;
    }
  },

  /**
   * Aggiunge chiavi duplicate
   */
  duplicateKeys: (json: string) => {
    return json.replace('}', ', "key": "value1", "key": "value2"}');
  },

  /**
   * Aggiunge array molto grande
   */
  largeArray: (json: string) => {
    try {
      const obj = JSON.parse(json);
      obj.largeArray = new Array(1000).fill('item');
      return JSON.stringify(obj);
    } catch {
      return json;
    }
  },

  /**
   * Caratteri unicode nelle chiavi
   */
  unicodeKeys: (json: string) => {
    return json.replace(/"(\w+)":/g, '"$1💥":');
  },

  /**
   * Trailing comma (invalid JSON)
   */
  trailingComma: (json: string) => {
    return json.replace('}', ',}');
  },
};

/**
 * Strategia di mutazione per numeri
 */
export const NumberMutations = {
  /**
   * Aggiunge zeri leading
   */
  leadingZeros: (n: number) => '0000' + n.toString(),

  /**
   * Formato esponenziale
   */
  exponential: (n: number) => n.toExponential(),

  /**
   * Numero negativo
   */
  negative: (n: number) => (-Math.abs(n)).toString(),

  /**
   * Numero con decimali
   */
  decimal: (n: number) => (n + 0.999).toString(),

  /**
   * Numero molto grande
   */
  veryLarge: (n: number) => (n * 999999).toString(),
};

/**
 * InputMutator - Classe principale per fuzzing intelligente
 */
export class InputMutator {
  /**
   * Applica una mutazione randomica a una stringa
   */
  static mutateString(input: string): MutationResult {
    const mutations = Object.entries(StringMutations);
    const [mutationType, mutationFn] = mutations[Math.floor(Math.random() * mutations.length)];

    return {
      original: input,
      mutated: mutationFn(input),
      mutationType,
    };
  }

  /**
   * Applica una mutazione randomica a una email
   */
  static mutateEmail(input: string): MutationResult {
    const mutations = Object.entries(EmailMutations);
    const [mutationType, mutationFn] = mutations[Math.floor(Math.random() * mutations.length)];

    return {
      original: input,
      mutated: mutationFn(input),
      mutationType,
    };
  }

  /**
   * Applica una mutazione randomica a un JSON
   */
  static mutateJSON(input: string): MutationResult {
    const mutations = Object.entries(JSONMutations);
    const [mutationType, mutationFn] = mutations[Math.floor(Math.random() * mutations.length)];

    return {
      original: input,
      mutated: mutationFn(input),
      mutationType,
    };
  }

  /**
   * Applica una mutazione randomica a un numero
   */
  static mutateNumber(input: number): MutationResult {
    const mutations = Object.entries(NumberMutations);
    const [mutationType, mutationFn] = mutations[Math.floor(Math.random() * mutations.length)];

    return {
      original: input.toString(),
      mutated: mutationFn(input),
      mutationType,
    };
  }

  /**
   * Genera N varianti mutate di un input
   */
  static generateVariants(input: string, count: number, type: 'string' | 'email' | 'json' = 'string'): MutationResult[] {
    const variants: MutationResult[] = [];

    for (let i = 0; i < count; i++) {
      switch (type) {
        case 'email':
          variants.push(this.mutateEmail(input));
          break;
        case 'json':
          variants.push(this.mutateJSON(input));
          break;
        default:
          variants.push(this.mutateString(input));
      }
    }

    return variants;
  }

  /**
   * Applica fuzzing a tutti gli input heuristici
   */
  static fuzzAll(inputs: Record<string, string[]>): Record<string, MutationResult[]> {
    const fuzzed: Record<string, MutationResult[]> = {};

    for (const [key, values] of Object.entries(inputs)) {
      fuzzed[key] = values.flatMap((value) => {
        // Determina il tipo di mutazione in base al campo
        let type: 'string' | 'email' | 'json' = 'string';
        if (key.toLowerCase().includes('email')) type = 'email';
        if (key.toLowerCase().includes('json') || key.toLowerCase().includes('config')) type = 'json';

        // Genera 3 varianti mutate per ogni input
        return this.generateVariants(value, 3, type);
      });
    }

    return fuzzed;
  }
}

/**
 * Utility per combinare fuzzing + oracle validation
 */
export class FuzzEngine {
  /**
   * Esegue fuzzing controllato con validazione oracle
   */
  static fuzzWithOracle<T>(
    inputs: string[],
    mutator: (input: string) => MutationResult,
    oracle: (input: string) => T
  ): Array<{ mutation: MutationResult; oraclePrediction: T }> {
    return inputs.map((input) => {
      const mutation = mutator(input);
      const oraclePrediction = oracle(mutation.mutated);

      return {
        mutation,
        oraclePrediction,
      };
    });
  }

  /**
   * Genera report di copertura fuzzing
   */
  static generateFuzzReport(results: Array<{ mutation: MutationResult; oraclePrediction: any }>): {
    totalMutations: number;
    mutationTypes: Record<string, number>;
    expectedFailures: number;
    expectedSuccesses: number;
  } {
    const mutationTypes: Record<string, number> = {};
    let expectedFailures = 0;
    let expectedSuccesses = 0;

    for (const result of results) {
      // Conta tipi di mutazioni
      mutationTypes[result.mutation.mutationType] = (mutationTypes[result.mutation.mutationType] || 0) + 1;

      // Conta predizioni oracle
      if (result.oraclePrediction.success === false) {
        expectedFailures++;
      } else {
        expectedSuccesses++;
      }
    }

    return {
      totalMutations: results.length,
      mutationTypes,
      expectedFailures,
      expectedSuccesses,
    };
  }
}

/**
 * Esempio di utilizzo:
 * 
 * import { InputMutator, FuzzEngine } from './InputMutator';
 * import { FormOracle } from './form.spec';
 * 
 * // 1. Fuzzing semplice
 * const mutation = InputMutator.mutateString('alice');
 * console.log(mutation);
 * // { original: 'alice', mutated: 'ALICE', mutationType: 'uppercase' }
 * 
 * // 2. Fuzzing + Oracle
 * const results = FuzzEngine.fuzzWithOracle(
 *   ['alice', 'bob', 'charlie'],
 *   InputMutator.mutateString,
 *   (input) => FormOracle.predictUsername(input)
 * );
 * 
 * // 3. Report di copertura
 * const report = FuzzEngine.generateFuzzReport(results);
 * console.log(report);
 * // { totalMutations: 3, mutationTypes: { uppercase: 1, ... }, expectedFailures: 1, expectedSuccesses: 2 }
 */
