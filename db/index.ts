import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

// ─── Validation ───────────────────────────────────────────────────────────────
const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set.\n' +
      'Set it to the Supabase transaction pooler URL (port 6543).\n' +
      'Example: postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true',
  )
}

// ─── Connection Pool ──────────────────────────────────────────────────────────
//
// Using the Supabase PgBouncer transaction pooler (port 6543).
//
// Critical settings for PgBouncer transaction mode:
//   • prepare: false  — PgBouncer does not support server-side prepared statements
//   • max: 10         — conservative; Supabase free tier allows ~60 simultaneous
//   • idle_timeout    — release idle connections quickly (important for serverless)
//   • connect_timeout — fail fast rather than hang on unreachable DB
//
const poolClient = postgres(databaseUrl, {
  prepare: false,
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: process.env['NODE_ENV'] === 'production' ? 'require' : false,
  // Prevent the pool from holding open the Node.js process in the worker
  onnotice: () => {
    // suppress NOTICE messages
  },
})

// ─── Drizzle ORM Instance ─────────────────────────────────────────────────────
//
// Single shared instance — imported by all route handlers and the worker.
// Query logging enabled in development only.
//
export const db = drizzle(poolClient, {
  schema,
  logger: process.env['NODE_ENV'] === 'development',
})

// Re-export schema types for use throughout the codebase
export * from './schema'

export type Db = typeof db