"use server"

import { updateTag } from "next/cache"
import { after } from "next/server"
import { isPlatformEmail } from "@/lib/auth"
import { canReceiveEmail, emailEnabled } from "@/lib/email"
import { dbMessage } from "@/lib/db"
import { cleanFeatures } from "@/lib/features"
import { allowAttempt } from "@/lib/login"
import { notifyNewSignup, sendLoginLink } from "@/lib/notify"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createBusinessFor } from "@/lib/tenancy"
import type { ActionResult } from "@/lib/types"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Creates the owner's login and their business (with a free trial, set by the
 * database default). Undoes everything if a step fails.
 *
 * When email is set up, the owner confirms their address first: they get a
 * link that confirms it and logs them in (data.confirm = true). Otherwise
 * they're logged in right away.
 */
export async function signUp(input: {
  businessName: string
  email: string
  password: string
  website: string // honeypot: hidden from people, filled in by bots
  businessType: string | null
  modules: string[]
  options: string[]
}): Promise<ActionResult<{ confirm: boolean }>> {
  const name = input.businessName.trim()
  const email = input.email.trim().toLowerCase()
  if (input.website) return { ok: false, error: "Something went wrong. Please try again." }
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter your business name." }
  if (!EMAIL.test(email) || !canReceiveEmail(email)) return { ok: false, error: "Enter a valid email address." }
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  if (isPlatformEmail(email)) return { ok: false, error: "This is the platform owner's email. Log in instead." }
  const features = cleanFeatures({ businessType: input.businessType, modules: input.modules, options: input.options, customFields: [] })
  if ("error" in features) return { ok: false, error: features.error }
  if (!(await allowAttempt("signup", email, 3, 5)))
    return { ok: false, error: "Too many sign-ups from here in the last hour. Try again later." }

  const confirm = emailEnabled()
  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: !confirm })
  if (error || !data.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "")
    return { ok: false, error: taken ? "That email already has an account. Log in instead." : (error?.message ?? "Couldn't create your account.") }
  }
  const userId = data.user.id

  try {
    await createBusinessFor(userId, email, name, {
      business_type: features.business_type,
      modules: features.modules,
      options: features.options,
    })
  } catch (e) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: dbMessage(e as { message: string; code?: string }) }
  }
  updateTag("tenancy")
  after(() => notifyNewSignup(name, email))

  if (confirm) {
    if (!(await sendLoginLink(email, "confirm"))) {
      return { ok: false, error: "Your account is ready, but we couldn't email you the confirmation link. Try logging in to get a new one." }
    }
    return { ok: true, data: { confirm: true } }
  }

  const supabase = await createSupabaseServerClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: input.password })
  if (signInError) return { ok: false, error: "Your account is ready, but signing in failed. Please log in." }
  return { ok: true, data: { confirm: false } }
}
