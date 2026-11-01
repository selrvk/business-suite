import Link from "next/link"
import { CheckCheck, ScanBarcode } from "lucide-react"
import { DbError } from "@/components/db-error"
import { Empty, PageHeader } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { formatShortDateTime, money } from "@/lib/format"
import type { Order, OrderLine } from "@/lib/types"
import { OrderActions } from "./order-actions"

export const metadata = { title: "Pending Orders" }

export default async function OrdersPage() {
  await requireModule("sales")
  const supabase = await getSupabase()
  const [session, { data: orders, error }] = await Promise.all([
    requireUser(),
    supabase.from("orders").select("*").eq("status", "PENDING").order("date_created", { ascending: true }).limit(500),
  ])
  if (error) return <DbError error={error} />

  const { data: lines, error: linesError } = orders.length
    ? await supabase.from("order_item").select("*, items(name, unit)").in("order_id", orders.map(o => o.id))
    : { data: [], error: null }
  if (linesError) return <DbError error={linesError} />

  const pending = orders as Order[]
  const allLines = (lines ?? []) as OrderLine[]
  const pendingValue = pending.reduce((s, o) => s + Number(o.total_price), 0)

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title={
          <span className="flex items-baseline gap-3">
            Pending Orders
            {pending.length > 0 && (
              <span className="pill text-base" data-tone="warn">
                {pending.length}
              </span>
            )}
          </span>
        }
        subtitle="Orders saved for later (phone orders, deliveries, reservations). Confirming one takes its items out of stock."
      >
        <Link href="/pos" className="btn btn-primary">
          <ScanBarcode size={15} /> New sale
        </Link>
      </PageHeader>

      {pending.length === 0 ? (
        <div className="card">
          <Empty title="All clear" icon={<CheckCheck size={32} className="text-good" />}>
            No pending orders right now.
          </Empty>
        </div>
      ) : (
        <>
          <p className="text-xs faint mb-3">Worth {money(pendingValue)} in total, oldest first.</p>
          <div className="flex flex-col gap-3">
            {pending.map((order, i) => {
              const own = allLines.filter(l => l.order_id === order.id)
              return (
                <article
                  key={order.id}
                  className="card rise overflow-hidden"
                  style={{ animationDelay: `${Math.min(i, 10) * 0.04}s`, borderLeft: "3px solid var(--app-warning)" }}
                >
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                    <div>
                      <p className="stat-label">Order</p>
                      <p className="display text-3xl text-white">#{order.number}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{order.customer_name || "No name"}</p>
                      <p className="text-xs faint">Saved {formatShortDateTime(order.date_created)}</p>
                    </div>
                    <div className="text-right">
                      <p className="stat-label">Total</p>
                      <p className="display text-2xl text-white">{money(order.total_price)}</p>
                    </div>
                    <OrderActions orderId={order.id} number={order.number} canCancel={session.can("cancel_sales")} />
                  </div>
                  {own.length > 0 && (
                    <div className="px-5 py-3 text-sm border-t" style={{ borderColor: "var(--app-border)", background: "rgba(0,0,0,0.15)" }}>
                      {own.map(l => (
                        <div key={l.id} className="flex justify-between gap-4 py-1">
                          <span className="muted">{l.item_name ?? l.items?.name ?? "(deleted product)"}</span>
                          <span className="faint whitespace-nowrap">
                            {l.quantity} {l.items?.unit} × {money(l.price_at_time)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </>
      )}
    </>
  )
}
