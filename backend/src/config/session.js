
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const { Pool } = pg
const PgSession = connectPgSimple(session)

const sessionSecret = process.env.SESSION_SECRET

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error('SESSION_SECRET must be configured with a strong random value.')
}

const isProduction = process.env.NODE_ENV === 'production'

const certificatePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../certs/prod-ca-2021.crt'
)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? {
        ca: readFileSync(certificatePath, 'utf8'),
        rejectUnauthorized: true,
      }
    : undefined,
})

export const sessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  name: 'attendx.sid',
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 8,
  },
})
