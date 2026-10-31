"use server"

import { getClaims, isPlatformEmail } from "@/lib/auth"
import { config } from "@/lib/config"
import { BUSY, loginLockout } from "@/lib/login"
import { getSupabase } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

const NOT_ALLOWED = { ok: false as const, error: "Only the platform owner can do that." }

async function platformClaims() {
  const claims = await getClaims()
  return claims && isPlatformEmail(claims.email) ? claims : null
}

/** Starts adding an authenticator app: a QR code to scan, and the same key to type in by hand. */
export async function startTwoStepSetup(): Promise<ActionResult<{ factorId: string; qr: string; secret: string }>> {
  if (!(await platformClaims())) return NOT_ALLOWED
  const supabase = await getSupabase()
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) return { ok: false, error: listError.message }
  if (factors.totp.length > 0) return { ok: false, error: "Two-step login is already set up. Reload and enter a code from your app." }

  // Clear out earlier setups that were started but never confirmed.
  for (const factor of factors.all.filter(f => f.status === "unverified")) {
    await supabase.auth.mfa.unenroll({ factorId: factor.id })
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: config.appName,
    friendlyName: `Authenticator app (${new Date().toISOString().slice(0, 10)})`,
  })
  if (error) {
    return {
      ok: false,
      error: /disabled/i.test(error.message)
        ? "Authenticator apps are turned off in Supabase (Authentication → Multi-Factor). Turn TOTP on and try again."
        : error.message,
    }
  }
  return { ok: true, data: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret } }
}

/**
 * Checks a 6-digit code and, if right, finishes the login's second step.
 * During setup the new app's factorId is passed; afterwards the saved app is used.
 * Wrong codes count toward the same lockout as wrong passwords.
 */
export async function verifyTwoStepCode(code: string, factorId?: string): Promise<ActionResult> {
  const claims = await platformClaims()
  if (!claims) return NOT_ALLOWED
  const digits = code.replace(/\s/g, "")
  if (!/^\d{6}$/.test(digits)) return { ok: false, error: "Enter the 6-digit code from your authenticator app." }

  const lockout = await loginLockout(claims.email)
  if (lockout.paused) return { ok: false, error: lockout.paused }

  const supabase = await getSupabase()
  let id = factorId
  if (!id) {
    const { data } = await supabase.auth.mfa.listFactors()
    id = data?.totp[0]?.id
    if (!id) return { ok: false, error: "Two-step login isn't set up yet. Reload this page to set it up." }
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: digits })
  if (error) {
    if (error.status === 429) return { ok: false, error: BUSY }
    return {
      ok: false,
      error: (await lockout.failed()) ?? "That code didn't work. Use the newest code, and check your phone's clock is set automatically.",
    }
  }
  await lockout.succeeded()
  return { ok: true, data: null }
}
