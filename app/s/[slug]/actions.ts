"use server"

import { BUSY, loginLockout, passwordSignIn, staffLoginEmail } from "@/lib/login"
import type { ActionResult } from "@/lib/types"

const WRONG = "Wrong username or password."

/**
 * Staff log in with the username their owner gave them. The login's email is
 * looked up on the server (it never reaches the browser), so it works for any
 * login, including ones carried over from older versions.
 */
export async function staffSignIn(slug: string, login: string, password: string): Promise<ActionResult> {
  const id = login.trim().toLowerCase()
  if (!id || !password) return { ok: false, error: WRONG }

  const lockout = await loginLockout(id, slug)
  if (lockout.paused) return { ok: false, error: lockout.paused }

  const email = id.includes("@") ? id : await staffLoginEmail(slug, id)
  const result = email ? await passwordSignIn(email, password) : "wrong"
  if (result === "ok") {
    await lockout.succeeded()
    return { ok: true, data: null }
  }
  if (result === "busy") return { ok: false, error: BUSY }
  return { ok: false, error: (await lockout.failed()) ?? WRONG }
}
