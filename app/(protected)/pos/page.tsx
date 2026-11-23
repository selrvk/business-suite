import Link from "next/link"
import { Warehouse } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { fetchAll } from "@/lib/db"
import { getWorkplace } from "@/lib/locations"
import type { Item } from "@/lib/types"
import { PointOfSale, type PosCustomer } from "./point-of-sale"

export const metadata = { title: "Point of Sale" }

export default async function PosPage() {
  await requireModule("sales")
  const supabase = await getSupabase()
  const session = await requireUser()
  const workplace = await getWorkplace(session)
  const { here } = workplace

  if (workplace.multi && here.kind === "warehouse") {
    const branch = workplace.open.find(l => l.kind === "branch")
    return (
      <>
        <PageHeader title="Point of Sale" />
        <div className="card card-body flex flex-col items-start gap-3 max-w-xl">
          <Warehouse size={22} className="text-brand" aria-hidden />
          <p className="text-white font-semibold">{here.name} is a warehouse, so it doesn&apos;t sell</p>
          <p className="text-sm muted">
            {workplace.canSwitch
              ? `Switch to a branch${branch ? `, like ${branch.name},` : ""} with "Working at" in the menu to sell. To send stock to a branch, use Transfers.`
              : "Ask an owner or admin to set you up at a branch to sell. To send stock to a branch, use Transfers."}
          </p>
          <Link href="/inventory/transfers" className="btn btn-secondary">
            Go to Transfers
          </Link>
        </div>
      </>
    )
  }

  const [{ data: allItems, error }, customers, levels] = await Promise.all([
    fetchAll<Item>((from, to) =>
      supabase.from("items").select("id, barcode, name, brand, unit, current_stock, price_buy, price_sell, senior_discount").order("name").order("id").range(from, to),
    ),
    fetchAll<PosCustomer>((from, to) => supabase.from("customers").select("id, name, balance, credit_limit").order("name").order("id").range(from, to)),
    workplace.multi
      ? fetchAll<{ item_id: number; quantity: number }>((from, to) =>
          supabase.from("stock_levels").select("item_id, quantity").eq("location_id", here.id).order("item_id").range(from, to),
        )
      : Promise.resolve({ data: [] as { item_id: number; quantity: number }[], error: null }),
  ])
  const failed = error ?? customers.error ?? levels.error
  if (failed) return <DbError error={failed} />

  // With several locations, the POS sells from this branch's stock.
  const atHere = new Map(levels.data.map(l => [l.item_id, l.quantity]))
  const items = workplace.multi ? allItems.map(i => ({ ...i, current_stock: atHere.get(i.id) ?? 0 })) : allItems

  return (
    <PointOfSale
      items={items}
      lowStock={session.business.low_stock_threshold}
      customers={customers.data}
      place={workplace.multi ? { id: here.id, name: here.name } : null}
    />
  )
}
