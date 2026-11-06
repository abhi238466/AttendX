
import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL is missing from backend/.env')
}

const certificatePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../certs/prod-ca-2021.crt'
)

const ssl = connectionString.includes('supabase')
  ? {
      ca: readFileSync(certificatePath, 'utf8'),
      rejectUnauthorized: true,
    }
  : undefined

const adapter = new PrismaPg({
  connectionString,
  ssl,
})

export const prisma = new PrismaClient({
  adapter,
})
