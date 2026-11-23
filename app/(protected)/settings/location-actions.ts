"use server"

import { cookies } from "next/headers"
import { revalidatePath, updateTag } from "next/cache"
import { guard } from "@/lib/auth"
import { dbMessage } from "@/lib/db"
import { logActivity } from "@/lib/activity"
import { LOCATION_COOKIE, getWorkplace } from "@/lib/locations"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import type { ActionResult, Location } from "@/lib/types"

function refresh() {
  updateTag("locations")
  revalidatePath("/", "layout")
}

/** Owners and admins: switch which location they're working at. Remembered on this device. */
export async function switchLocation(id: number): Promise<ActionResult> {
  const g = await guard()
  if (!g.ok) return g
  const workplace = await getWorkplace(g.session)
  if (!workplace.canSwitch)
    return { ok: false, error: "Staff work at their own branch. An owner or admin can change it in Settings → Logins." }
  if (!workplace.open.some(l => l.id === id)) return { ok: false, error: "That location is closed or doesn't exist. Reload the page." }
  ;(await cookies()).set(LOCATION_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  })
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}

export type LocationInput = { name: string; kind: string; address: string }

function clean(input: LocationInput): { name: string; kind: Location["kind"]; address: string | null } | { error: string } {
  const name = String(input.name ?? "")
    .trim()
    .replace(/\s+/g, " ")
  if (!name) return { error: "Give the location a name, like Lipa branch or Warehouse." }
  if (name.length > 60) return { error: "Location names can be up to 60 characters." }
  if (input.kind !== "branch" && input.kind !== "warehouse") return { error: "Pick whether it's a branch or a warehouse." }
  return {
    name,
    kind: input.kind,
    address:
      String(input.address ?? "")
        .trim()
        .slice(0, 200) || null,
  }
}

const taken = (message: string) => (/duplicate|unique/i.test(message) ? "There's already a location with that name." : message)

export async function addLocation(input: LocationInput): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const fields = clean(input)
  if ("error" in fields) return { ok: false, error: fields.error }
  const { error } = await g.session.supabase.from("locations").insert(fields)
  if (error) return { ok: false, error: taken(dbMessage(error)) }
  await logActivity(g.session, "location_added", fields.name, { kind: fields.kind })
  refresh()
  return { ok: true, data: null }
}

export async function updateLocation(id: number, input: LocationInput): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const fields = clean(input)
  if ("error" in fields) return { ok: false, error: fields.error }
  const { supabase } = g.session
  const { data: before } = await supabase.from("locations").select("name, kind").eq("id", id).maybeSingle()
  if (!before) return { ok: false, error: "That location doesn't exist. Reload the page." }
  const { error } = await supabase.from("locations").update(fields).eq("id", id)
  if (error) return { ok: false, error: taken(dbMessage(error)) }
  const changes = [
    ...(before.name !== fields.name ? [`name: ${before.name} → ${fields.name}`] : []),
    ...(before.kind !== fields.kind ? [`${before.kind} → ${fields.kind}`] : []),
  ]
  await logActivity(g.session, "location_changed", fields.name, changes.length ? { changes } : {})
  refresh()
  return { ok: true, data: null }
}

/** Closes a location (once its stock is gone) or opens it again. Closing moves its logins to the main location. */
export async function setLocationOpen(id: number, open: boolean): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { data, error } = await g.session.supabase
    .from("locations")
    .update({ active: open === true })
    .eq("id", id)
    .select("name")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "That location doesn't exist. Reload the page." }
  await logActivity(g.session, open ? "location_reopened" : "location_closed", data[0].name)
  updateTag("tenancy") // closing changes logins' home branch
  refresh()
  return { ok: true, data: null }
}

/** The branch a login is based at (null: the main location). Staff can only work there. */
export async function setHomeLocation(userId: string, locationId: number | null): Promise<ActionResult> {
  const g = await guard({ admin: true })
  if (!g.ok) return g
  const { supabase, business } = g.session
  let name = "the main location"
  if (locationId !== null) {
    const { data: loc } = await supabase.from("locations").select("name, active").eq("id", locationId).maybeSingle()
    if (!loc) return { ok: false, error: "That location doesn't exist. Reload the page." }
    if (!loc.active) return { ok: false, error: `${loc.name} is closed.` }
    name = loc.name
  }
  // The service role, scoped to this business, as for the other login changes.
  const { data, error } = await createSupabaseAdminClient()
    .from("members")
    .update({ location_id: locationId })
    .eq("user_id", userId)
    .eq("business_id", business.id)
    .select("username")
  if (error) return { ok: false, error: dbMessage(error) }
  if (!data?.length) return { ok: false, error: "That person isn't part of your business." }
  await logActivity(g.session, "home_branch_changed", data[0].username, { at: name })
  updateTag("tenancy")
  revalidatePath("/", "layout")
  return { ok: true, data: null }
}
