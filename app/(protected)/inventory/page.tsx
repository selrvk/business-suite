import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import { customFields, hasOption } from "@/lib/features"
import { num, pesos, toYmd } from "@/lib/format"
import type { Item } from "@/lib/types"
import { AddProductButton, ProductsMenu, ProductsTable } from "./products-table"

export const metadata = { title: "Products" }

export default async function InventoryPage() {
  await requireModule("inventory")
  const supabase = await getSupabase()
  const { isAdmin, business, can } = await requireUser()
  const showCost = can("see_costs")
  const showSuppliers = hasOption(business, "suppliers")
  const showExpiry = hasOption(business, "expiry")
  const fields = customFields(business)
  const none = Promise.resolve({ data: [] as never[], error: null })
  const [{ data: items, error }, supplierRows, batchRows] = await Promise.all([
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
          supabase.from("stock_batches").select("item_id, expires_on").gt("quantity", 0).not("expires_on", "is", null).order("id").range(from, to),
        )
      : none,
  ])
  const failed = error ?? supplierRows.error ?? batchRows.error
  if (failed) return <DbError error={failed} />

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
      <PageHeader title="Products" subtitle={`${num(items.length)} products · ${num(units)} units on hand · ${value}`}>
        <ProductsMenu exportRows={exportRows} filename={`inventory_${toYmd()}`} canImport={isAdmin} />
        <AddProductButton />
      </PageHeader>

      <ProductsTable items={items} isAdmin={isAdmin} suppliers={suppliers} expiry={expiry} />
    </>
  )
}
