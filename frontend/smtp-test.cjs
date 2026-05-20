// Simple SMTP test using nodemailer (CommonJS / .cjs to avoid ESM 'require' issues)
const nodemailer = require('nodemailer')

const {
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '587',
  SMTP_USER,
  SMTP_PASS,
  SMTP_FROM = SMTP_USER,
  SMTP_TO = SMTP_USER,
} = process.env

if (!SMTP_USER || !SMTP_PASS) {
  console.error('Missing SMTP_USER or SMTP_PASS environment variables. Aborting.')
  process.exit(1)
}

async function main() {
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  })

  try {
    console.log('Verifying SMTP connection...')
    await transporter.verify()
    console.log('SMTP connection verified.')

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: SMTP_TO,
      subject: 'Supabase SMTP test from WashLink',
      text: 'This is a test message sent from smtp-test.cjs to verify SMTP settings.',
    })

    console.log('Message sent. MessageId:', info.messageId)
    process.exit(0)
  } catch (err) {
    console.error('SMTP test failed:')
    console.error(err && err.message ? err.message : err)
    process.exit(2)
  }
}

main()
