/**
 * ===========================================================
 * EXPLORATION SEEDS
 * ===========================================================
 * New input patterns to break convergence plateau (Gen 9+)
 * 
 * USAGE:
 *   Import and inject into mutation pipeline when entropy < 0.7
 *   Adds semantic diversity beyond current JWT test coverage
 * ===========================================================
 */

export interface ExplorationSeed {
  category: 'jwt' | 'http' | 'encoding' | 'injection';
  description: string;
  inputPattern: string;
  expectedBehavior: 'reject' | 'accept' | 'transform' | 'exception';
  securityImpact: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * 🧬 JWT-Specific Edge Cases
 * Currently missing from Gen 9 stable test suite
 */
export const JWT_EDGE_CASES: ExplorationSeed[] = [
  {
    category: 'jwt',
    description: 'Expired JWT token (exp claim in the past)',
    inputPattern: 'eyJ...exp:1234567890...', // timestamp < now
    expectedBehavior: 'reject',
    securityImpact: 'critical'
  },
  {
    category: 'jwt',
    description: 'JWT with future nbf (not-before) claim',
    inputPattern: 'eyJ...nbf:9999999999...',
    expectedBehavior: 'reject',
    securityImpact: 'high'
  },
  {
    category: 'jwt',
    description: 'JWT with null signature (alg: none)',
    inputPattern: 'eyJhbGciOiJub25lIn0.payload.',
    expectedBehavior: 'reject',
    securityImpact: 'critical'
  },
  {
    category: 'jwt',
    description: 'JWT with mismatched kid (key ID)',
    inputPattern: 'eyJ...kid:"wrong-key-id"...',
    expectedBehavior: 'reject',
    securityImpact: 'high'
  },
  {
    category: 'jwt',
    description: 'JWT with roles array containing null values',
    inputPattern: '{"roles": [{"idRuolo": null}, {"idRuolo": "ADMIN"}]}',
    expectedBehavior: 'transform', // Should filter nulls or reject
    securityImpact: 'medium'
  },
  {
    category: 'jwt',
    description: 'JWT with duplicate roles',
    inputPattern: '{"roles": [{"idRuolo": "ADMIN"}, {"idRuolo": "ADMIN"}]}',
    expectedBehavior: 'transform', // Should deduplicate
    securityImpact: 'low'
  },
  {
    category: 'jwt',
    description: 'JWT with empty roles array',
    inputPattern: '{"roles": []}',
    expectedBehavior: 'accept', // Should assign default ROLE_USER
    securityImpact: 'medium'
  },
  {
    category: 'jwt',
    description: 'JWT with roles as string instead of array',
    inputPattern: '{"roles": "ADMIN,USER"}',
    expectedBehavior: 'reject', // Type mismatch
    securityImpact: 'high'
  }
];

/**
 * 🌐 HTTP Header Edge Cases
 */
export const HTTP_HEADER_EDGE_CASES: ExplorationSeed[] = [
  {
    category: 'http',
    description: 'Multiple Authorization headers (array injection)',
    inputPattern: 'Authorization: Bearer token1\\nAuthorization: Bearer token2',
    expectedBehavior: 'reject', // Ambiguous auth
    securityImpact: 'critical'
  },
  {
    category: 'http',
    description: 'Case-insensitive header name (authorization vs Authorization)',
    inputPattern: 'authorization: Bearer token',
    expectedBehavior: 'accept', // HTTP headers are case-insensitive
    securityImpact: 'low'
  },
  {
    category: 'http',
    description: 'Bearer with extra whitespace',
    inputPattern: 'Authorization:   Bearer   token   ',
    expectedBehavior: 'accept', // Should trim
    securityImpact: 'low'
  },
  {
    category: 'http',
    description: 'Non-standard HTTP method (PATCH, OPTIONS, TRACE)',
    inputPattern: 'PATCH /api/resource',
    expectedBehavior: 'accept', // Should handle all methods
    securityImpact: 'medium'
  },
  {
    category: 'http',
    description: 'Request with null servlet path',
    inputPattern: 'servletPath: null',
    expectedBehavior: 'exception', // NullPointerException?
    securityImpact: 'high'
  }
];

/**
 * 🔤 Encoding & Character Edge Cases
 */
export const ENCODING_EDGE_CASES: ExplorationSeed[] = [
  {
    category: 'encoding',
    description: 'JWT with UTF-8 characters in payload',
    inputPattern: 'eyJ...{"name":"用户"}...',
    expectedBehavior: 'accept',
    securityImpact: 'low'
  },
  {
    category: 'encoding',
    description: 'JWT with Base64 padding issues',
    inputPattern: 'eyJhbGciOiJSUzI1NiJ9.payload', // Missing padding
    expectedBehavior: 'reject',
    securityImpact: 'medium'
  },
  {
    category: 'encoding',
    description: 'Bearer token with null bytes',
    inputPattern: 'Bearer token\\x00injected',
    expectedBehavior: 'reject',
    securityImpact: 'critical'
  },
  {
    category: 'encoding',
    description: 'Bearer token with URL-encoded characters',
    inputPattern: 'Bearer token%20with%20spaces',
    expectedBehavior: 'reject', // Should not decode
    securityImpact: 'medium'
  }
];

/**
 * 💉 Injection & Security Edge Cases
 */
export const INJECTION_EDGE_CASES: ExplorationSeed[] = [
  {
    category: 'injection',
    description: 'SQL injection attempt in JWT claim',
    inputPattern: '{"sub": "admin\' OR 1=1--"}',
    expectedBehavior: 'accept', // JWT parser should not execute SQL
    securityImpact: 'critical' // If backend uses sub in SQL query
  },
  {
    category: 'injection',
    description: 'XSS payload in JWT claim',
    inputPattern: '{"name": "<script>alert(1)</script>"}',
    expectedBehavior: 'accept', // Filter should not render HTML
    securityImpact: 'high'
  },
  {
    category: 'injection',
    description: 'Path traversal in roles claim',
    inputPattern: '{"roles": [{"idRuolo": "../../../etc/passwd"}]}',
    expectedBehavior: 'accept', // Filter should not access filesystem
    securityImpact: 'medium'
  },
  {
    category: 'injection',
    description: 'LDAP injection in subject claim',
    inputPattern: '{"sub": "admin)(|(password=*))"}',
    expectedBehavior: 'accept',
    securityImpact: 'high'
  }
];

/**
 * 🎯 Master seed collection
 */
export const ALL_EXPLORATION_SEEDS = [
  ...JWT_EDGE_CASES,
  ...HTTP_HEADER_EDGE_CASES,
  ...ENCODING_EDGE_CASES,
  ...INJECTION_EDGE_CASES
];

/**
 * 🔀 Seed selector based on current population entropy
 * 
 * @param entropy - Current population entropy (0-1)
 * @param securityFocus - Prioritize security-critical seeds
 * @returns Selected seeds to inject into mutation pipeline
 */
export function selectSeedsForExploration(
  entropy: number,
  securityFocus: boolean = true
): ExplorationSeed[] {
  let seeds: ExplorationSeed[] = [];

  if (entropy < 0.7) {
    // Low entropy → aggressive diversification
    seeds = ALL_EXPLORATION_SEEDS;
  } else if (entropy < 0.85) {
    // Medium entropy → targeted exploration
    seeds = securityFocus
      ? ALL_EXPLORATION_SEEDS.filter(s => s.securityImpact === 'critical' || s.securityImpact === 'high')
      : JWT_EDGE_CASES.concat(HTTP_HEADER_EDGE_CASES);
  } else {
    // High entropy → minor refinements
    seeds = JWT_EDGE_CASES.slice(0, 3);
  }

  console.log(`🌱 Selected ${seeds.length} exploration seeds (entropy=${entropy.toFixed(2)})`);
  return seeds;
}

/**
 * 📝 Generate test code template from seed
 * 
 * TODO: Integrate with Copilot generateStructured() for full test generation
 */
export function seedToTestTemplate(seed: ExplorationSeed): string {
  return `
    /* Exploration seed: ${seed.description} */
    @Test
    void test_${seed.category}_${seed.description.replace(/[^a-zA-Z0-9]/g, '_')}() throws Exception {
        // Input: ${seed.inputPattern}
        // Expected: ${seed.expectedBehavior}
        // Security Impact: ${seed.securityImpact}
        
        // TODO: Generate full test body via Copilot
    }
  `.trim();
}
