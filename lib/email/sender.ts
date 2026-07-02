import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

// ─────────────────────────────────────────────────────────────────────────────
// Nodemailer Gmail SMTP (singleton)
// ─────────────────────────────────────────────────────────────────────────────

let _transport: Transporter | null = null

function getTransport(): Transporter {
  if (_transport) return _transport

  const host = process.env['SMTP_HOST'] ?? 'smtp.gmail.com'
  const port = parseInt(process.env['SMTP_PORT'] ?? '587', 10)
  const user = process.env['SMTP_USER']
  const pass = process.env['SMTP_PASS']

  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be set for email delivery')
  }

  _transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
  })

  return _transport
}

export type SendEmailParams = {
  to: string
  subject: string
  html: string
  text?: string
  replyTo?: string
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const transport = getTransport()
  const from = `"StreamLearn" <${process.env['SMTP_USER']}>`

  const info = await transport.sendMail({
    from,
    to:      params.to,
    subject: params.subject,
    html:    params.html,
    text:    params.text,
    replyTo: params.replyTo ?? from,
  })

  
}

export async function verifySMTP(): Promise<void> {
  const transport = getTransport()
  await transport.verify()
}