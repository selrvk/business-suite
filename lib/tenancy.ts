import { slugify } from "./config"
import { seniorDefaultFor, type BusinessType } from "./features"
import { createSupabaseAdminClient } from "./supabase/admin"

type Admin = ReturnType<typeof createSupabaseAdminClient>

/** "santos-trading", or "santos-trading-x7k2" if that's taken. */
async function freeSlug(admin: Admin, base: string) {
  for (let i = 0; i < 6; i++) {
    const slug = i === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`
    const { data } = await admin.from("businesses").select("id").eq("slug", slug).maybeSingle()
    if (!data) return slug
  }
  throw new Error("Couldn't pick a web address for this business. Try a slightly different name.")
}

/** The owner's username, from the part of their email before the @. */
function ownerUsername(email: string) {
  const name = email.split("@")[0].toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 32)
  return name.length >= 2 ? name : "owner"
}

/**
 * Creates a business (with its free trial) owned by an existing login.
 * Server-only: uses the service role. Removes the business again if the
 * owner can't be attached, so nothing is left half-made.
 */
export async function createBusinessFor(
  userId: string,
  email: string,
  businessName: string,
  features?: { business_type: string | null; modules: string[]; options: string[] },
) {
  const admin = createSupabaseAdminClient()
  const slug = await freeSlug(admin, slugify(businessName))
  const { data: business, error } = await admin
    .from("businesses")
    .insert({
      name: businessName,
      slug,
      ...(features ?? {}),
      ...(features ? { senior_default: seniorDefaultFor(features.business_type as BusinessType | null) } : {}),
    })
    .select("id")
    .single()
  if (error) throw error
  const { error: memberError } = await admin
    .from("members")
    .insert({ user_id: userId, business_id: business.id, username: ownerUsername(email), role: "owner" })
  if (memberError) {
    await admin.from("businesses").delete().eq("id", business.id)
    throw memberError
  }
  return business.id as string
}
