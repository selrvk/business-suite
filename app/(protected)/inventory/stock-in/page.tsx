import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import type { Item } from "@/lib/types"
import { getWorkplace, levelsAt, withStockAt } from "@/lib/locations"
import { StockIn } from "./stock-in"

export const metadata = { title: "Stock In" }

export default async function StockInPage() {
  await requireModule("inventory")
  const supabase = await getSupabase()
  const session = await requireUser()
  const workplace = await getWorkplace(session)
  const { here, multi } = workplace
  const [{ data: allItems, error }, supplierRows, stock] = await Promise.all([
    fetchAll<Item>((from, to) => supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell").order("id").range(from, to)),
    supabase.from("suppliers").select("id, name").order("name"),
    multi ? levelsAt(supabase, here.id) : null,
  ])
  const failed = error ?? stock?.error
  if (failed) return <DbError error={failed} />
  // With several locations, the delivery comes in here, so show what's here.
  const items = stock ? withStockAt(allItems, stock.levels) : allItems

  return (
    <>
      <PageHeader
        title="Stock In"
        subtitle={`Receiving a delivery${multi ? ` at ${here.name}` : ""}? Scan each product (scan twice for 2), check the quantities, then save. Every change is logged.`}
      />
      <StockIn items={items} suppliers={supplierRows.data ?? []} place={multi ? { id: here.id, name: here.name } : null} />
    </>
  )
}
