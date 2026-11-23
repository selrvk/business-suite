import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireAdminPage, requireModule } from "@/lib/auth"
import { fetchAll } from "@/lib/db"
import { getSupabase } from "@/lib/supabase/server"
import type { Item } from "@/lib/types"
import { getWorkplace, levelsAt, withStockAt } from "@/lib/locations"
import { ProductImport } from "./product-import"

export const metadata = { title: "Import products" }

export default async function ImportProductsPage() {
  await requireModule("inventory")
  const supabase = await getSupabase()
  const session = await requireAdminPage()
  const workplace = await getWorkplace(session)
  const [{ data: allItems, error }, supplierRows, stock] = await Promise.all([
    fetchAll<Item>((from, to) =>
      supabase
        .from("items")
        .select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell, supplier_id, category, location, reorder_level, senior_discount, extra")
        .order("id")
        .range(from, to),
    ),
    supabase.from("suppliers").select("id, name"),
    workplace.multi ? levelsAt(supabase, workplace.here.id) : null,
  ])
  const failed = error ?? supplierRows.error ?? stock?.error
  if (failed) return <DbError error={failed} />
  // With several locations, the file's stock is compared with (and goes to) where you're working.
  const items = stock ? withStockAt(allItems, stock.levels) : allItems
  const suppliers: Record<number, string> = Object.fromEntries((supplierRows.data ?? []).map(r => [r.id, r.name]))

  return (
    <>
      <PageHeader
        title="Import products"
        subtitle="Add or update many products at once from an Excel or CSV file. You'll see exactly what will change before anything is saved."
      >
        <Link href="/inventory" className="btn btn-ghost">
          <ArrowLeft size={14} /> Products
        </Link>
      </PageHeader>
      <ProductImport items={items} suppliers={suppliers} place={workplace.multi ? { id: workplace.here.id, name: workplace.here.name } : null} />
    </>
  )
}
