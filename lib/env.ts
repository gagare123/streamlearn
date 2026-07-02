import { z } from 'zod'

// ─────────────────────────────────────────────────────────────────────────────
// Environment Variables — Zod validated at startup
//
// The app will throw a clear error on startup if any required variable is
// missing, rather than failing silently at runtime.
//
// Run: pnpm build  →  any missing var is caught before deployment.
// ─────────────────────────────────────────────────────────────────────────────

const envSchema = z.object({
  // ── Node ────────────────────────────────────────────────────────────────
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // ── App ─────────────────────────────────────────────────────────────────
  NEXT_PUBLIC_APP_URL: z
    .string()
    .url('NEXT_PUBLIC_APP_URL must be a valid URL')
    .default('http://localhost:3000'),

  // ── Database ─────────────────────────────────────────────────────────────
  // DATABASE_URL        → PgBouncer pooler :6543  (app queries)
  // DATABASE_DIRECT_URL → Direct :5432            (drizzle-kit migrations only)
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DATABASE_DIRECT_URL: z.string().optional(),

  // ── Redis (Upstash REST) ──────────────────────────────────────────────────
  UPSTASH_REDIS_REST_URL:   z.string().url('UPSTASH_REDIS_REST_URL must be a URL'),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1, 'UPSTASH_REDIS_REST_TOKEN is required'),

  // ── JWT ──────────────────────────────────────────────────────────────────
  JWT_ACCESS_SECRET:  z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // ── Cookie domain ────────────────────────────────────────────────────────
  COOKIE_DOMAIN: z.string().optional(),

  // ── Mux Video ────────────────────────────────────────────────────────────
  // 3G context: Mux handles adaptive bitrate streaming (HLS) and
  // MP4 fallback automatically. No additional config needed.
  MUX_TOKEN_ID:       z.string().min(1, 'MUX_TOKEN_ID is required'),
  MUX_TOKEN_SECRET:   z.string().min(1, 'MUX_TOKEN_SECRET is required'),
  MUX_WEBHOOK_SECRET: z.string().min(1, 'MUX_WEBHOOK_SECRET is required'),

  // ── Cloudflare R2 ────────────────────────────────────────────────────────
  R2_ACCOUNT_ID:       z.string().min(1, 'R2_ACCOUNT_ID is required'),
  R2_ACCESS_KEY_ID:    z.string().min(1, 'R2_ACCESS_KEY_ID is required'),
  R2_SECRET_ACCESS_KEY:z.string().min(1, 'R2_SECRET_ACCESS_KEY is required'),
  R2_BUCKET_NAME:      z.string().min(1, 'R2_BUCKET_NAME is required'),
  R2_PUBLIC_BASE_URL:  z.string().url('R2_PUBLIC_BASE_URL must be a URL').optional(),

  // ── Paystack ─────────────────────────────────────────────────────────────
  PAYSTACK_SECRET_KEY:      z.string().min(1, 'PAYSTACK_SECRET_KEY is required'),
  PAYSTACK_WEBHOOK_SECRET:  z.string().min(1, 'PAYSTACK_WEBHOOK_SECRET is required'),

  // ── Email (Gmail SMTP) ───────────────────────────────────────────────────
  // Worker only — Route Handlers never call SMTP directly.
  SMTP_HOST: z.string().default('smtp.gmail.com'),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),
})

// Parse and validate — throws on first missing/invalid variable
function parseEnv() {
  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n')

    throw new Error(
      `\n\n❌ Environment variable validation failed:\n${issues}\n\n` +
      `Check your .env.local file and ensure all required variables are set.\n`,
    )
  }

  return result.data
}

export const env = parseEnv()

// Re-export type for use in other modules
export type Env = z.infer<typeof envSchema>