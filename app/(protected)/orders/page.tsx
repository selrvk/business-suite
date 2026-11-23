import Link from "next/link"
import { ScanBarcode } from "lucide-react"
import { DbError } from "@/components/db-error"
import { PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import type { Order, OrderLine } from "@/lib/types"
import { getWorkplace } from "@/lib/locations"
import { OrdersList } from "./orders-list"

export const metadata = { title: "Pending Orders" }

export default async function OrdersPage() {
  await requireModule("sales")
  const supabase = await getSupabase()
  const session = await requireUser()
  const workplace = await getWorkplace(session)
  // With several locations, each branch confirms its own orders.
  const query = supabase.from("orders").select("*").eq("status", "PENDING")
  const { data: orders, error } = await (workplace.multi ? query.eq("location_id", workplace.here.id) : query)
    .order("date_created", { ascending: true })
    .limit(500)
  if (error) return <DbError error={error} />

  const { data: lines, error: linesError } = orders.length
    ? await supabase.from("order_item").select("*, items(name, unit)").in("order_id", orders.map(o => o.id))
    : { data: [], error: null }
  if (linesError) return <DbError error={linesError} />

  const pending = orders as Order[]
  const allLines = (lines ?? []) as OrderLine[]
  return (
    <>
      <PageHeader
        title="Pending Orders"
        subtitle={`Orders saved for later (phone orders, deliveries, reservations)${workplace.multi ? ` at ${workplace.here.name}` : ""}. Confirming one takes its items out of stock.`}
      >
        <Link href="/pos" className="btn btn-primary">
          <ScanBarcode size={15} /> New sale
        </Link>
      </PageHeader>

      <OrdersList pending={pending} lines={allLines} now={new Date().getTime()} canCancel={session.can("cancel_sales")} />
    </>
  )
}
