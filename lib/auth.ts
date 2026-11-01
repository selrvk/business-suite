import { cache } from "react"
import { unstable_cache } from "next/cache"
import { notFound, redirect } from "next/navigation"
import { getSupabase } from "./supabase/server"
import { createSupabaseAdminClient } from "./supabase/admin"
import { hasModule, type ModuleKey } from "./config"
import { businessModules, hasOption, type ProductOption } from "./features"
import type { Business, Role } from "./types"

export type Session = {
  supabase: Awaited<ReturnType<typeof getSupabase>>
  userId: string
  email: string
  username: string
  role: Role
  isAdmin: boolean
  isOwner: boolean
  business: Business
}

type Membership = { username: string; role: Role; business: Business }

const MEMBER_SELECT = "username, role, business:businesses(*)"

/**
 * A login's business, username and role. These rarely change, so they're kept
 * between requests. Anything that changes them calls updateTag("tenancy").
 */
const cachedMembership = unstable_cache(
  async (userId: string): Promise<Membership | null> => {
    const { data, error } = await createSupabaseAdminClient()
      .from("members")
      .select(MEMBER_SELECT)
      .eq("user_id", userId)
      .maybeSingle()
    if (error) throw error // failures aren't cached
    return data as unknown as Membership | null
  },
  ["membership", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""],
  { tags: ["tenancy"], revalidate: 300 },
)

async function loadMembership(supabase: Session["supabase"], userId: string): Promise<Membership | null> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      return await cachedMembership(userId)
    } catch {
      // fall back to a direct read below
    }
  }
  const { data } = await supabase.from("members").select(MEMBER_SELECT).eq("user_id", userId).maybeSingle()
  return data as unknown as Membership | null
}

/** How long after opening a password reset link you can set a new password without the old one. */
export const RESET_WINDOW_SECONDS = 30 * 60

/** True within RESET_WINDOW_SECONDS of logging in through an emailed link. */
export function linkLoginIsFresh(linkLoginAt: number, now = Date.now()) {
  return now / 1000 - linkLoginAt <= RESET_WINDOW_SECONDS
}

/** Ways of logging in by clicking an emailed link (as opposed to a password). */
const LINK_METHODS = ["recovery", "magiclink", "otp", "email/signup", "invite"]

/**
 * The signed-in user's verified id and email (from the login token), or null.
 * twoStep is true once they've also entered an authenticator code this session.
 * linkLoginAt is when they last logged in through an emailed link (Unix seconds, or 0).
 */
export const getClaims = cache(async () => {
  const supabase = await getSupabase()
  const { data, error } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (error || !claims?.sub) return null
  const amr = (Array.isArray(claims.amr) ? claims.amr : []) as { method?: string; timestamp?: number }[]
  const linkLoginAt = Math.max(0, ...amr.filter(a => LINK_METHODS.includes(a.method ?? "")).map(a => Number(a.timestamp) || 0))
  return { userId: claims.sub, email: String(claims.email ?? "").toLowerCase(), twoStep: claims.aal === "aal2", linkLoginAt }
})

/**
 * The signed-in user with their business, or null. Cached per request.
 *
 * getClaims() checks the login token locally when the Supabase project uses
 * asymmetric signing keys (the default for new projects), otherwise it asks
 * Supabase, which is slower but just as safe.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const claims = await getClaims()
  if (!claims) return null
  const supabase = await getSupabase()
  const membership = await loadMembership(supabase, claims.userId)
  if (!membership?.business) return null
  return {
    supabase,
    userId: claims.userId,
    email: claims.email,
    username: membership.username,
    role: membership.role,
    isAdmin: membership.role === "owner" || membership.role === "admin",
    isOwner: membership.role === "owner",
    business: membership.business,
  }
})

/** Whether a business can use the suite right now (free trial or paid time left). */
export function access(business: Pick<Business, "trial_ends_at" | "paid_until">, now = Date.now()) {
  const trialEnd = new Date(business.trial_ends_at).getTime()
  const paidEnd = business.paid_until ? new Date(business.paid_until).getTime() : 0
  const endsAt = Math.max(trialEnd, paidEnd)
  return {
    active: endsAt > now,
    onTrial: paidEnd <= now && trialEnd > now,
    endsAt: new Date(endsAt),
    daysLeft: Math.max(0, Math.ceil((endsAt - now) / 86_400_000)),
  }
}

/** For pages: sends signed-out visitors to the login page. */
export async function requireUser() {
  const session = await getSession()
  if (!session) redirect("/login")
  return session
}

/** For app pages: also sends businesses whose trial or paid time has run out to Billing. */
export async function requireActive() {
  const session = await requireUser()
  if (!access(session.business).active) redirect("/billing")
  return session
}

/** For pages: sends non-admins back to the dashboard. */
export async function requireAdminPage() {
  const session = await requireActive()
  if (!session.isAdmin) redirect("/dashboard")
  return session
}

/** For pages: 404s when the module isn't offered here or the business turned it off. */
export async function requireModule(module: ModuleKey) {
  if (!hasModule(module)) notFound()
  const session = await getSession()
  if (session && !businessModules(session.business).includes(module)) notFound()
}

/** For pages of optional product details (suppliers, expiry...): 404s when the business hasn't turned it on. */
export async function requireOption(option: ProductOption) {
  const session = await getSession()
  if (session && !hasOption(session.business, option)) notFound()
}

/**
 * For server actions: returns the session, or an error result to return as-is.
 * Admin-only actions re-check the role in the database (not the cache), since
 * some of them use the service-role key.
 */
export async function guard(
  options: { admin?: boolean; allowExpired?: boolean } = {},
): Promise<{ ok: true; session: Session } | { ok: false; error: string }> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Your session expired. Please log in again." }
  if (!options.allowExpired && !access(session.business).active)
    return { ok: false, error: "Your free trial or subscription has ended. Go to Billing to continue." }
  if (options.admin) {
    const { data } = await session.supabase.from("members").select("role").eq("user_id", session.userId).maybeSingle()
    if (data?.role !== "owner" && data?.role !== "admin") return { ok: false, error: "Only an owner or admin can do that." }
  }
  return { ok: true, session }
}

// ---------------------------------------------------------------------------
// Platform admin: you, the owner of the whole site. Set PLATFORM_ADMIN_EMAILS
// in .env. These logins don't belong to a business and have no trial; they
// only manage the platform at /platform, and need two-step login: a password,
// then a code from an authenticator app (see /platform/verify).
// ---------------------------------------------------------------------------

export function isPlatformEmail(email: string | null | undefined) {
  if (!email) return false
  return (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.trim().toLowerCase())
}

/** Logged in with a platform email (maybe not past the second step yet). For showing links. */
export async function isPlatformLogin() {
  const claims = await getClaims()
  return isPlatformEmail(claims?.email)
}

/** Logged in with a platform email AND past the second step. Required to see or change anything. */
export async function isPlatformAdmin() {
  const claims = await getClaims()
  return isPlatformEmail(claims?.email) && claims!.twoStep
}

/** For platform pages: 404 for everyone else, the code screen if the second step is missing. */
export async function requirePlatformAdmin() {
  const claims = await getClaims()
  if (!isPlatformEmail(claims?.email)) notFound()
  if (!claims!.twoStep) redirect("/platform/verify")
}
