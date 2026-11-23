import { headers } from "next/headers"
import { requireUser } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { businessModules, hasOption } from "@/lib/features"
import { getWorkplace } from "@/lib/locations"
import { type CategoryRates } from "./senior-form"
import { type UserRow } from "./settings-forms"
import { SettingsView } from "./settings-view"

export const metadata = { title: "Settings" }

export default async function SettingsPage() {
  const [session, h] = await Promise.all([requireUser(), headers()])
  const { supabase, isAdmin, userId, business, username, email } = session
  const branches = isAdmin && hasOption(business, "branches")
  const [{ data: users }, workplace, levels] = await Promise.all([
    isAdmin ? supabase.from("members").select("user_id, username, role, created_at, permissions, location_id").order("created_at") : { data: null },
    getWorkplace(session),
    branches
      ? fetchAll<{ location_id: number; quantity: number }>((from, to) =>
          supabase.from("stock_levels").select("location_id, quantity").neq("quantity", 0).order("item_id").order("location_id").range(from, to),
        )
      : { data: [] },
  ])
  // Units in stock at each location, for the Locations list.
  const units: Record<number, number> = {}
  for (const l of levels.data) units[l.location_id] = (units[l.location_id] ?? 0) + Math.max(0, l.quantity)

  // Senior/PWD rates by category, for setting a whole category at once.
  let categories: CategoryRates[] | null = null
  if (isAdmin && businessModules(business).includes("sales") && hasOption(business, "categories")) {
    const { data: rows } = await fetchAll<{ category: string | null; senior_discount: number | null }>((from, to) =>
      supabase.from("items").select("category, senior_discount").order("id").range(from, to),
    )
    const map = new Map<string, CategoryRates>()
    for (const r of rows) {
      const key = r.category ?? ""
      const entry = map.get(key) ?? { category: r.category, products: 0, rates: {} }
      const rate = r.senior_discount == null ? "default" : String(r.senior_discount)
      entry.products++
      entry.rates[rate] = (entry.rates[rate] ?? 0) + 1
      map.set(key, entry)
    }
    categories = [...map.values()].sort((a, b) => (a.category === null ? 1 : b.category === null ? -1 : a.category.localeCompare(b.category)))
  }

  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  const staffLink = `${proto}://${host}/s/${business.slug}`

  return (
    <SettingsView
      isAdmin={isAdmin}
      business={business}
      users={(users ?? []) as UserRow[]}
      userId={userId}
      username={username}
      email={email}
      categories={categories}
      staffLink={staffLink}
      locations={branches ? workplace.locations : null}
      units={units}
      places={workplace.multi ? workplace.open.map(l => ({ id: l.id, name: l.name, is_main: l.is_main })) : null}
    />
  )
}
