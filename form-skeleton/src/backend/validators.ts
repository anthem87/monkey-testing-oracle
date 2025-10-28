/**
 * ===================================================================
 * VALIDATORS.TS - Funzioni di validazione base senza logica oracolare
 * ===================================================================
 * 
 * Questo modulo contiene SOLO validazioni sintattiche e strutturali.
 * Non c'è alcuna euristica o intelligenza artificiale qui.
 * L'oracolo verrà iniettato nel secondo prompt per i test.
 */

import { Express } from 'express';

/**
 * Risultato della validazione
 */
export interface ValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Valida una stringa di testo con vincoli di lunghezza
 */
export function validateText(
  value: string,
  options?: {
    min?: number;
    max?: number;
    pattern?: RegExp;
    fieldName?: string;
  }
): ValidationResult {
  const issues: string[] = [];
  const fieldName = options?.fieldName || 'Text';

  // Check tipo
  if (typeof value !== 'string') {
    issues.push(`${fieldName} must be a string`);
    return { valid: false, issues };
  }

  // Check lunghezza minima
  if (options?.min !== undefined && value.length < options.min) {
    issues.push(`${fieldName} must be at least ${options.min} characters long`);
  }

  // Check lunghezza massima
  if (options?.max !== undefined && value.length > options.max) {
    issues.push(`${fieldName} must be at most ${options.max} characters long`);
  }

  // Check pattern
  if (options?.pattern && !options.pattern.test(value)) {
    issues.push(`${fieldName} does not match required pattern`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Valida un numero con range min/max
 */
export function validateNumber(
  value: any,
  options?: {
    min?: number;
    max?: number;
    fieldName?: string;
  }
): ValidationResult {
  const issues: string[] = [];
  const fieldName = options?.fieldName || 'Number';

  // Converti stringa in numero se necessario
  const num = typeof value === 'string' ? parseFloat(value) : value;

  // Check se è un numero valido
  if (typeof num !== 'number' || isNaN(num)) {
    issues.push(`${fieldName} must be a valid number`);
    return { valid: false, issues };
  }

  // Check per Infinity
  if (!isFinite(num)) {
    issues.push(`${fieldName} must be a finite number`);
    return { valid: false, issues };
  }

  // Check range minimo
  if (options?.min !== undefined && num < options.min) {
    issues.push(`${fieldName} must be at least ${options.min}`);
  }

  // Check range massimo
  if (options?.max !== undefined && num > options.max) {
    issues.push(`${fieldName} must be at most ${options.max}`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Valida formato email (validazione base)
 */
export function validateEmail(value: string, fieldName: string = 'Email'): ValidationResult {
  const issues: string[] = [];

  if (typeof value !== 'string') {
    issues.push(`${fieldName} must be a string`);
    return { valid: false, issues };
  }

  // Pattern email base (non esaustivo ma sicuro)
  const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

  if (!emailPattern.test(value)) {
    issues.push(`${fieldName} is not a valid email address`);
  }

  if (value.length > 254) {
    issues.push(`${fieldName} is too long (max 254 characters)`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Valida una stringa JSON in modo sicuro
 * Previene JSON troppo profondi o strutture pericolose
 */
export function validateJSONSafe(
  value: string,
  options?: {
    maxDepth?: number;
    maxLength?: number;
    fieldName?: string;
  }
): ValidationResult {
  const issues: string[] = [];
  const fieldName = options?.fieldName || 'JSON';
  const maxDepth = options?.maxDepth || 10;
  const maxLength = options?.maxLength || 10000;

  // Check lunghezza stringa
  if (value.length > maxLength) {
    issues.push(`${fieldName} exceeds maximum length of ${maxLength} characters`);
    return { valid: false, issues };
  }

  // Try parse
  let parsed: any;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    issues.push(`${fieldName} is not valid JSON: ${error instanceof Error ? error.message : 'Parse error'}`);
    return { valid: false, issues };
  }

  // Check profondità (protezione contro stack overflow)
  function checkDepth(obj: any, depth: number = 0): number {
    if (depth > maxDepth) {
      return depth;
    }

    if (typeof obj !== 'object' || obj === null) {
      return depth;
    }

    let maxChildDepth = depth;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const childDepth = checkDepth(obj[key], depth + 1);
        maxChildDepth = Math.max(maxChildDepth, childDepth);
      }
    }

    return maxChildDepth;
  }

  const depth = checkDepth(parsed);
  if (depth > maxDepth) {
    issues.push(`${fieldName} exceeds maximum nesting depth of ${maxDepth}`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Valida un file upload (dimensione e tipo)
 */
export function validateFile(
  file: Express.Multer.File,
  options?: {
    maxSizeMB?: number;
    allowedMimeTypes?: string[];
    fieldName?: string;
  }
): ValidationResult {
  const issues: string[] = [];
  const fieldName = options?.fieldName || 'File';
  const maxSizeMB = options?.maxSizeMB || 2;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  // Check dimensione
  if (file.size > maxSizeBytes) {
    issues.push(`${fieldName} exceeds maximum size of ${maxSizeMB}MB`);
  }

  // Check tipo MIME se specificato
  if (options?.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    if (!options.allowedMimeTypes.includes(file.mimetype)) {
      issues.push(
        `${fieldName} type ${file.mimetype} is not allowed. Allowed types: ${options.allowedMimeTypes.join(', ')}`
      );
    }
  }

  // Check se il file è vuoto
  if (file.size === 0) {
    issues.push(`${fieldName} is empty`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Valida una data
 */
export function validateDate(
  value: string,
  options?: {
    minDate?: Date;
    maxDate?: Date;
    fieldName?: string;
  }
): ValidationResult {
  const issues: string[] = [];
  const fieldName = options?.fieldName || 'Date';

  const date = new Date(value);

  // Check se è una data valida
  if (isNaN(date.getTime())) {
    issues.push(`${fieldName} is not a valid date`);
    return { valid: false, issues };
  }

  // Check range minimo
  if (options?.minDate && date < options.minDate) {
    issues.push(`${fieldName} must be after ${options.minDate.toISOString().split('T')[0]}`);
  }

  // Check range massimo
  if (options?.maxDate && date > options.maxDate) {
    issues.push(`${fieldName} must be before ${options.maxDate.toISOString().split('T')[0]}`);
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Combina più risultati di validazione
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  const allIssues = results.flatMap(r => r.issues);
  return {
    valid: allIssues.length === 0,
    issues: allIssues
  };
}
