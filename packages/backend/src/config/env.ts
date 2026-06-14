import dotenv from 'dotenv';
import { z } from 'zod';
import path from 'path';

// .env aus dem Projekt-Root laden
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const envSchema = z.object({
  DATABASE_URL:   z.string().min(1, 'DATABASE_URL ist erforderlich'),
  JWT_SECRET:     z.string().min(32, 'JWT_SECRET muss mindestens 32 Zeichen lang sein'),
  JWT_EXPIRES_IN: z.string().default('8h'),
  PORT:           z.coerce.number().default(3000),
  NODE_ENV:       z.enum(['development', 'production', 'test']).default('development'),
  RESEND_API_KEY: z.string().optional(),
  MAIL_FROM:      z.string().default('noreply@bonustrack.app'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Ungültige Umgebungsvariablen:');
  parsed.error.errors.forEach((err) => {
    console.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;
