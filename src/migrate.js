// Applies migrations/*.sql in name order, once each.  Run: npm run migrate
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'
import config from './config.js'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
const conn = await mysql.createConnection({ ...config.db, multipleStatements: true })

await conn.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)')
const [done] = await conn.query('SELECT name FROM schema_migrations')
const applied = new Set(done.map(r => r.name))

for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue
  await conn.query(fs.readFileSync(path.join(dir, file), 'utf8'))
  await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
  console.log('applied', file)
}
console.log('database is up to date')
await conn.end()
