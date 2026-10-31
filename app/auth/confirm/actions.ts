"use server"

import type { EmailOtpType } from "@supabase/supabase-js"
import { updateTag } from "next/cache"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

const TYPES: EmailOtpType[] = ["magiclink", "recovery", "signup", "invite", "email"]

/**
 * Uses a one-time link from an email: confirms the email if needed and logs
 * this browser in. Reset links go on to choosing a new password.
 */
export async function openEmailLink(tokenHash: string, type: string): Promise<ActionResult<{ to: string }>> {
  if (!tokenHash || !TYPES.includes(type as EmailOtpType)) return { ok: false, error: "This link isn't complete. Copy the whole link from the email." }
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as EmailOtpType })
  if (error) return { ok: false, error: "This link has expired or was already used. Ask for a new one below." }
  updateTag("tenancy")
  return { ok: true, data: { to: type === "recovery" ? "/reset-password" : "/dashboard" } }
}
