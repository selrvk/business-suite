import "server-only"
import { config } from "./config"
import { canReceiveEmail, sendEmail, siteUrl, type Email } from "./email"
import type { Digest } from "./digest"
import { formatDate, formatLongDate, formatShortDate, money, num, price, startOfDay } from "./format"
import { margin, percent } from "./reports"
import { createSupabaseAdminClient } from "./supabase/admin"

// The emails the app sends. Each one is a no-op when email isn't set up.

const link = (path: string) => `${siteUrl()}${path}`

function platformEmails() {
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim())
    .filter(Boolean)
}

/** The owners of a business who can receive email (staff logins can't). */
async function ownerEmails(businessId: string) {
  const admin = createSupabaseAdminClient()
  const { data } = await admin.from("members").select("user_id").eq("business_id", businessId).eq("role", "owner")
  const emails = await Promise.all((data ?? []).map(async m => (await admin.auth.admin.getUserById(m.user_id)).data.user?.email))
  return emails.filter(canReceiveEmail)
}

/**
 * Emails a one-time login link to an existing login: "confirm" confirms a new
 * owner's email, "reset" lets them choose a new password. The link opens a
 * page with a button (app/auth/confirm), so email apps that open links to scan
 * them can't use it up. Returns false if there's no such login or it wasn't sent.
 */
export async function sendLoginLink(email: string, purpose: "confirm" | "reset") {
  if (!canReceiveEmail(email)) return false
  const { data, error } = await createSupabaseAdminClient().auth.admin.generateLink({
    type: purpose === "reset" ? "recovery" : "magiclink",
    email,
  })
  if (error || !data.properties?.hashed_token) return false
  const url = new URL("/auth/confirm", siteUrl())
  url.searchParams.set("token_hash", data.properties.hashed_token)
  url.searchParams.set("type", data.properties.verification_type)

  return purpose === "reset"
    ? sendEmail({
        to: email,
        subject: `Reset your ${config.appName} password`,
        heading: "Reset your password",
        paragraphs: ["Someone, hopefully you, asked to reset the password for this email. Click the button to choose a new one."],
        button: { label: "Choose a new password", url: url.toString() },
        footnote: "The link works once, within an hour. If you didn't ask for this, ignore this email; your password stays the same.",
      })
    : sendEmail({
        to: email,
        subject: `Confirm your email for ${config.appName}`,
        heading: "Confirm your email",
        paragraphs: [
          `Click the button to confirm this is your email and open your ${config.appName}.`,
          `Your ${config.trialDays}-day free trial has started. No payment needed until it ends.`,
        ],
        button: { label: "Confirm my email", url: url.toString() },
        footnote: "The link works once, within an hour. If you didn't sign up, ignore this email.",
      })
}

/** To you: a business signed up. */
export async function notifyNewSignup(businessName: string, email: string) {
  await sendEmail({
    to: platformEmails(),
    subject: `New sign-up: ${businessName}`,
    heading: "A new business signed up",
    paragraphs: [`${businessName} (${email}) just started a ${config.trialDays}-day free trial.`],
    button: { label: "Open platform admin", url: link("/platform") },
  })
}

/** To you: a business reported a payment to check. */
export async function notifyPaymentReport(p: { businessName: string; amount: number; period: "month" | "year"; reference: string; note: string | null }) {
  await sendEmail({
    to: platformEmails(),
    subject: `Payment to check: ${p.businessName}, ${money(p.amount)}`,
    heading: "A payment to check",
    paragraphs: [
      `${p.businessName} says they paid ${money(p.amount)} for a ${p.period}.`,
      `Reference number: ${p.reference}`,
      ...(p.note ? [`Their note: ${p.note}`] : []),
    ],
    button: { label: "Review it", url: link("/platform") },
    footnote: "Only approve it after you find this reference number in your GCash or bank app.",
  })
}

/** To the business's owners: you approved or rejected their payment. */
export async function notifyPaymentReviewed(
  businessId: string,
  p: { approved: boolean; amount: number; reference: string; paidUntil?: string },
) {
  const to = await ownerEmails(businessId)
  await sendEmail(
    p.approved
      ? {
          to,
          subject: "Payment received, thank you",
          heading: "Your payment is confirmed",
          paragraphs: [
            `We received your payment of ${money(p.amount)} (reference ${p.reference}).`,
            ...(p.paidUntil ? [`Your ${config.appName} is paid until ${formatDate(p.paidUntil)}.`] : []),
          ],
          button: { label: `Open ${config.appName}`, url: link("/dashboard") },
        }
      : {
          to,
          subject: "We couldn't confirm your payment",
          heading: "We couldn't confirm your payment",
          paragraphs: [
            `We couldn't find a payment with reference number ${p.reference}.`,
            "Check the number and send it again from Billing, or reply to this email and we'll sort it out.",
          ],
          button: { label: "Go to Billing", url: link("/billing") },
        },
  )
}

/** To the business's owners: their trial or paid time ends in 3 days, or ended today. */
export async function sendAccessReminder(
  business: { id: string; name: string },
  p: { kind: "ends-soon" | "ended"; onTrial: boolean; endsAt: Date },
) {
  const to = await ownerEmails(business.id)
  if (!to.length) return false
  const what = p.onTrial ? "free trial" : "subscription"
  const pay = `To keep going, pay ${price(config.price.monthly)} for a month by GCash or bank transfer, then send the reference number from Billing.`
  return sendEmail(
    p.kind === "ends-soon"
      ? {
          to,
          subject: `Your ${what} ends in 3 days`,
          heading: `Your ${what} ends in 3 days`,
          paragraphs: [`The ${what} for ${business.name} ends on ${formatDate(p.endsAt)}.`, pay, "Everything you've added stays as it is."],
          button: { label: "Go to Billing", url: link("/billing") },
        }
      : {
          to,
          subject: `Your ${what} has ended`,
          heading: `Your ${what} has ended`,
          paragraphs: [
            `The ${what} for ${business.name} ended today.`,
            `Your products, sales and records are safe. ${pay}`,
          ],
          button: { label: "Go to Billing", url: link("/billing") },
        },
  )
}

export type DaySummary = {
  sales: number
  gross: number
  discounts: number
  senior_pwd: number
  vat_exempt: number
  net: number
  credit_given: number
  by_method: Record<string, number>
  collected: Record<string, number>
  cash_in: number
  voids: number
  voided_total: number
  items_sold: number
  top_items: { name: string; quantity: number; amount: number }[]
}

/** To the business's owners: someone closed the day. */
export async function notifyDayClosed(
  business: { id: string; name: string },
  p: { day: string; by: string; summary: DaySummary; expected: number; counted: number; difference: number },
) {
  const to = await ownerEmails(business.id)
  if (!to.length) return
  const s = p.summary
  const methods = Object.entries(s.by_method ?? {}).map(([m, v]) => `${m} ${money(v)}`).join(", ")
  const collected = Object.entries(s.collected ?? {}).map(([m, v]) => `${m} ${money(v)}`).join(", ")
  const drawer =
    p.difference === 0 ? "The cash drawer matched exactly." : `The cash drawer was ${p.difference > 0 ? "over" : "short"} by ${money(Math.abs(p.difference))}.`
  await sendEmail({
    to,
    subject: `${business.name}: ${formatDate(p.day)} closed, ${money(s.net)} in sales`,
    heading: `${formatDate(p.day)} is closed`,
    paragraphs: [
      `${p.by} closed the day. ${s.sales} sale${s.sales === 1 ? "" : "s"} for ${money(s.net)}${s.discounts > 0 ? ` after ${money(s.discounts)} in discounts` : ""}.`,
      ...(methods ? [`Paid by: ${methods}.`] : []),
      ...(s.credit_given > 0 ? [`On credit: ${money(s.credit_given)}.`] : []),
      ...(collected ? [`Collected from customers who owed: ${collected}.`] : []),
      ...(s.voids > 0 ? [`Voided: ${s.voids} sale${s.voids === 1 ? "" : "s"} (${money(s.voided_total)}).`] : []),
      `Expected cash: ${money(p.expected)}. Counted: ${money(p.counted)}. ${drawer}`,
    ],
    button: { label: "See the details", url: link(`/sales/close?day=${p.day}`) },
  })
}

/** To the business's owners: the daily or weekly summary (see lib/digest.ts). */
export async function sendDigest(business: { id: string; name: string }, d: Digest) {
  const to = await ownerEmails(business.id)
  if (!to.length) return false
  return sendEmail({ to, ...digestEmail(business.name, d) })
}

/** The summary email's content. */
export function digestEmail(businessName: string, d: Digest): Omit<Email, "to"> {
  const business = { name: businessName }
  const weekly = d.kind === "weekly"
  const when = weekly
    ? `${formatShortDate(startOfDay(d.from))} – ${formatShortDate(startOfDay(d.to))}`
    : formatLongDate(startOfDay(d.from))
  const r = d.report
  const plural = (n: number, word: string, many = `${word}s`) => `${num(n)} ${n === 1 ? word : many}`

  const paragraphs: string[] = []
  if (r) {
    if (r.sales) {
      const change =
        d.previousRevenue && d.previousRevenue > 0
          ? Math.round(((r.revenue - d.previousRevenue) / d.previousRevenue) * 100)
          : null
      const compared =
        change == null ? "" : change === 0 ? `, the same as the ${weekly ? "week" : "day"} before` : `, ${Math.abs(change)}% ${change > 0 ? "more" : "less"} than the ${weekly ? "week" : "day"} before`
      paragraphs.push(`${plural(r.sales, "sale")} for ${money(r.revenue)}${compared}. Profit: ${money(r.revenue - r.cost)} (${percent(margin(r.revenue, r.cost))} margin).`)
    } else {
      paragraphs.push(`No sales were recorded ${weekly ? "last week" : "yesterday"}.`)
    }
  }

  const sales: [string, string][] = []
  if (r?.sales) {
    sales.push(["Sales", money(r.revenue)], ["Cost of the goods", money(r.cost)], ["Profit", money(r.revenue - r.cost)])
    if (r.discounts > 0) sales.push(["Discounts given", money(r.discounts)])
  }
  if (d.voids.count) sales.push(["Voided sales", `${num(d.voids.count)} (${money(d.voids.total)})`])
  if (d.drawer) {
    const diff = d.drawer.difference
    sales.push([
      `Cash drawer, ${plural(d.drawer.days, "day")} closed`,
      Math.abs(diff) < 0.005 ? "Matched" : `${diff > 0 ? "Over" : "Short"} by ${money(Math.abs(diff))}`,
    ])
  }

  const best: [string, string][] = (r?.by_product ?? [])
    .slice(0, 5)
    .map(p => [p.name, `${num(p.quantity)} sold · ${money(p.profit)} profit`])

  const attention: [string, string][] = []
  if (d.lowStock?.count) attention.push(["Low on stock", `${plural(d.lowStock.count, "product")}${d.lowStock.out ? `, ${num(d.lowStock.out)} out` : ""}`])
  if (d.expiry?.expired) attention.push(["Expired, still in stock", plural(d.expiry.expired, "batch", "batches")])
  if (d.expiry?.soon) attention.push(["Expiring within 30 days", plural(d.expiry.soon, "batch", "batches")])
  if (d.owed) attention.push(["Customers owe you", `${money(d.owed.total)} (${plural(d.owed.customers, "customer")})`])
  if (weekly && r?.slow_movers.length) {
    const value = r.slow_movers.reduce((s, x) => s + x.value, 0)
    attention.push(["Not sold in 60 days", `${plural(r.slow_movers.length, "product")}, ${money(value)} at cost`])
  }

  const subject = r?.sales
    ? `${business.name}: ${money(r.revenue)} in sales ${weekly ? "last week" : "yesterday"}`
    : `${business.name}: your ${weekly ? "weekly" : "daily"} summary`

  return {
    subject,
    heading: weekly ? `Your week, ${when}` : `Yesterday, ${when}`,
    paragraphs,
    sections: [
      { title: weekly ? "Last week" : "Yesterday", rows: sales },
      { title: "Best sellers", rows: best },
      { title: "Needs attention", rows: attention },
    ],
    button: r ? { label: "Open the profit report", url: link(`/reports?from=${d.from}&to=${d.to}`) } : { label: `Open ${config.appName}`, url: link("/dashboard") },
    footnote: `You get this ${weekly ? "every Monday" : "every morning"} as an owner of ${business.name}. To change or stop it, go to Settings, then Business.`,
  }
}
