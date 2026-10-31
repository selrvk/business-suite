import "server-only"
import { BRAND_COLORS } from "./brand"
import { config } from "./config"

// ---------------------------------------------------------------------------
// Sending email through Resend (resend.com). Turned on by setting
// RESEND_API_KEY and EMAIL_FROM; without them nothing is sent and features
// that need email fall back (e.g. sign-ups don't wait for confirmation).
// ---------------------------------------------------------------------------

export function emailEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/**
 * The site's address for links in emails. It comes from settings, never from
 * the request, so nobody can make a reset link point at another site.
 */
export function siteUrl() {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "")
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL)
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return "http://localhost:3000"
}

/** Staff logins have made-up addresses (username@business.staff.local) that can't receive mail. */
export function canReceiveEmail(email: string | null | undefined): email is string {
  if (!email || !email.includes("@")) return false
  const domain = email.split("@")[1].toLowerCase()
  return domain.includes(".") && !domain.endsWith(`.${config.staffEmailDomain}`) && !domain.endsWith(".local")
}

export type Email = {
  to: string | string[]
  subject: string
  heading: string
  paragraphs: string[]
  button?: { label: string; url: string }
  footnote?: string
}

const escape = (s: string) =>
  s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

function html(email: Email) {
  const p = (text: string, style = "") =>
    `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33363d;${style}">${escape(text)}</p>`
  const button = email.button
    ? `<p style="margin:22px 0 8px"><a href="${escape(email.button.url)}" style="display:inline-block;background:${BRAND_COLORS.tile};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:10px">${escape(email.button.label)}</a></p>
       <p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#8a8d94">Or open this link: <a href="${escape(email.button.url)}" style="color:#8a8d94;word-break:break-all">${escape(email.button.url)}</a></p>`
    : ""
  return `<!doctype html>
<html><body style="margin:0;padding:24px 12px;background:${BRAND_COLORS.paper};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;border:1px solid #e6e3da">
      <tr><td style="padding:22px 28px 0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${BRAND_COLORS.ink}">${escape(config.appName)}</td></tr>
      <tr><td style="padding:14px 28px 24px">
        <h1 style="margin:0 0 16px;font-size:21px;line-height:1.3;color:${BRAND_COLORS.ink}">${escape(email.heading)}</h1>
        ${email.paragraphs.map(t => p(t)).join("\n        ")}
        ${button}
        ${email.footnote ? p(email.footnote, "font-size:13px;color:#8a8d94;margin-top:18px") : ""}
      </td></tr>
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#8a8d94">Questions? Reply to this email or write to ${escape(config.contactEmail)}.</p>
  </td></tr></table>
</body></html>`
}

function text(email: Email) {
  return [
    email.heading,
    "",
    ...email.paragraphs.flatMap(t => [t, ""]),
    ...(email.button ? [`${email.button.label}: ${email.button.url}`, ""] : []),
    ...(email.footnote ? [email.footnote, ""] : []),
    `Questions? Reply to this email or write to ${config.contactEmail}.`,
  ].join("\n")
}

/** Sends one email. Returns false (and logs why) if it couldn't be sent; never throws. */
export async function sendEmail(email: Email): Promise<boolean> {
  if (!emailEnabled()) return false
  const to = (Array.isArray(email.to) ? email.to : [email.to]).filter(canReceiveEmail)
  if (!to.length) return false
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to,
        reply_to: config.contactEmail,
        subject: email.subject,
        html: html(email),
        text: text(email),
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error(`Email "${email.subject}" not sent: ${response.status} ${await response.text()}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`Email "${email.subject}" not sent: ${e instanceof Error ? e.message : e}`)
    return false
  }
}

/** For local testing of the template. */
export const renderEmail = { html, text }
