import "server-only"
import { createHmac } from "node:crypto"
import { headers } from "next/headers"
import { createClient } from "@supabase/supabase-js"
import { USERNAME_PATTERN, config } from "./config"
import { emailEnabled } from "./email"
import { sendLoginLink } from "./notify"
import { createSupabaseAdminClient } from "./supabase/admin"
import { createSupabaseServerClient } from "./supabase/server"

// ---------------------------------------------------------------------------
// Login lockout. Wrong passwords are counted three ways, each per 15 minutes:
//   - one login from one place (IP address): 5, the limit people actually meet
//   - one login from anywhere: 20, for guessing spread over many places
//   - one place across all logins: 50, for trying many logins
// Reaching a limit pauses it for 15 minutes. The counts live in the database
// (login_failures, see supabase/schema.sql) as hashes. If that table is
// missing (schema not updated yet), logins still work, just without the limit.
// ---------------------------------------------------------------------------

const WINDOW_MINUTES = 15
const LIMITS = [5, 20, 50]

export const WRONG_PASSWORD = "Wrong login or password."
export const BUSY = "Too many people are logging in right now. Try again in a minute."

/**
 * One name per login, however it was typed: "felix" on the fnv staff page,
 * "felix@fnv" and "felix@fnv.staff.local" are all "felix@fnv". Emails become
 * "name@domain" without the ending, which is close enough for counting.
 */
function accountKey(login: string, slug = "") {
  const id = login.trim().toLowerCase()
  if (!id.includes("@")) return `${id}@${slug}`
  const [user, domain = ""] = id.split("@")
  return `${user}@${domain.split(".")[0]}`
}

/** The visitor's IP address. Vercel sets these headers itself, so they can't be faked. */
async function clientPlace() {
  const h = await headers()
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

function hash(value: string) {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").update(value).digest("hex").slice(0, 40)
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await createSupabaseAdminClient().rpc(fn, args)
  if (error) {
    console.error(`Login lockout skipped (${fn}): ${error.message}`)
    return null
  }
  return data as T
}

function pausedMessage(until: string) {
  const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000))
  return `Too many wrong passwords. For safety, this login is paused for ${minutes} minute${minutes === 1 ? "" : "s"}.`
}

/**
 * Check this before trying a password, then report the outcome:
 *   const lockout = await loginLockout(login)
 *   if (lockout.paused) return { ok: false, error: lockout.paused }
 *   ...right password  → await lockout.succeeded()
 *   ...wrong password  → error: (await lockout.failed()) ?? WRONG_PASSWORD
 */
export async function loginLockout(login: string, slug?: string) {
  const account = accountKey(login, slug)
  const place = await clientPlace()
  const keys = [hash(`login+place:${account}|${place}`), hash(`login:${account}`), hash(`place:${place}`)]
  const lockedUntil = await call<string | null>("login_locked", { p_keys: keys })

  return {
    /** A message to show if this login is paused, otherwise null. */
    paused: lockedUntil ? pausedMessage(lockedUntil) : null,
    /** Counts a wrong password. Returns the paused message if this one reached a limit. */
    async failed() {
      const until = await call<string | null>("login_failed", { p_keys: keys, p_limits: LIMITS, p_window_minutes: WINDOW_MINUTES })
      return until ? pausedMessage(until) : null
    },
    /** Clears this login's count from this place. */
    async succeeded() {
      await call("login_succeeded", { p_key: keys[0] })
    },
  }
}

/**
 * Allows something, like sending an email, a limited number of times per
 * window: `perTarget` times for one target (e.g. one email address) and
 * `perPlace` times from one IP address. Counts this try. Shares the lockout's
 * table; if that's missing, everything is allowed.
 */
export async function allowAttempt(name: string, target: string, perTarget: number, perPlace: number, minutes = 60) {
  const place = await clientPlace()
  const keys = [hash(`${name}|${target.trim().toLowerCase()}`), hash(`${name}|place|${place}`)]
  if (await call<string | null>("login_locked", { p_keys: keys })) return false
  await call("login_failed", { p_keys: keys, p_limits: [perTarget, perPlace], p_window_minutes: minutes })
  return true
}

/** "unconfirmed": the password is right, but the owner hasn't confirmed their email yet. */
export type PasswordResult = "ok" | "wrong" | "busy" | "unconfirmed"

/** Checks a password and, if it's right, signs this browser in. */
export async function passwordSignIn(email: string, password: string): Promise<PasswordResult> {
  const { error } = await (await createSupabaseServerClient()).auth.signInWithPassword({ email, password })
  if (!error) return "ok"
  if (error.code === "email_not_confirmed") return "unconfirmed"
  return error.status === 429 ? "busy" : "wrong"
}

/** Checks a password without touching this browser's login (e.g. before changing it). */
export async function passwordIsRight(email: string, password: string): Promise<"ok" | "wrong" | "busy"> {
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) return error.status === 429 ? "busy" : "wrong"
  await client.auth.signOut({ scope: "local" }) // end the extra session this check created
  return "ok"
}

/**
 * For a right password on an email that isn't confirmed yet: sends a fresh
 * confirmation link (a few per hour at most) and says what to do.
 */
export async function unconfirmedMessage(email: string) {
  if (!emailEnabled()) return `This email hasn't been confirmed yet. Write to ${config.contactEmail} for help.`
  if (await allowAttempt("confirm-email", email, 3, 10)) await sendLoginLink(email, "confirm")
  return `Confirm your email first: we've sent a link to ${email}. Open it to log in.`
}

/** The email behind a staff username, looked up on the server so it never reaches the browser. */
export async function staffLoginEmail(slug: string, username: string) {
  if (!USERNAME_PATTERN.test(username)) return null
  const admin = createSupabaseAdminClient()
  const { data: business } = await admin.from("businesses").select("id").eq("slug", slug).maybeSingle()
  if (!business) return null
  const { data: member } = await admin.from("members").select("user_id").eq("business_id", business.id).eq("username", username).maybeSingle()
  if (!member) return null
  const { data } = await admin.auth.admin.getUserById(member.user_id)
  return data.user?.email ?? null
}
