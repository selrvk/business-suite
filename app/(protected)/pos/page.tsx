import { DbError } from "@/components/db-error"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import type { Item } from "@/lib/types"
import { PointOfSale, type PosCustomer } from "./point-of-sale"

export const metadata = { title: "Point of Sale" }

export default async function PosPage() {
  await requireModule("sales")
  const supabase = await getSupabase()
  const [{ business }, { data: items, error }, customers] = await Promise.all([
    requireUser(),
    fetchAll<Item>((from, to) => supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell, senior_discount").order("name").order("id").range(from, to)),
    fetchAll<PosCustomer>((from, to) => supabase.from("customers").select("id, name, balance, credit_limit").order("name").order("id").range(from, to)),
  ])
  if (error ?? customers.error) return <DbError error={(error ?? customers.error)!} />

  return <PointOfSale items={items} lowStock={business.low_stock_threshold} customers={customers.data} />
}
