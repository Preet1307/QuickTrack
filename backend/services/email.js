const nodemailer = require('nodemailer');

function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Email delivery is not configured. Add SMTP settings to backend/.env.');
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendVerificationEmail({ email, name, verificationUrl }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER;
  await getTransport().sendMail({
    from,
    to: email,
    subject: 'Verify your QuickTrack email',
    text: `Hi ${name},\n\nVerify your QuickTrack account by opening this link:\n${verificationUrl}\n\nThis link expires in 24 hours.`,
    html: `<p>Hi ${name},</p><p>Verify your QuickTrack account by clicking the button below.</p><p><a href="${verificationUrl}">Verify my email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

module.exports = { sendVerificationEmail };