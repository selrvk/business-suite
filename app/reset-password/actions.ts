"use server"

import { getClaims, isPlatformEmail, linkLoginIsFresh } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/**
 * Sets a new password after logging in through a reset link, and logs out
 * every other device. Only works shortly after using the link; otherwise
 * Settings → My account (which asks for the current password) is the way.
 */
export async function setNewPassword(password: string): Promise<ActionResult<{ to: string }>> {
  const claims = await getClaims()
  if (!claims) return { ok: false, error: "Your reset link has expired. Ask for a new one." }
  if (!linkLoginIsFresh(claims.linkLoginAt))
    return { ok: false, error: "This reset has timed out. Ask for a new link, or change your password in Settings." }
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }

  const supabase = await getSupabase()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    return { ok: false, error: error.code === "same_password" ? "Pick a password different from your old one." : error.message }
  }
  await supabase.auth.signOut({ scope: "others" })
  return { ok: true, data: { to: isPlatformEmail(claims.email) ? "/platform" : "/dashboard" } }
}
