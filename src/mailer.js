// Sends email (password reset for now). Configure SMTP in .env:
//   SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASSWORD, SMTP_SECURE (true for port 465),
//   MAIL_FROM  e.g. "ImagiNET Tracker <no-reply@imaginetventures.com>"
// Without SMTP_HOST (local testing only) the message is printed to the API console instead of sent.
// In production a missing SMTP_HOST is an error: a reset link must never end up in a log.
import nodemailer from 'nodemailer'
import config from './config.js'

const smtp = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: +(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    })
  : null

export const mailReady = () => !!smtp

export async function sendMail({ to, subject, text, html }) {
  if (smtp) return smtp.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, to, subject, text, html })
  if (config.env === 'production') throw new Error('Email is not set up (SMTP_HOST missing).')
  console.log(`\n[mail — not sent, SMTP not set up] To: ${to}\nSubject: ${subject}\n${text}\n`)
}
