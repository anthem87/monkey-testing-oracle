/**
 * ===================================================================
 * SERVER.TS - Backend Express con validazione form
 * ===================================================================
 * 
 * Espone due endpoint:
 * - GET /api/schema → ritorna lo schema del form
 * - POST /api/submit → riceve e valida i dati del form
 * 
 * Nessuna logica oracolare o euristica qui, solo validazione strutturale.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'path';
import {
  validateText,
  validateNumber,
  validateEmail,
  validateJSONSafe,
  validateFile,
  validateDate,
  combineValidationResults,
  ValidationResult
} from './validators';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configurazione multer per upload file
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB max
  },
});

/**
 * Schema del form - Lo stesso usato nel frontend
 * In produzione potrebbe essere centralizzato in un file condiviso
 */
const formSchema = [
  {
    id: "username",
    label: "Username",
    type: "text",
    required: true,
    constraints: { minLength: 3, maxLength: 20 }
  },
  {
    id: "email",
    label: "Email",
    type: "email",
    required: true
  },
  {
    id: "password",
    label: "Password",
    type: "password",
    required: true,
    constraints: { minLength: 8 }
  },
  {
    id: "age",
    label: "Age",
    type: "number",
    constraints: { min: 0, max: 120 }
  },
  {
    id: "birthDate",
    label: "Birth Date",
    type: "date"
  },
  {
    id: "role",
    label: "Role",
    type: "select",
    required: true,
    options: ["Admin", "User", "Guest"]
  },
  {
    id: "avatar",
    label: "Profile Image",
    type: "file"
  },
  {
    id: "config",
    label: "Configuration JSON",
    type: "textarea"
  }
];

/**
 * GET /api/schema
 * Ritorna lo schema del form in formato JSON
 */
app.get('/api/schema', (req: Request, res: Response) => {
  res.json(formSchema);
});

/**
 * POST /api/submit
 * Riceve e valida i dati del form
 */
app.post(
  '/api/submit',
  upload.single('avatar'), // Gestisce file upload
  async (req: Request, res: Response) => {
    try {
      const issues: string[] = [];

      // Log dei dati ricevuti (per debug)
      console.log('📨 Dati ricevuti:', {
        body: req.body,
        file: req.file ? { name: req.file.originalname, size: req.file.size } : null
      });

      // Valida ogni campo in base allo schema
      for (const field of formSchema) {
        const value = req.body[field.id];
        const fieldName = field.label;

        // Check campo required
        if (field.required && (value === undefined || value === null || value === '')) {
          if (field.type === 'file' && !req.file) {
            // Skip file se non required
            continue;
          }
          if (field.type !== 'file') {
            issues.push(`${fieldName} is required`);
            continue;
          }
        }

        // Skip validazione se campo vuoto e non required
        if (!field.required && (value === undefined || value === null || value === '')) {
          continue;
        }

        // Validazione per tipo
        let result: ValidationResult;

        switch (field.type) {
          case 'text':
          case 'password':
            result = validateText(value, {
              min: field.constraints?.minLength,
              max: field.constraints?.maxLength,
              fieldName
            });
            issues.push(...result.issues);
            break;

          case 'email':
            result = validateEmail(value, fieldName);
            issues.push(...result.issues);
            break;

          case 'number':
            result = validateNumber(value, {
              min: field.constraints?.min,
              max: field.constraints?.max,
              fieldName
            });
            issues.push(...result.issues);
            break;

          case 'date':
            if (value) {
              result = validateDate(value, { fieldName });
              issues.push(...result.issues);
            }
            break;

          case 'select':
            if (field.options && !field.options.includes(value)) {
              issues.push(`${fieldName} must be one of: ${field.options.join(', ')}`);
            }
            break;

          case 'textarea':
            // Validate as JSON if field id is 'config' and has content
            if (field.id === 'config' && value && value.trim()) {
              result = validateJSONSafe(value, {
                maxDepth: 10,
                maxLength: 10000,
                fieldName
              });
              issues.push(...result.issues);
            }
            break;

          case 'file':
            if (req.file) {
              result = validateFile(req.file, {
                maxSizeMB: 2,
                allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
                fieldName
              });
              issues.push(...result.issues);
            }
            break;
        }
      }

      // Risposta al client
      if (issues.length > 0) {
        return res.status(422).json({
          status: 'error',
          message: 'Validation failed',
          issues
        });
      }

      // Successo
      res.json({
        status: 'ok',
        message: 'Form submitted successfully!',
        data: {
          ...req.body,
          avatar: req.file ? {
            name: req.file.originalname,
            size: req.file.size,
            type: req.file.mimetype
          } : null
        }
      });

    } catch (error) {
      console.error('❌ Errore nel processing:', error);

      // Gestione errori multer (file troppo grande)
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            status: 'error',
            message: 'File too large (max 2MB)',
            issues: ['File exceeds maximum size of 2MB']
          });
        }
      }

      // Altri errori
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        issues: [error instanceof Error ? error.message : 'Unknown error']
      });
    }
  }
);

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Avvio server
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📋 Form schema available at http://localhost:${PORT}/api/schema`);
  console.log(`📝 Submit endpoint at http://localhost:${PORT}/api/submit`);
  console.log(`💚 Health check at http://localhost:${PORT}/api/health`);
});

export default app;
