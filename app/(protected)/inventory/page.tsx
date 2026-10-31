import Link from "next/link"
import { FileUp, PackagePlus, Printer } from "lucide-react"
import { DbError } from "@/components/db-error"
import { ExportButton } from "@/components/export-button"
import { PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import { money, num, toYmd } from "@/lib/format"
import type { Item } from "@/lib/types"
import { AddProductButton, ProductsTable } from "./products-table"

export const metadata = { title: "Products" }

export default async function InventoryPage() {
  requireModule("inventory")
  const supabase = await getSupabase()
  const [{ isAdmin, business }, { data: items, error }] = await Promise.all([
    requireUser(),
    fetchAll<Item>((from, to) => supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell").order("id").range(from, to)),
  ])
  if (error) return <DbError error={error} />

  const low = business.low_stock_threshold
  const units = items.reduce((sum, i) => sum + Math.max(0, i.current_stock), 0)
  const costValue = items.reduce((sum, i) => sum + Math.max(0, i.current_stock) * i.price_buy, 0)
  const lowCount = items.filter(i => i.current_stock > 0 && i.current_stock <= low).length
  const outCount = items.filter(i => i.current_stock <= 0).length

  const exportRows = items.map(i => ({
    Barcode: i.barcode ?? "",
    Name: i.name,
    Brand: i.brand ?? "",
    Stock: i.current_stock,
    Unit: i.unit,
    Cost: i.price_buy,
    Price: i.price_sell,
    "Stock value (cost)": +(i.current_stock * i.price_buy).toFixed(2),
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
        <Stat label="Stock value (cost)" value={money(costValue)} tone="info" />
        <Stat label="Low stock" value={lowCount} tone={lowCount ? "warn" : "good"} hint={`${low} or fewer left`} />
        <Stat label="Out of stock" value={outCount} tone={outCount ? "bad" : "good"} />
      </div>

      <ProductsTable items={items} isAdmin={isAdmin} lowStock={low} />
    </>
  )
}
