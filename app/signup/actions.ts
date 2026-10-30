"use server"

import { updateTag } from "next/cache"
import { isPlatformEmail } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createBusinessFor } from "@/lib/tenancy"
import type { ActionResult } from "@/lib/types"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Creates the owner's login, their business (with a free trial, set by the
 * database default) and signs them in. Undoes everything if a step fails.
 */
export async function signUp(input: {
  businessName: string
  email: string
  password: string
  website: string // honeypot: hidden from people, filled in by bots
}): Promise<ActionResult> {
  const name = input.businessName.trim()
  const email = input.email.trim().toLowerCase()
  if (input.website) return { ok: false, error: "Something went wrong. Please try again." }
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter your business name." }
  if (!EMAIL.test(email)) return { ok: false, error: "Enter a valid email address." }
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  if (isPlatformEmail(email)) return { ok: false, error: "This is the platform owner's email. Log in instead." }

  const admin = createSupabaseAdminClient()
  const { data, error } = await admin.auth.admin.createUser({ email, password: input.password, email_confirm: true })
  if (error || !data.user) {
    const taken = /already|registered|exists/i.test(error?.message ?? "")
    return { ok: false, error: taken ? "That email already has an account. Log in instead." : (error?.message ?? "Couldn't create your account.") }
  }
  const userId = data.user.id

  try {
    await createBusinessFor(userId, email, name)
  } catch (e) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: dbMessage(e as { message: string; code?: string }) }
  }

  updateTag("tenancy")
  const supabase = await createSupabaseServerClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: input.password })
  if (signInError) return { ok: false, error: "Your account is ready, but signing in failed. Please log in." }
  return { ok: true, data: null }
}
