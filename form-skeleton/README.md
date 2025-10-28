# 📋 Form Skeleton - Dynamic Form with Validation

## 🎯 Project Overview

This is a **full-stack TypeScript project skeleton** that provides:

- **Frontend**: React app with dynamic form generation using React Hook Form
- **Backend**: Express.js API with validation and file upload support
- **Testing**: Playwright setup ready for AI-generated heuristic tests

⚠️ **This is the BASE SKELETON WITHOUT THE ORACLE**

The intelligent testing layer will be added with the second prompt: **"Form Oracle Heuristic Tester"**

---

## 📦 Project Structure

```
form-skeleton/
├── src/
│   ├── frontend/          # React frontend
│   │   ├── FormApp.tsx    # Main form component with dynamic rendering
│   │   ├── FormApp.css    # Styles
│   │   ├── main.tsx       # Entry point
│   │   ├── index.html     # HTML template
│   │   └── index.css      # Global styles
│   │
│   └── backend/           # Express backend
│       ├── server.ts      # API endpoints (/api/schema, /api/submit)
│       └── validators.ts  # Validation functions (text, number, email, JSON, file, date)
│
├── tests/
│   └── form.spec.ts       # ⚠️ PLACEHOLDER - Will be filled by AI prompt
│
├── playwright.config.ts   # Playwright configuration
├── vite.config.ts         # Vite configuration
├── tsconfig.json          # TypeScript config (frontend)
├── tsconfig.backend.json  # TypeScript config (backend)
├── package.json           # Dependencies and scripts
└── README.md              # This file
```

---

## 🚀 Getting Started

### 1️⃣ Install Dependencies

```bash
cd form-skeleton
npm install
```

### 2️⃣ Install Playwright Browsers

```bash
npm run playwright:install
```

### 3️⃣ Run Frontend + Backend

```bash
# Run both frontend and backend simultaneously
npm run dev

# OR run separately:
npm run dev:frontend  # Frontend on http://localhost:5173
npm run dev:backend   # Backend on http://localhost:3001
```

### 4️⃣ Access the Application

- **Frontend**: http://localhost:5173
- **Backend API**:
  - Schema: http://localhost:3001/api/schema
  - Submit: http://localhost:3001/api/submit (POST)
  - Health: http://localhost:3001/api/health

---

## 📋 Form Schema

The form is generated dynamically from this schema:

```typescript
{
  id: "username",
  label: "Username",
  type: "text",
  required: true,
  constraints: { minLength: 3, maxLength: 20 }
}
```

**Supported field types:**
- `text` - Text input with min/max length
- `email` - Email validation
- `password` - Password input with constraints
- `number` - Numeric input with range
- `date` - Date picker
- `select` - Dropdown with options
- `file` - File upload (max 2MB, images only)
- `textarea` - For JSON config

---

## 🧪 Testing

### Current State (Skeleton Only)

```bash
npm run test:e2e        # Run basic placeholder test
npm run test:e2e:headed # Run with browser visible
npm run test:e2e:debug  # Debug mode
npm run test:e2e:ui     # Playwright UI mode
```

⚠️ **The test file `tests/form.spec.ts` is currently a PLACEHOLDER**

It contains only a basic test to verify the form loads.

### Next Step: AI-Generated Heuristic Tests

Use the **"Form Oracle Heuristic Tester"** prompt to generate:

✅ Heuristic test cases for each field type
✅ Oracle logic to determine valid/invalid inputs
✅ Edge cases and corner cases
✅ ReDoS-safe regex testing
✅ Performance checks
✅ Iterative test loop with feedback

---

## 🔧 Backend Validation

The backend validates:

- **Required fields**: Checks if required fields are present
- **Text constraints**: Min/max length
- **Number ranges**: Min/max values
- **Email format**: Standard email regex
- **JSON safety**: Max depth (prevents stack overflow)
- **File upload**: Size limit (2MB), MIME type checking
- **Select options**: Value must be in allowed list

All validation happens in `src/backend/validators.ts`

---

## 📝 API Endpoints

### GET `/api/schema`

Returns the form schema in JSON format.

**Response:**
```json
[
  {
    "id": "username",
    "label": "Username",
    "type": "text",
    "required": true,
    "constraints": { "minLength": 3, "maxLength": 20 }
  },
  ...
]
```

### POST `/api/submit`

Validates and processes form data.

**Request:** `multipart/form-data` (FormData)

**Success Response (200):**
```json
{
  "status": "ok",
  "message": "Form submitted successfully!",
  "data": { ... }
}
```

**Error Response (422):**
```json
{
  "status": "error",
  "message": "Validation failed",
  "issues": [
    "Username must be at least 3 characters long",
    "Email is not a valid email address"
  ]
}
```

### GET `/api/health`

Health check endpoint.

---

## 🛠️ Development

### Build for Production

```bash
npm run build  # Builds both frontend and backend
```

Output:
- Frontend: `dist/frontend/`
- Backend: `dist/backend/`

### Linting

```bash
npm run lint
```

---

## 🎨 Customization

### Adding New Fields

1. Update `formSchema` in both:
   - `src/frontend/FormApp.tsx`
   - `src/backend/server.ts`

2. Add validation logic in `src/backend/validators.ts` if needed

3. Re-run the AI test generation prompt to update tests

---

## ⚠️ Important Notes

### No Oracle Yet

This skeleton does **NOT** include:
- ❌ Heuristic test generation
- ❌ Oracle decision logic
- ❌ Edge case discovery
- ❌ Automatic input variation
- ❌ ReDoS detection
- ❌ Performance profiling

These features will be added by the **"Form Oracle Heuristic Tester"** prompt.

### Ready for AI Testing

The project is structured to receive AI-generated tests that will:
1. Analyze the form schema
2. Generate heuristic inputs for each field
3. Use an oracle to predict expected outcomes
4. Run tests and compare actual vs expected
5. Iterate and refine based on results

---

## 📚 Technologies Used

- **Frontend**: React 18, TypeScript, React Hook Form, Vite
- **Backend**: Express.js, Multer, CORS
- **Testing**: Playwright
- **Validation**: Custom validators (text, number, email, JSON, file, date)

---

## 🔄 Workflow

1. ✅ **Phase 1 (CURRENT)**: Project skeleton created
   - Form renders dynamically
   - Backend validates inputs
   - Playwright is configured
   - Basic test structure exists

2. 🔜 **Phase 2 (NEXT)**: Apply "Form Oracle Heuristic Tester" prompt
   - AI analyzes form structure
   - Generates heuristic test cases
   - Implements oracle logic
   - Runs iterative testing loop

---

## 📞 Support

For issues or questions:
- Check the form schema in `/api/schema`
- Verify backend is running on port 3001
- Check browser console for frontend errors
- Review Playwright test results with `npx playwright show-report`

---

**🎯 Ready for the next step: Inject the Oracle and start heuristic testing!**
