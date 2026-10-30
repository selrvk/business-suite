import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import type { Item } from "@/lib/types"
import { StockIn } from "./stock-in"

export const metadata = { title: "Stock In" }

export default async function StockInPage() {
  requireModule("inventory")
  const supabase = await getSupabase()
  const [, { data: items, error }] = await Promise.all([
    requireUser(),
    fetchAll<Item>((from, to) => supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell").order("id").range(from, to)),
  ])
  if (error) return <DbError error={error} />

  return (
    <>
      <PageHeader
        eyebrow="Inventory"
        title="Stock In"
        subtitle="Receiving a delivery? Scan each product (scan twice for 2), check the quantities, then save. Every change is logged."
      />
      <StockIn items={items} />
    </>
  )
}
