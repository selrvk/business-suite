import { cache } from "react"
import { cookies } from "next/headers"
import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "./supabase/admin"
import { hasOption } from "./features"
import { fetchAll } from "./db"
import type { Session } from "./auth"
import type { Location } from "./types"

// Branches and warehouses. Every business has a main location; with the
// "branches" option on, it can add more in Settings. Each login works at one
// location at a time ("here"): staff at their home branch, owners and admins
// wherever they switch to in the sidebar. Pages that show numbers can also be
// filtered with ?at= (a location id, or "all").

/** Remembers where an owner or admin last switched to. */
export const LOCATION_COOKIE = "bs_location"

const SELECT = "id, name, kind, address, is_main, active"

const sortLocations = (list: Location[]) =>
  [...list].sort((a, b) => Number(b.is_main) - Number(a.is_main) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))

/** A business's locations. They rarely change, so they're kept between requests; changes call updateTag("locations"). */
const cachedLocations = unstable_cache(
  async (businessId: string): Promise<Location[]> => {
    const { data, error } = await createSupabaseAdminClient().from("locations").select(SELECT).eq("business_id", businessId)
    if (error) throw error // failures aren't cached
    return (data ?? []) as Location[]
  },
  ["locations", process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""],
  { tags: ["locations"], revalidate: 300 },
)

async function loadLocations(session: Session): Promise<Location[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      return sortLocations(await cachedLocations(session.business.id))
    } catch {
      // fall back to a direct read below
    }
  }
  const { data } = await session.supabase.from("locations").select(SELECT)
  return sortLocations((data ?? []) as Location[])
}

export type Workplace = {
  /** Branches are on and more than one location is open: show where things happen. */
  multi: boolean
  /** Every location, main first, closed ones last. */
  locations: Location[]
  /** The open ones. */
  open: Location[]
  /** Where this login is working now. */
  here: Location
  /** Owners and admins can switch where they work; staff stay at their home branch. */
  canSwitch: boolean
}

// Used only if a business somehow has no main location yet (the database
// update adds one), so pages still load and the database picks the location.
const FALLBACK: Location = { id: 0, name: "Main store", kind: "branch", address: null, is_main: true, active: true }

/** Where the signed-in person works, and the business's locations. Cached per request. */
export const getWorkplace = cache(async (session: Session): Promise<Workplace> => {
  const [locations, jar] = await Promise.all([loadLocations(session), cookies()])
  const open = locations.filter(l => l.active)
  const main = locations.find(l => l.is_main) ?? FALLBACK
  const multi = hasOption(session.business, "branches") && open.length > 1
  if (!multi) return { multi: false, locations, open: open.length ? open : [main], here: main, canSwitch: false }

  const openById = (id: number | null | undefined) => (id ? open.find(l => l.id === id) : undefined)
  const home = openById(session.homeLocationId)
  const picked = session.isAdmin ? openById(Number(jar.get(LOCATION_COOKIE)?.value) || null) : undefined
  return { multi, locations, open, here: picked ?? home ?? main, canSwitch: session.isAdmin }
})

/**
 * For pages that show numbers: the location picked with ?at=, or where you're
 * working. null means every location (also for businesses with just one).
 */
export function viewLocation(workplace: Workplace, at: string | string[] | undefined): Location | null {
  if (!workplace.multi) return null
  const value = Array.isArray(at) ? at[0] : at
  if (value === "all") return null
  return workplace.locations.find(l => String(l.id) === value) ?? workplace.here
}

/** The location id to give the database for something done here, or null to let it decide (the main location). */
export function hereId(workplace: Workplace) {
  return workplace.here.id || null
}

/** Location names by id, for labelling rows from several locations. */
export function locationNames(workplace: Workplace) {
  return Object.fromEntries(workplace.locations.map(l => [l.id, l.name])) as Record<number, string>
}

/** What a page needs to show a location filter, or null when the business has one location. */
export type PlaceFilter = {
  /** The location shown, or "all". */
  value: number | "all"
  /** Locations to pick from: the open ones (plus the one shown, if it's closed). */
  locations: { id: number; name: string }[]
  /** Every location's name by id, for labelling rows. */
  names: Record<number, string>
}

export function placeFilter(workplace: Workplace, view: Location | null): PlaceFilter | null {
  if (!workplace.multi) return null
  const list = view && !view.active ? [...workplace.open, view] : workplace.open
  return { value: view?.id ?? "all", locations: list.map(l => ({ id: l.id, name: l.name })), names: locationNames(workplace) }
}

/** How much of each product is at one location (products with none are left out). */
export async function levelsAt(supabase: Session["supabase"], locationId: number) {
  const { data, error } = await fetchAll<{ item_id: number; quantity: number }>((from, to) =>
    supabase.from("stock_levels").select("item_id, quantity").eq("location_id", locationId).order("item_id").range(from, to),
  )
  return { levels: new Map(data.map(l => [l.item_id, l.quantity])), error }
}

/** Products with current_stock set to what's at one location. */
export function withStockAt<T extends { id: number; current_stock: number }>(items: T[], levels: Map<number, number>): T[] {
  return items.map(i => ({ ...i, current_stock: levels.get(i.id) ?? 0 }))
}
