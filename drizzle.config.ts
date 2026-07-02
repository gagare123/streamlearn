import { defineConfig } from 'drizzle-kit'

// drizzle-kit must use the DIRECT connection (port 5432).
// PgBouncer transaction mode (port 6543) does not support the session-level
// commands drizzle-kit issues during migration.
const directUrl = process.env['DATABASE_DIRECT_URL']
if (!directUrl) {
  throw new Error(
    'DATABASE_DIRECT_URL is required for drizzle-kit. ' +
      'Set it to the Supabase direct connection URL (port 5432).',
  )
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './db/migrations',
  dbCredentials: {
    url: directUrl,
  },
  verbose: true,
  strict: true,
})