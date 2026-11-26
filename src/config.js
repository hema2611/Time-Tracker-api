import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const need = k => {
  const v = process.env[k]
  if (!v) throw new Error(`Missing ${k} in .env (copy .env.example to .env and fill it in)`)
  return v
}

// STRICT GUARD: this project may only ever connect to this server and this database.
// Anything else in .env (a typo, a copied file, the live server) stops the app before it connects.
// Change these two lines only on purpose, when the tracker gets its own production database.
export const ALLOWED_DB = { host: '161.97.171.209', database: 'track_project' }

const dbHost = (process.env.DB_HOST || '').trim()
const dbName = (process.env.DB_NAME || '').trim()
if (dbHost !== ALLOWED_DB.host || dbName !== ALLOWED_DB.database) {
  throw new Error(`Database guard: refusing to start. Only ${ALLOWED_DB.host} / ${ALLOWED_DB.database} is allowed, but .env has "${dbHost}" / "${dbName}".`)
}

export default {
  env: process.env.NODE_ENV || 'development',
  port: +(process.env.PORT || 4000),
  db: {
    host: dbHost,
    port: +(process.env.DB_PORT || 3306),
    user: need('DB_USER'),
    password: need('DB_PASSWORD'),
    database: dbName,
  },
  jwtSecret: need('JWT_SECRET'),
  sessionHours: +(process.env.SESSION_HOURS || 12),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  attendance: {
    // Office time zone as minutes from UTC (India = 330). A "day" runs midnight to midnight in this zone.
    tzOffsetMinutes: +(process.env.TZ_OFFSET_MINUTES || 330),
    // Breaks shorter than this are counted as work (a quick lock to grab water is not a break).
    minBreakMinutes: +(process.env.MIN_BREAK_MINUTES || 2),
    // No heartbeat for this long while working = the agent was not running.
    gapMinutes: +(process.env.AGENT_GAP_MINUTES || 3),
    // Events that reach the server this much later than they happened (sent after being offline) are flagged.
    lateMinutes: +(process.env.LATE_EVENT_MINUTES || 15),
    // Unproductive sites/apps above this many minutes a day get a "Checks" flag for the manager.
    unproductiveLimitMinutes: +(process.env.UNPRODUCTIVE_LIMIT_MINUTES || 60),
  },
  ai: {
    provider: (process.env.AI_PROVIDER || '').toLowerCase(),
    geminiKey: process.env.GEMINI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL ?? 'gemini-4-hydrogen',
    dailyChatLimitPerUser: +(process.env.AI_DAILY_CHAT_LIMIT_PER_USER || 100),
    timeoutSeconds: +(process.env.AI_TIMEOUT_SECONDS || 45),
    dailyLimitPerUser: +(process.env.AI_DAILY_LIMIT_PER_USER || 20),
  },
}
