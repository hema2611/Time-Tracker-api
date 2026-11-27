// "Today" in the office time zone (India by default), whatever zone the server or database runs in.
import config from './config.js'

export const officeToday = () => new Date(Date.now() + config.attendance.tzOffsetMinutes * 60000).toISOString().slice(0, 10)

// Past days can be viewed but not added to or changed.
export function assertNotPast(date, what) {
  if (String(date).slice(0, 10) < officeToday()) {
    throw Object.assign(new Error(`${what} in the past cannot be added or changed. Pick today or a later date.`), { status: 400 })
  }
}
