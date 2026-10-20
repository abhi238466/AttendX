
import 'dotenv/config'
import { createHmac } from 'node:crypto'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import pg from 'pg'

const { Pool } = pg
const PgSession = connectPgSimple(session)

const sessionSecret = process.env.SESSION_SECRET

if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error(
    'SESSION_SECRET must be configured with a strong random value.'
  )
}

const teacherSessionSecret = createHmac('sha256', sessionSecret)
  .update('attendx-teacher-session')
  .digest('hex')

const isProduction = process.env.NODE_ENV === 'production'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase')
    ? { rejectUnauthorized: false }
    : undefined,
})

export const teacherSessionMiddleware = session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true,
  }),
  name: 'attendx.teacher.sid',
  secret: teacherSessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 1000 * 60 * 60 * 8,
  },
})
