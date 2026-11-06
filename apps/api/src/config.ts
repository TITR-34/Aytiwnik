import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Local dev: .env at the repo root. On Render the vars are set in the dashboard.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

export const config = z
  .object({
    PORT: z.coerce.number().default(8080),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
    GEMINI_API_KEY: z.string().min(10),
    GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
    GEMINI_FALLBACK_MODEL: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    GROQ_MODEL: z.string().optional(),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    AI_GRADING_LIMIT_PER_EXAM: z.coerce.number().default(5),
    AI_EXTRACTION_LIMIT_PER_DAY: z.coerce.number().default(10),
  })
  .parse(process.env);
