import "server-only"
import { config } from "./config"
import { canReceiveEmail, sendEmail, siteUrl } from "./email"
import { formatDate, money, price } from "./format"
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
