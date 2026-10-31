"use server"

import { config } from "@/lib/config"
import { canReceiveEmail, emailEnabled } from "@/lib/email"
import { allowAttempt } from "@/lib/login"
import { sendLoginLink } from "@/lib/notify"
import type { ActionResult } from "@/lib/types"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Emails a reset link if the email has a login. The answer is the same either
 * way, so this can't be used to find out who has an account.
 */
export async function requestPasswordReset(input: string): Promise<ActionResult<string>> {
  const email = input.trim().toLowerCase()
  if (!email.includes("@") || !EMAIL.test(email) || !canReceiveEmail(email)) {
    return {
      ok: false,
      error: "Staff logins don't have an email. Ask your business owner to reset your password in Settings → Logins.",
    }
  }
  if (!emailEnabled()) return { ok: false, error: `Resetting by email isn't set up yet. Write to ${config.contactEmail} for help.` }
  if (!(await allowAttempt("reset-password", email, 3, 10))) {
    return { ok: false, error: "We've already sent a few links. Check your email (and spam), or try again in an hour." }
  }
  await sendLoginLink(email, "reset")
  return { ok: true, data: `If ${email} has an account, we've sent it a link to choose a new password. It works within an hour.` }
}
