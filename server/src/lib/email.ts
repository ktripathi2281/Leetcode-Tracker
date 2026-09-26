import { env } from '../config/env.js';

// Sends email through Resend's HTTP API. Without RESEND_API_KEY (e.g. locally), the email
// is printed to the server log instead, so flows like password reset still work in dev.

export interface Email {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const RESEND_URL = 'https://api.resend.com/emails';

async function send(email: Email): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    if (env.NODE_ENV === 'production') {
      console.warn(`Email not sent (RESEND_API_KEY is not set): "${email.subject}"`);
      return false;
    }
    console.info(`\n--- Email (not sent: no RESEND_API_KEY) ---\nTo: ${email.to}\nSubject: ${email.subject}\n\n${email.text}\n---\n`);
    return true;
  }

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Resend explains the problem (e.g. an unverified sending domain) in the body.
      console.warn(`Email failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('Email failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/** Replaceable in tests: vi.spyOn(mailer, 'send'). */
export const mailer = { send };

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function passwordResetEmail(to: string, username: string, link: string, minutes: number): Email {
  return {
    to,
    subject: 'Reset your LeetCode Tracker password',
    text: [
      `Hi ${username},`,
      '',
      'Someone (hopefully you) asked to reset your LeetCode Tracker password. Open this link to choose a new one:',
      link,
      '',
      `The link works for ${minutes} minutes and only once. If you didn't ask for this, ignore this email: your password stays the same.`,
    ].join('\n'),
    html: `<p>Hi ${escapeHtml(username)},</p>
<p>Someone (hopefully you) asked to reset your LeetCode Tracker password.</p>
<p><a href="${escapeHtml(link)}">Choose a new password</a></p>
<p>The link works for ${minutes} minutes and only once. If you didn't ask for this, ignore this email: your password stays the same.</p>`,
  };
}
