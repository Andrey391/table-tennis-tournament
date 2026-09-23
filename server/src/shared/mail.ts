import nodemailer, { Transporter } from "nodemailer";

// Outgoing mail over plain SMTP, so any mailbox works (Yandex, Mail.ru, Gmail
// with an app password). Configured by SMTP_HOST / SMTP_PORT / SMTP_USER /
// SMTP_PASS / MAIL_FROM, read on first use rather than at import — both hosts
// load this module, and one without mail configured must still boot.
let transport: Transporter | null = null;

function getTransport(): Transporter | null {
  if (transport) return transport;
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT || 465);
  transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

export interface Mail { to: string; subject: string; text: string; html?: string }

// Without SMTP_HOST a development server prints the letter instead, so the reset
// flow can be tried locally; in production that is a configuration error.
export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransport();
  if (!t) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured");
    console.log(`[mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  await t.sendMail({ from: process.env.MAIL_FROM || process.env.SMTP_USER, ...mail });
}
