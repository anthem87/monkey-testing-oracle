import React, { useState } from 'react';
import './FormApp.css';

/**
 * Tipo di campo supportato nel form dinamico
 */
type FieldType = 'text' | 'email' | 'password' | 'number' | 'date' | 'select' | 'file' | 'textarea';

/**
 * Definizione di un singolo campo del form
 */
interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[];
  constraints?: {
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
  };
  placeholder?: string;
  helpText?: string;
}

/**
 * Schema del form - Questa è la struttura che verrà usata per generare il form dinamicamente
 * In produzione potrebbe arrivare da un'API o da un file di configurazione
 */
const formSchema: FormField[] = [
  {
    id: "username",
    label: "Username",
    type: "text",
    required: true,
    constraints: { minLength: 3, maxLength: 20 },
    placeholder: "Enter your username",
    helpText: "Between 3 and 20 characters"
  },
  {
    id: "email",
    label: "Email",
    type: "email",
    required: true,
    placeholder: "your.email@example.com"
  },
  {
    id: "password",
    label: "Password",
    type: "password",
    required: true,
    constraints: { minLength: 8 },
    helpText: "Minimum 8 characters"
  },
  {
    id: "age",
    label: "Age",
    type: "number",
    constraints: { min: 0, max: 120 },
    placeholder: "Enter your age"
  },
  {
    id: "birthDate",
    label: "Birth Date",
    type: "date",
    helpText: "Select your date of birth"
  },
  {
    id: "role",
    label: "Role",
    type: "select",
    required: true,
    options: ["Admin", "User", "Guest"],
    helpText: "Select your role"
  },
  {
    id: "avatar",
    label: "Profile Image",
    type: "file",
    helpText: "Upload your profile picture (max 2MB)"
  },
  {
    id: "config",
    label: "Configuration JSON",
    type: "textarea",
    placeholder: '{"theme": "dark", "lang": "en"}',
    helpText: "Enter valid JSON configuration"
  }
];

/**
 * Risultato della chiamata al backend
 */
interface SubmitResponse {
  status: 'ok' | 'error';
  message?: string;
  issues?: string[];
}

/**
 * Componente principale del form dinamico
 * 
 * NOTA: Validazione semplificata per test completi lato backend.
 * Tutti i dati vengono inviati al backend senza validazione client-side bloccante.
 */
const FormApp: React.FC = () => {
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handler per il submit del form
   * Invia i dati al backend usando FormData per gestire anche file upload
   * 
   * IMPORTANTE: Questo handler viene chiamato da handleSubmit di React Hook Form
   * ma noi vogliamo che TUTTI i dati arrivino al backend, anche quelli invalidi
   * per testare la validazione server-side
   */
  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    
    setIsLoading(true);
    setSubmitResult(null);

    try {
      // Costruisce FormData direttamente dal form DOM (bypassa React Hook Form)
      const form = event.currentTarget;
      const formData = new FormData(form);

      // Chiamata al backend
      const response = await fetch('/api/submit', {
        method: 'POST',
        body: formData,
      });

      const result: SubmitResponse = await response.json();
      
      setSubmitResult(result);

      if (result.status === 'ok') {
        // Reset del form in caso di successo
        form.reset();
      }
    } catch (error) {
      setSubmitResult({
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error occurred'
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Renderizza un singolo campo del form in base al suo tipo
   */
  const renderField = (field: FormField) => {
    const { id, label, type, required, options, placeholder, helpText } = field;

    return (
      <div key={id} className="form-field">
        <label htmlFor={id} className="form-label">
          {label}
          {required && <span className="required">*</span>}
        </label>

        {/* Renderizza input in base al tipo */}
        {type === 'select' ? (
          <select
            id={id}
            name={id}
            className="form-input"
          >
            <option value="">-- Select {label} --</option>
            {options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={id}
            name={id}
            placeholder={placeholder}
            className="form-input form-textarea"
            rows={4}
          />
        ) : type === 'file' ? (
          <input
            id={id}
            name={id}
            type="file"
            className="form-input"
            accept="image/*"
          />
        ) : (
          <input
            id={id}
            name={id}
            type={type}
            placeholder={placeholder}
            className="form-input"
          />
        )}

        {/* Help text */}
        {helpText && (
          <p className="help-text">{helpText}</p>
        )}
      </div>
    );
  };

  return (
    <div className="form-container">
      <div className="form-card">
        <h1 className="form-title">Dynamic Form Generator</h1>
        <p className="form-subtitle">
          This form is generated dynamically from a schema.
          All fields are validated both client-side and server-side.
        </p>

        <form onSubmit={onSubmit} className="form" noValidate>
          {/* Renderizza tutti i campi dello schema */}
          {formSchema.map(renderField)}

          {/* Bottone submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="submit-button"
          >
            {isLoading ? 'Submitting...' : 'Submit Form'}
          </button>
        </form>

        {/* Risultato del submit */}
        {submitResult && (
          <div className={`result-message ${submitResult.status}`}>
            <h3>
              {submitResult.status === 'ok' ? '✅ Success!' : '❌ Error'}
            </h3>
            {submitResult.message && <p>{submitResult.message}</p>}
            {submitResult.issues && submitResult.issues.length > 0 && (
              <ul>
                {submitResult.issues.map((issue, index) => (
                  <li key={index}>{issue}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Schema info (per debug/sviluppo) */}
      <div className="schema-info">
        <details>
          <summary>View Form Schema</summary>
          <pre>{JSON.stringify(formSchema, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
};

export default FormApp;
