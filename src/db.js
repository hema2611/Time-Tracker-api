import mysql from 'mysql2/promise'
import config, { ALLOWED_DB } from './config.js'

export const pool = mysql.createPool({ ...config.db, connectionLimit: 10, dateStrings: true, timezone: 'Z' })

// Second half of the guard: every new connection must really be inside the allowed database,
// and the code never switches database (no USE, no other-database names in queries).
pool.on('connection', conn => {
  conn.query('SELECT DATABASE() AS db', (err, rows) => {
    if (err || rows?.[0]?.db !== ALLOWED_DB.database) {
      console.error(`Database guard: connected to "${rows?.[0]?.db}" instead of "${ALLOWED_DB.database}". Stopping.`)
      process.exit(1)
    }
  })
})

export const query = async (sql, params = []) => (await pool.execute(sql, params))[0]

// Runs fn inside a transaction; rolls back if it throws.
export async function transaction(fn) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const out = await fn({ query: async (sql, params = []) => (await conn.execute(sql, params))[0] })
    await conn.commit()
    return out
  } catch (e) {
    await conn.rollback()
    throw e
  } finally {
    conn.release()
  }
}

export const audit = (db, req, action, entity, entityId, detail) =>
  db.query('INSERT INTO audit_log (user_id, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user?.id ?? null, action, entity, entityId ?? null, detail ? JSON.stringify(detail) : null, req.ip ?? null])
