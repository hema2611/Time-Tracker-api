// LOCAL TESTING ONLY: gives every active or invited user the same test password, so testers can sign in as any role.
// Run from the project folder:  node scripts/set-test-passwords.js
// The password comes from TEST_PASSWORD in .env. Uses the database guard in src/config.js (dev server only).
import bcrypt from 'bcryptjs'
import config from '../src/config.js'
import { pool, query } from '../src/db.js'

const pw = process.env.TEST_PASSWORD
if (config.env === 'production') { console.log('Refusing: this is for local testing only.'); process.exit(1) }
if (!pw) { console.log('Set TEST_PASSWORD in .env first.'); process.exit(1) }

const hash = await bcrypt.hash(pw, 12)
const out = await query("UPDATE users SET password_hash = ?, must_change_password = 0, status = 'active' WHERE status <> 'deactivated'", [hash])
const users = await query("SELECT email, role FROM users WHERE status = 'active' ORDER BY id")
console.log(`updated ${out.affectedRows} users:`)
users.forEach(u => console.log(`  ${u.email} (${u.role})`))
await pool.end()
