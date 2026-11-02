import Link from "next/link"
import { FileUp, PackagePlus, Printer } from "lucide-react"
import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import { customFields, hasOption } from "@/lib/features"
import { money, num, toYmd } from "@/lib/format"
import type { Item } from "@/lib/types"
import { AddProductButton, ProductsTable } from "./products-table"

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

  const low = business.low_stock_threshold
  const units = items.reduce((sum, i) => sum + Math.max(0, i.current_stock), 0)
  const costValue = items.reduce((sum, i) => sum + Math.max(0, i.current_stock) * i.price_buy, 0)
  const lowCount = items.filter(i => i.current_stock > 0 && i.current_stock <= (i.reorder_level ?? low)).length
  const outCount = items.filter(i => i.current_stock <= 0).length

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
      <PageHeader eyebrow="Inventory" title="Products" subtitle="Scan any product to find it. Scan an unknown barcode to add it.">
        <ExportButton rows={exportRows} filename={`inventory_${toYmd()}`} sheet="Inventory" />
        {isAdmin && (
          <Link href="/inventory/import" className="btn btn-secondary">
            <FileUp size={14} /> Import
          </Link>
        )}
        <Link href="/print/labels/products" target="_blank" className="btn btn-secondary">
          <Printer size={14} /> Labels
        </Link>
        <Link href="/inventory/stock-in" className="btn btn-secondary">
          <PackagePlus size={14} /> Stock in
        </Link>
        <AddProductButton />
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <Stat label="Products" value={num(items.length)} hint={`${num(units)} units on hand`} />
        {showCost ? (
          <Stat label="Stock value (cost)" value={money(costValue)} tone="info" />
        ) : (
          <Stat label="Stock value (price)" value={money(items.reduce((sum, i) => sum + Math.max(0, i.current_stock) * i.price_sell, 0))} tone="info" />
        )}
        <Stat label="Low stock" value={lowCount} tone={lowCount ? "warn" : "good"} hint="At or below their low-stock level" />
        <Stat label="Out of stock" value={outCount} tone={outCount ? "bad" : "good"} />
      </div>

      <ProductsTable items={items} isAdmin={isAdmin} suppliers={suppliers} expiry={expiry} />
    </>
  )
}
