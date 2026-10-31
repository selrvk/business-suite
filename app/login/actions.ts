"use server"

import { updateTag } from "next/cache"
import { getClaims, getSession, isPlatformEmail } from "@/lib/auth"
import { config } from "@/lib/config"
import { dbMessage } from "@/lib/db"
import { BUSY, loginLockout, passwordSignIn, staffLoginEmail, unconfirmedMessage, WRONG_PASSWORD } from "@/lib/login"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { createBusinessFor } from "@/lib/tenancy"
import type { ActionResult } from "@/lib/types"

/**
 * The main login box takes either a real email, or a username with the
 * business's link: "username@business-link". Anything shaped like name@link.something
 * (e.g. an older "username@company.local") is tried that way too if it isn't an email login.
 */
export async function signIn(login: string, password: string): Promise<ActionResult<{ to: string }>> {
  const id = login.trim().toLowerCase()
  if (!id || !password) return { ok: false, error: "Enter your login and password." }
  if (!id.includes("@")) {
    return {
      ok: false,
      error: "Add your business's link after your username, like username@your-business, or use the staff login link your owner gave you.",
    }
  }

  const lockout = await loginLockout(id)
  if (lockout.paused) return { ok: false, error: lockout.paused }
  let busy = false

  if (id.includes(".", id.indexOf("@"))) {
    const result = await passwordSignIn(id, password)
    if (result === "ok") {
      await lockout.succeeded()
      return { ok: true, data: { to: isPlatformEmail(id) ? "/platform" : "/dashboard" } }
    }
    if (result === "unconfirmed") return { ok: false, error: await unconfirmedMessage(id) }
    busy = result === "busy"
  }

  const [username, domain] = id.split("@")
  const slug = domain.split(".")[0]
  if (!busy && username && /^[a-z0-9-]{1,60}$/.test(slug)) {
    const email = await staffLoginEmail(slug, username)
    if (email && email !== id) {
      const result = await passwordSignIn(email, password)
      if (result === "ok") {
        await lockout.succeeded()
        return { ok: true, data: { to: "/dashboard" } }
      }
      if (result === "unconfirmed") return { ok: false, error: await unconfirmedMessage(email) }
      busy = result === "busy"
    }
  }

  if (busy) return { ok: false, error: BUSY }
  return { ok: false, error: (await lockout.failed()) ?? WRONG_PASSWORD }
}

/** Logs out this browser only; other devices using the same login stay logged in. */
export async function signOut(): Promise<void> {
  await (await createSupabaseServerClient()).auth.signOut({ scope: "local" })
}

/** For a signed-in login that somehow has no business: create one and make them its owner. */
export async function finishSetup(businessName: string): Promise<ActionResult> {
  const claims = await getClaims()
  if (!claims) return { ok: false, error: "Please log in again." }
  if (await getSession()) return { ok: true, data: null } // already has a business
  if (isPlatformEmail(claims.email)) return { ok: false, error: "The platform owner's login doesn't have a business. Use Platform admin." }
  if (claims.email.endsWith(`.${config.staffEmailDomain}`))
    return { ok: false, error: "This is a staff login. Ask the business owner to add you again." }

  const name = businessName.trim()
  if (name.length < 2 || name.length > 80) return { ok: false, error: "Enter your business name." }
  try {
    await createBusinessFor(claims.userId, claims.email, name)
  } catch (e) {
    return { ok: false, error: dbMessage(e as { message: string; code?: string }) }
  }
  updateTag("tenancy")
  return { ok: true, data: null }
}
