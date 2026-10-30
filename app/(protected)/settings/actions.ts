"use server"

import { revalidatePath, updateTag } from "next/cache"
import { guard, type Session } from "@/lib/auth"
import { USERNAME_PATTERN, staffEmail } from "@/lib/config"
import { dbMessage } from "@/lib/db"
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
  low_stock_threshold: number
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

  const { supabase, business } = g.session
  const { error } = await supabase
    .from("businesses")
    .update({
      name,
      slug,
      address: input.address.trim() || null,
      contact: input.contact.trim() || null,
      receipt_footer: input.receipt_footer.trim() || null,
      low_stock_threshold: threshold,
    })
    .eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }
  refresh()
  return { ok: true, data: null }
}

const logoPrefix = (businessId: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/branding/${businessId}/`

/**
 * Saves (or clears, with null) the logo after the browser has uploaded it to
 * this business's folder in the "branding" bucket, then removes the old file.
 */
export async function setLogo(url: string | null): Promise<ActionResult> {
  const g = await guard({ admin: true, allowExpired: true })
  if (!g.ok) return g
  const { supabase, business } = g.session
  const prefix = logoPrefix(business.id)
  if (url !== null && !url.startsWith(prefix)) return { ok: false, error: "That logo wasn't uploaded here." }

  const { error } = await supabase.from("businesses").update({ logo_url: url }).eq("id", business.id)
  if (error) return { ok: false, error: dbMessage(error) }

  const previous = business.logo_url
  if (previous && previous !== url && previous.startsWith(prefix)) {
    await supabase.storage.from("branding").remove([`${business.id}/${previous.slice(prefix.length)}`])
  }
  refresh()
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

  const { error: memberError } = await admin
    .from("members")
    .insert({ user_id: data.user.id, business_id: business.id, username, role: input.isAdmin ? "admin" : "staff" })
  if (memberError) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: dbMessage(memberError) }
  }
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
  refresh()
  return { ok: true, data: null }
}
