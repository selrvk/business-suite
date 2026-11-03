"use server"

import { revalidatePath, updateTag } from "next/cache"
import { guard, type Session } from "@/lib/auth"
import { USERNAME_PATTERN, staffEmail } from "@/lib/config"
import { dbMessage } from "@/lib/db"
import { logActivity } from "@/lib/activity"
import { ALL_PERMISSIONS, CASHIER, PERMISSION_INFO, type Permission } from "@/lib/permissions"
import { cleanFeatures, type FeaturesInput } from "@/lib/features"
import { BUSY, loginLockout, passwordIsRight } from "@/lib/login"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ActionResult } from "@/lib/types"

function refresh() {
  updateTag("tenancy")
  revalidatePath("/", "layout")
}

export type BusinessInput = {
  name: string
  slug: string
  address: string
  contact: string
  receipt_footer: string
  receipt_note: string
  low_stock_threshold: number
  vat_registered: boolean
  digest: "off" | "daily" | "weekly"
}

export async function updateBusiness(input: BusinessInput): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const name = input.name.trim()
  const threshold = Number(input.low_stock_threshold)
  if (!name) return { ok: false, error: "Enter the business name." }
  if (!Number.isInteger(threshold) || threshold < 0) return { ok: false, error: "Low-stock level must be a whole number." }
  const slug = input.slug.trim().toLowerCase()
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2 || slug.length > 40)
    return { ok: false, error: "Staff link: 2–40 lowercase letters, numbers and single dashes, e.g. santos-trading." }
  if (!["off", "daily", "weekly"].includes(input.digest)) return { ok: false, error: "Pick how often to get the summary email." }

  const { supabase, business } = g.session
  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      slug,
      address: input.address.trim() || null,
      contact: input.contact.trim() || null,
      receipt_footer: input.receipt_footer.trim() || null,
      receipt_note: input.receipt_note.trim().slice(0, 200) || null,
      vat_registered: input.vat_registered === true,
      low_stock_threshold: threshold,
      digest: input.digest,
    })
    .eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  const next = { name, slug, low_stock_threshold: threshold, vat_registered: input.vat_registered === true, digest: input.digest }
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter(k => String(business[k] ?? "weekly") !== String(next[k]))
  await logActivity(g.session, "business_changed", name, changed.length ? { changed } : {})
  refresh()
  return { ok: true, data: null }
}

const RATES = [0, 5, 20]

/** The Senior/PWD discount for products that don't set their own, and the BMBE/cooperative exemption from the 5%. */
export async function updateSeniorSettings(input: { senior_default: number; senior_basic_exempt: boolean }): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  if (!RATES.includes(input.senior_default)) return { ok: false, error: "Pick a default discount." }
  const { supabase, business } = g.session
  const { error } = await supabase
    .from("businesses")
    .update({ senior_default: input.senior_default, senior_basic_exempt: input.senior_basic_exempt === true })
    .eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "business_changed", business.name, {
    senior_default: input.senior_default,
    senior_basic_exempt: input.senior_basic_exempt === true,
  })
  refresh()
  return { ok: true, data: null }
}

/** Sets the Senior/PWD discount of every product in a category (null category = products without one; null rate = the default). */
export async function setCategorySenior(category: string | null, rate: number | null): Promise<ActionResult<number>> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  if (rate !== null && !RATES.includes(rate)) return { ok: false, error: "Pick a discount." }
  const query = g.session.supabase.from("items").update({ senior_discount: rate })
  const { data, error } = await (category ? query.eq("category", category) : query.is("category", null)).select("id")
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "product_changed", category ? `Category ${category}` : "Products without a category", {
    senior_discount: rate ?? "default",
    products: data?.length ?? 0,
  })
  refresh()
  return { ok: true, data: data?.length ?? 0 }
}

const logoPrefix = (businessId: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${businessId}/`

const LOGO_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

/** Checks the file's first bytes, so a renamed non-image can't pass as a logo. */
function isImage(bytes: Uint8Array, type: string) {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b)
  if (type === "image/png") return starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (type === "image/jpeg") return starts([0xff, 0xd8, 0xff])
  if (type === "image/webp") return starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8) // RIFF....WEBP
  return false
}

/** Points the business at a new logo (or none), then removes the old file. */
async function saveLogo(session: Session, url: string | null): Promise<ActionResult> {
  const { supabase, business } = session
  const prefix = logoPrefix(business.id)
  const { error } = await supabase.from("businesses").update({ logo_url: url }).eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }

  const previous = business.logo_url
  if (previous && previous !== url && previous.startsWith(prefix)) {
    await supabase.storage.from("branding").remove([`${business.id}/${previous.slice(prefix.length)}`])
  }
  refresh()
  return { ok: true, data: null }
}

/**
 * Uploads a logo (already shrunk by the browser) into this business's folder
 * in the "branding" bucket and makes it the logo. Returns its public address.
 */
export async function uploadLogo(form: FormData): Promise<ActionResult<string>> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const file = form.get("logo")
  if (!(file instanceof Blob)) return { ok: false, error: "Pick an image." }
  const ext = LOGO_TYPES[file.type]
  if (!ext) return { ok: false, error: "Use a PNG, JPG or WebP image." }
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: "That image is too big. Try a smaller one." }
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!isImage(bytes, file.type)) return { ok: false, error: "That file isn't a working image." }

  const { supabase, business } = g.session
  const bucket = supabase.storage.from("branding")
  const path = `${business.id}/logo-${Date.now()}.${ext}`
  const { error } = await bucket.upload(path, bytes, { contentType: file.type, cacheControl: "31536000" })
  if (error) {
    return {
      ok: false,
      error: /bucket not found/i.test(error.message) ? "Logo storage isn't set up yet. Run supabase/schema.sql again." : error.message,
    }
  }
  const url = bucket.getPublicUrl(path).data.publicUrl
  const saved = await saveLogo(g.session, url)
  if (!saved.ok) {
    await bucket.remove([path])
    return saved
  }
  return { ok: true, data: url }
}

export async function removeLogo(): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  return saveLogo(g.session, null)
}

/**
 * Changes your own password. Asks for the current one first (so someone using
 * a computer you left logged in can't lock you out), counts wrong tries like a
 * login, and logs you out everywhere else.
 */
export async function changePassword(current: string, next: string): Promise<ActionResult> {
  const g = await guard({ allowExpired: true })
  if (!g.ok) return g
  if (next.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  if (next === current) return { ok: false, error: "Pick a new password that's different from your current one." }

  const { supabase, email } = g.session
  const lockout = await loginLockout(email)
  if (lockout.paused) return { ok: false, error: lockout.paused }
  const check = await passwordIsRight(email, current)
  if (check === "busy") return { ok: false, error: BUSY }
  if (check === "wrong") return { ok: false, error: (await lockout.failed()) ?? "Your current password is wrong." }
  await lockout.succeeded()

  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return { ok: false, error: error.message }
  await supabase.auth.signOut({ scope: "others" })
  return { ok: true, data: null }
}

/** The member, if they belong to the caller's business. Needed before any service-role change. */
async function memberOfMyBusiness(session: Session, userId: string) {
  const { data } = await createSupabaseAdminClient()
    .from("members")
    .select("user_id, username, role")
    .eq("user_id", userId)
    .eq("business_id", session.business.id)
    .maybeSingle()
  return data
}

export async function addUser(input: { username: string; password: string; isAdmin: boolean }): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const username = input.username.trim().toLowerCase()
  if (!USERNAME_PATTERN.test(username))
    return { ok: false, error: "Username must be 2–32 characters: letters, numbers, dots, dashes or underscores." }
  if (input.password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }

  const { business } = g.session
  const admin = createSupabaseAdminClient()
  const { data: taken } = await admin.from("members").select("user_id").eq("business_id", business.id).eq("username", username).maybeSingle()
  if (taken) return { ok: false, error: "That username is already taken." }

  const { data, error } = await admin.auth.admin.createUser({
    email: staffEmail(username, business.slug),
    password: input.password,
    email_confirm: true,
  })
  if (error || !data.user) return { ok: false, error: error?.message ?? "Couldn't create the login." }

  // New staff start as cashiers; the owner turns on more in Settings → Logins.
  const { error: memberError } = await admin
    .from("members")
    .insert({ user_id: data.user.id, business_id: business.id, username, role: input.isAdmin ? "admin" : "staff", permissions: CASHIER })
  if (memberError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: dbMessage(memberError) }
  }
  await logActivity(g.session, "staff_added", username, { role: input.isAdmin ? "admin" : "staff" })
  refresh()
  return { ok: true, data: null }
}

export async function resetPassword(userId: string, password: string): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." }
  const target = await memberOfMyBusiness(g.session, userId)
  if (!target) return { ok: false, error: "That person isn't part of your business." }
  if (target.role === "owner") return { ok: false, error: "Only the owner can change the owner's password." }
  const { error } = await createSupabaseAdminClient().auth.admin.updateUserById(userId, { password })
  if (error) return { ok: false, error: error.message }
  await logActivity(g.session, "password_reset", target.username)
  return { ok: true, data: null }
}

export async function setAdmin(userId: string, isAdmin: boolean): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  if (userId === g.session.userId) return { ok: false, error: "You can't change your own role." }
  const target = await memberOfMyBusiness(g.session, userId)
  if (!target) return { ok: false, error: "That person isn't part of your business." }
  if (target.role === "owner") return { ok: false, error: "The owner's role can't be changed." }
  const { error } = await createSupabaseAdminClient()
    .from("members")
    .update({ role: isAdmin ? "admin" : "staff" })
    .eq("user_id", userId)
    .eq("business_id", g.session.business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "role_changed", target.username, { from: target.role, to: isAdmin ? "admin" : "staff", field: "role" })
  refresh()
  return { ok: true, data: null }
}

export async function removeUser(userId: string): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  if (userId === g.session.userId) return { ok: false, error: "You can't remove yourself." }
  const target = await memberOfMyBusiness(g.session, userId)
  if (!target) return { ok: false, error: "That person isn't part of your business." }
  if (target.role === "owner") return { ok: false, error: "The owner can't be removed." }
  const { error } = await createSupabaseAdminClient().auth.admin.deleteUser(userId) // removes the membership too
  if (error) return { ok: false, error: error.message }
  await logActivity(g.session, "staff_removed", target.username)
  refresh()
  return { ok: true, data: null }
}

/** Settings → Features: which parts of the suite and which product details this business uses. */
export async function updateFeatures(input: FeaturesInput): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const features = cleanFeatures(input)
  if ("error" in features) return { ok: false, error: features.error }
  const { supabase, business } = g.session
  const { error } = await supabase.from("businesses").update(features).eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "features_changed", business.name, { modules: features.modules, options: features.options })
  refresh()
  return { ok: true, data: null }
}

/** What a staff login may do (see lib/permissions.ts). Owners and admins can always do everything. */
export async function setPermissions(userId: string, permissions: string[]): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const target = await memberOfMyBusiness(g.session, userId)
  if (!target) return { ok: false, error: "That person isn't part of your business." }
  if (target.role !== "staff") return { ok: false, error: "Owners and admins can always do everything." }
  const clean = ALL_PERMISSIONS.filter(p => permissions.includes(p))
  const { error } = await createSupabaseAdminClient()
    .from("members")
    .update({ permissions: clean })
    .eq("user_id", userId)
    .eq("business_id", g.session.business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  await logActivity(g.session, "permissions_changed", target.username, {
    allowed: clean.length ? clean.map(p => PERMISSION_INFO[p as Permission].label) : ["Cashier only"],
  })
  refresh()
  return { ok: true, data: null }
}

/** Hides the setup checklist on the dashboard, or brings it back. */
export async function setSetupHidden(hidden: boolean): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const { error } = await g.session.supabase.from("businesses").update({ setup_hidden: hidden === true }).eq("id", g.session.business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}
