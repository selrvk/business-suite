import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import { customFields, hasOption } from "@/lib/features"
import { num, pesos, toYmd } from "@/lib/format"
import type { Item } from "@/lib/types"
import { LocationFilter } from "@/components/location-filter"
import { getWorkplace, placeFilter, viewLocation } from "@/lib/locations"
import { AddProductButton, ProductsMenu, ProductsTable } from "./products-table"

export const metadata = { title: "Products" }

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  await requireModule("inventory")
  const supabase = await getSupabase()
  const session = await requireUser()
  const { isAdmin, business, can } = session
  const workplace = await getWorkplace(session)
  const view = viewLocation(workplace, (await searchParams).at)
  const place = placeFilter(workplace, view)
  const showCost = can("see_costs")
  const showSuppliers = hasOption(business, "suppliers")
  const showExpiry = hasOption(business, "expiry")
  const fields = customFields(business)
  const none = Promise.resolve({ data: [] as never[], error: null })
  const [{ data: allItems, error }, supplierRows, batchRows, levelRows] = await Promise.all([
    fetchAll<Item>((from, to) =>
      supabase
        .from("items")
        .select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell, supplier_id, category, location, reorder_level, senior_discount, extra")
        .order("id")
        .range(from, to),
    ),
    showSuppliers ? supabase.from("suppliers").select("id, name") : none,
    showExpiry
      ? fetchAll<{ item_id: number; expires_on: string }>((from, to) =>
          (view ? supabase.from("stock_batches").select("item_id, expires_on").eq("location_id", view.id) : supabase.from("stock_batches").select("item_id, expires_on"))
            .gt("quantity", 0)
            .not("expires_on", "is", null)
            .order("id")
            .range(from, to),
        )
      : none,
    workplace.multi
      ? fetchAll<{ item_id: number; location_id: number; quantity: number }>((from, to) =>
          supabase.from("stock_levels").select("item_id, location_id, quantity").neq("quantity", 0).order("item_id").order("location_id").range(from, to),
        )
      : none,
  ])
  const failed = error ?? supplierRows.error ?? batchRows.error ?? levelRows.error
  if (failed) return <DbError error={failed} />

  // Stock per location; with one location picked, the stock shown is what's there.
  const breakdown: Record<number, Record<number, number>> | null = workplace.multi ? {} : null
  for (const l of (levelRows.data ?? []) as { item_id: number; location_id: number; quantity: number }[]) {
    if (breakdown) (breakdown[l.item_id] ??= {})[l.location_id] = l.quantity
  }
  const items = view ? allItems.map(i => ({ ...i, current_stock: breakdown?.[i.id]?.[view.id] ?? 0 })) : allItems

  const suppliers: Record<number, string> = Object.fromEntries(((supplierRows.data ?? []) as { id: number; name: string }[]).map(r => [r.id, r.name]))
  // Each product's nearest expiry date.
  const expiry: Record<number, string> = {}
  for (const b of (batchRows.data ?? []) as { item_id: number; expires_on: string }[]) {
    if (!expiry[b.item_id] || b.expires_on < expiry[b.item_id]) expiry[b.item_id] = b.expires_on
  }

  const units = items.reduce((sum, i) => sum + Math.max(0, i.current_stock), 0)
  const value = showCost
    ? `${pesos(items.reduce((sum, i) => sum + Math.max(0, i.current_stock) * i.price_buy, 0))} at cost`
    : `${pesos(items.reduce((sum, i) => sum + Math.max(0, i.current_stock) * i.price_sell, 0))} at selling price`

  const stockPlace = !place ? null : view ? { id: view.id, name: view.name } : ("all" as const)

  // Same column names the importer understands, so this file can be edited and imported back.
  const exportRows = items.map(i => ({
    Barcode: i.barcode ?? "",
    Name: i.name,
    Brand: i.brand ?? "",
    Stock: i.current_stock,
    Unit: i.unit,
    ...(showCost ? { Cost: i.price_buy } : {}),
    Price: i.price_sell,
    ...(showSuppliers ? { Supplier: i.supplier_id ? (suppliers[i.supplier_id] ?? "") : "" } : {}),
    ...(hasOption(business, "categories") ? { Category: i.category ?? "" } : {}),
    ...(hasOption(business, "locations") ? { Location: i.location ?? "" } : {}),
    "Low-stock level": i.reorder_level ?? "",
    ...Object.fromEntries(fields.map(f => [f.label, i.extra?.[f.id] ?? ""])),
    ...(showExpiry ? { "Nearest expiry": expiry[i.id] ?? "" } : {}),
    ...(showCost ? { "Stock value (cost)": +(i.current_stock * i.price_buy).toFixed(2) } : {}),
    "Stock value (price)": +(i.current_stock * i.price_sell).toFixed(2),
  }))

  return (
    <>
      <PageHeader
        title="Products"
        subtitle={`${num(items.length)} products · ${num(units)} units on hand${place ? (view ? ` at ${view.name}` : " in all locations") : ""} · ${value}`}
      >
        <ProductsMenu exportRows={exportRows} filename={`inventory_${view ? `${view.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_` : ""}${toYmd()}`} canImport={isAdmin} />
        <AddProductButton place={stockPlace} />
      </PageHeader>

      <ProductsTable
        items={items}
        isAdmin={isAdmin}
        suppliers={suppliers}
        expiry={expiry}
        place={stockPlace}
        breakdown={breakdown}
        locationFilter={place && <LocationFilter path="/inventory" value={place.value} locations={place.locations} />}
      />
    </>
  )
}
