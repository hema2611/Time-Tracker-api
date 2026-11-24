// Creates the first Admin/HR user from .env, only if no admin exists yet.  Run: npm run seed
import bcrypt from 'bcryptjs'
import { pool, query } from './db.js'

const { ADMIN_NAME = 'Admin', ADMIN_EMAIL, ADMIN_PASSWORD } = process.env
const [{ n }] = await query("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")

if (n > 0) console.log('an admin already exists, nothing to do')
else if (!ADMIN_EMAIL || !ADMIN_PASSWORD) console.log('set ADMIN_EMAIL and ADMIN_PASSWORD in .env first')
else {
  await query("INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'active')",
    [ADMIN_NAME, ADMIN_EMAIL.toLowerCase(), await bcrypt.hash(ADMIN_PASSWORD, 12)])
  console.log('admin created:', ADMIN_EMAIL)
}
await pool.end()
