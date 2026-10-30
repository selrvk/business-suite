import Link from "next/link"
import { Printer, Receipt, ScanBarcode, Trash2 } from "lucide-react"
import { DbError } from "@/components/db-error"
import { DateRange } from "@/components/date-range"
import { ExportButton } from "@/components/export-button"
import { ConfirmButton } from "@/components/modal"
import { Empty, PageHeader, Stat } from "@/components/page-header"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { dayRange, formatDateTime, money, monthStart, readRange, toYmd } from "@/lib/format"
import { finishedInRange } from "@/lib/sales"
import type { Order, OrderLine } from "@/lib/types"
import { deleteHistory, deleteOrder, exportSales } from "./actions"

export const metadata = { title: "Sales History" }

const LIMIT = 300
const STATUSES = { all: "All", COMPLETED: "Completed", CANCELLED: "Cancelled" } as const

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; status?: string }>
}) {
  requireModule("sales")
  const params = await searchParams
  const supabase = await getSupabase()
  const today = toYmd()
  const { from, to } = readRange(params, { from: monthStart(today), to: today })
  const range = dayRange(from, to)
  const status = (params.status && params.status in STATUSES ? params.status : "all") as keyof typeof STATUSES

  const [{ isAdmin }, ordersResult, summaryResult, cancelledResult] = await Promise.all([
    requireUser(),
    supabase.from("orders").select("*").or(finishedInRange(range.from, range.to, status)).order("id", { ascending: false }).limit(LIMIT),
    supabase.rpc("sales_summary", { p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
    supabase.from("orders").select("id", { count: "exact", head: true }).or(finishedInRange(range.from, range.to, "CANCELLED")),
  ])
  if (ordersResult.error) return <DbError error={ordersResult.error} />
  if (summaryResult.error) return <DbError error={summaryResult.error} />

  const orders = ordersResult.data as Order[]
  const summary = summaryResult.data as { count: number; total: number }
  const cancelled = cancelledResult.count ?? 0

  const lines: OrderLine[] = []
  for (let i = 0; i < orders.length; i += 200) {
    const { data } = await supabase
      .from("order_item")
      .select("*, items(name, unit)")
      .in("order_id", orders.slice(i, i + 200).map(o => o.id))
    lines.push(...((data ?? []) as OrderLine[]))
  }

  const byMethod = new Map<string, number>()
  for (const o of orders) {
    if (o.status !== "COMPLETED") continue
    const key = o.payment_method ?? "Not recorded"
    byMethod.set(key, (byMethod.get(key) ?? 0) + Number(o.total_price))
  }
  const truncated = orders.length === LIMIT

  return (
    <>
      <PageHeader eyebrow="Sales" title="Sales History">
        <ExportButton load={exportSales.bind(null, from, to, status)} filename={`sales_${from}_to_${to}`} sheet="Sales" />
        {isAdmin && orders.length > 0 && (
          <ConfirmButton
            className="btn btn-danger"
            title="Delete these records?"
            message={
              <>
                This permanently deletes every completed and cancelled order from {from} to {to}. Stock levels don&apos;t
                change. Export first if you need a copy.
              </>
            }
            confirmLabel="Delete records"
            action={deleteHistory.bind(null, from, to)}
          >
            <Trash2 size={14} /> Delete range
          </ConfirmButton>
        )}
        <Link href="/pos" className="btn btn-primary">
          <ScanBarcode size={15} /> New sale
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6">
        <DateRange path="/sales" from={from} to={to} extra={{ status: status === "all" ? undefined : status }} />
        <div className="segmented self-start">
          {Object.entries(STATUSES).map(([key, label]) => (
            <Link
              key={key}
              href={`/sales?${new URLSearchParams({ from, to, ...(key === "all" ? {} : { status: key }) })}`}
              data-active={status === key}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Stat label="Revenue" value={money(summary.total)} tone="good" />
        <Stat label="Sales" value={summary.count} tone="brand" />
        <Stat label="Average sale" value={money(summary.count ? summary.total / summary.count : 0)} tone="info" />
        <Stat label="Cancelled" value={cancelled} tone={cancelled ? "bad" : undefined} />
      </div>
      {byMethod.size > 0 && (
        <p className="text-xs faint mb-6">
          {[...byMethod].map(([method, total]) => `${method} ${money(total)}`).join(" · ")}
          {truncated && " (from the newest records shown)"}
        </p>
      )}

      <div className="table-wrap">
        {orders.length === 0 ? (
          <Empty title="No sales in this period" icon={<Receipt size={30} />} />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>When</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Payment</th>
                <th>Status</th>
                <th className="num">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {orders.map(order => {
                const own = lines.filter(l => l.order_id === order.id)
                const done = order.status === "COMPLETED"
                return (
                  <tr key={order.id}>
                    <td className="display text-lg text-white">#{order.number}</td>
                    <td className="whitespace-nowrap muted">{formatDateTime(done ? order.date_completed : order.date_cancelled)}</td>
                    <td>{order.customer_name || <span className="faint">—</span>}</td>
                    <td className="muted max-w-xs">
                      <span className="line-clamp-2">
                        {own.map(l => `${l.item_name ?? l.items?.name ?? "?"} ×${l.quantity}`).join(", ") || "—"}
                      </span>
                    </td>
                    <td className="muted">{order.payment_method ?? "—"}</td>
                    <td>
                      <span className="pill" data-tone={done ? "good" : "bad"}>
                        {done ? "Completed" : "Cancelled"}
                      </span>
                    </td>
                    <td className={`num font-semibold ${done ? "text-white" : "faint line-through"}`}>{money(order.total_price)}</td>
                    <td className="whitespace-nowrap text-right">
                      <a className="btn btn-ghost btn-icon" href={`/print/receipt/${order.id}`} target="_blank" rel="noreferrer" title="Receipt">
                        <Printer size={14} />
                      </a>
                      {isAdmin && (
                        <ConfirmButton
                          className="btn btn-ghost btn-icon"
                          title={`Delete order #${order.number}?`}
                          message="This removes the record permanently. Stock levels don't change."
                          confirmLabel="Delete"
                          action={deleteOrder.bind(null, order.id)}
                        >
                          <Trash2 size={14} />
                        </ConfirmButton>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      {truncated && <p className="text-xs faint mt-3">Showing the newest {LIMIT}. Narrow the dates or export to see everything.</p>}
    </>
  )
}
