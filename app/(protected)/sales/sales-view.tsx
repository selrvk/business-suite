import Link from "next/link"
import { Receipt, ScanBarcode } from "lucide-react"
import { DateRange } from "@/components/date-range"
import { Empty, PageHeader } from "@/components/page-header"
import { addDays, formatDate, formatTime, formatWeekday, money, num, toYmd } from "@/lib/format"
import type { Order } from "@/lib/types"
import { SaleActions, SalesMenu } from "./sale-menus"

export type SalesStatus = "all" | "COMPLETED" | "CANCELLED"

export type SalesData = {
  from: string
  to: string
  status: SalesStatus
  today: string
  isAdmin: boolean
  canVoid: boolean
  orders: Order[]
  /** Each order's items in words ("Coke 1.5L ×2, Bread ×1"), by order id. */
  itemsByOrder: Record<number, string>
  /** Completed sales in the whole date range. */
  summary: { count: number; total: number }
  cancelled: number
  /** Money in by payment method, from the orders shown. */
  byMethod: [string, number][]
  /** More orders exist than were loaded. */
  truncated: boolean
  limit: number
}

const STATUS_LABELS: Record<SalesStatus, string> = {
  all: "All",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
}

/** The Sales History layout. The page (page.tsx) loads the data. */
export function SalesView({ data }: { data: SalesData }) {
  const { from, to, status, today, isAdmin, canVoid, orders, itemsByOrder, summary, cancelled, byMethod, truncated, limit } = data
  const counts: Record<SalesStatus, number> = {
    all: summary.count + cancelled,
    COMPLETED: summary.count,
    CANCELLED: cancelled,
  }
  const methodTotal = byMethod.reduce((s, [, v]) => s + v, 0)
  const rangeLabel = from === to ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`

  // Sales grouped by the day they were finished (completed or cancelled), newest first.
  const when = (o: Order) => (o.status === "COMPLETED" ? o.date_completed : o.date_cancelled) ?? o.date_created
  const sorted = [...orders].sort((a, b) => new Date(when(b)).getTime() - new Date(when(a)).getTime())
  const groups: {
    day: string
    at: string
    orders: Order[]
    count: number
    total: number
  }[] = []
  for (const o of sorted) {
    const day = toYmd(when(o))
    let g = groups[groups.length - 1]
    if (!g || g.day !== day) groups.push((g = { day, at: when(o), orders: [], count: 0, total: 0 }))
    g.orders.push(o)
    if (o.status === "COMPLETED") {
      g.count++
      g.total += Number(o.total_price)
    }
  }
  const dayLabel = (g: (typeof groups)[number]) => {
    const special = g.day === today ? "Today" : g.day === addDays(today, -1) ? "Yesterday" : null
    return special ? `${special} · ${formatWeekday(g.at)}` : formatWeekday(g.at)
  }
  const statusHref = (key: SalesStatus) => `/sales?${new URLSearchParams({ from, to, ...(key === "all" ? {} : { status: key }) })}`

  return (
    <>
      <PageHeader title="Sales History">
        <SalesMenu from={from} to={to} status={status} rangeLabel={rangeLabel} canDelete={isAdmin && orders.length > 0} />
        <Link href="/pos" className="btn btn-primary">
          <ScanBarcode size={15} aria-hidden /> New sale
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6 2xl:flex-row 2xl:flex-wrap 2xl:items-end 2xl:justify-between">
        <DateRange path="/sales" from={from} to={to} extra={{ status: status === "all" ? undefined : status }} />
        <div className="segmented self-start" role="group" aria-label="Status">
          {(Object.keys(STATUS_LABELS) as SalesStatus[]).map(key => (
            <Link key={key} href={statusHref(key)} data-active={status === key} aria-current={status === key ? "page" : undefined}>
              {STATUS_LABELS[key]}
              <span className="seg-count" data-tone={key === "CANCELLED" && counts[key] > 0 ? "bad" : undefined}>
                {num(counts[key])}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {counts.all > 0 && (
        <section className="card summary rise mb-6" data-lead="" aria-labelledby="sales-revenue">
          <div className="grid gap-x-10 lg:grid-cols-2 lg:items-start">
            <div className="min-w-0">
              <h2 id="sales-revenue" className="stat-label">
                Revenue
              </h2>
              <p className="summary-value">{money(summary.total)}</p>
              <p className="stat-hint">
                {num(summary.count)} {summary.count === 1 ? "sale" : "sales"} · {money(summary.count ? summary.total / summary.count : 0)}{" "}
                average
              </p>
            </div>
            {byMethod.length > 0 && (
              <div className="min-w-0">
                <ul className="summary-rows lg:mt-0 lg:border-t-0" aria-label="By payment method">
                  {byMethod.map(([method, amount]) => (
                    <li key={method}>
                      <div className="summary-row">
                        <span>{method}</span>
                        <span className="faint text-xs tabular">{methodTotal ? Math.round((amount / methodTotal) * 100) : 0}%</span>
                        <span className="summary-num">{money(amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
                {truncated && <p className="stat-hint mt-2">From the newest {num(limit)} sales shown.</p>}
              </div>
            )}
          </div>
        </section>
      )}

      {orders.length === 0 ? (
        <div className="table-wrap">
          <Empty
            title={status === "CANCELLED" ? "No cancelled sales in this period" : "No sales in this period"}
            icon={<Receipt size={30} />}
          >
            Sales made at the{" "}
            <Link href="/pos" className="underline">
              Point of Sale
            </Link>{" "}
            show up here.
          </Empty>
        </div>
      ) : (
        <>
          {/* Table on wide screens, one section per day */}
          <div className="table-wrap hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th className="hidden xl:table-cell">Sale</th>
                  <th>Customer</th>
                  <th>Items</th>
                  <th>Payment</th>
                  <th className="num">Total</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              {groups.map(g => (
                <tbody key={g.day}>
                  <tr className="day-row">
                    <th colSpan={7} scope="rowgroup">
                      <span className="flex items-center justify-between gap-4">
                        <span>
                          {dayLabel(g)}
                          <span className="faint font-normal">
                            {" "}
                            · {num(g.count)} {g.count === 1 ? "sale" : "sales"}
                          </span>
                        </span>
                        <span className="tabular">{money(g.total)}</span>
                      </span>
                    </th>
                  </tr>
                  {g.orders.map(order => {
                    const done = order.status === "COMPLETED"
                    return (
                      <tr key={order.id}>
                        <td className="whitespace-nowrap muted tabular">
                          {formatTime(when(order))}
                          <span className="block xl:hidden text-[0.72rem] faint">#{order.number}</span>
                        </td>
                        <td className="hidden xl:table-cell whitespace-nowrap faint tabular">#{order.number}</td>
                        <td className="max-w-40 truncate">{order.customer_name || <span className="faint">Walk-in</span>}</td>
                        <td className="muted max-w-xs">
                          <span className="line-clamp-2">{itemsByOrder[order.id] || "—"}</span>
                          {order.void_reason && <span className="block text-[0.72rem] faint mt-0.5">Voided: {order.void_reason}</span>}
                        </td>
                        <td className="muted whitespace-nowrap">
                          {order.payment_method ?? "—"}
                          {order.payment_ref && <span className="block text-[0.72rem] faint">ref {order.payment_ref}</span>}
                        </td>
                        <td className="num">
                          <SaleTotal order={order} />
                        </td>
                        <td className="w-20">
                          <SaleActions
                            orderId={order.id}
                            number={order.number}
                            total={Number(order.total_price)}
                            canVoid={done && canVoid}
                            canDelete={isAdmin}
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              ))}
            </table>
          </div>

          {/* List on phones and tablets */}
          <div className="lg:hidden flex flex-col gap-4">
            {groups.map(g => (
              <section key={g.day} className="card overflow-hidden" aria-label={dayLabel(g)}>
                <header
                  className="flex items-center justify-between gap-3 px-4 py-2.5 border-b"
                  style={{
                    borderColor: "var(--app-border)",
                    background: "var(--app-surface-2)",
                  }}
                >
                  <h2 className="text-sm font-semibold text-white">{dayLabel(g)}</h2>
                  <span className="text-xs muted whitespace-nowrap">
                    {num(g.count)} · <span className="text-white font-semibold tabular">{money(g.total)}</span>
                  </span>
                </header>
                <ul className="divide-y divide-white/5">
                  {g.orders.map(order => {
                    const done = order.status === "COMPLETED"
                    return (
                      <li key={order.id} className="flex items-start gap-3 pl-4 pr-1 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-white truncate">{order.customer_name || "Walk-in"}</p>
                          <p className="text-xs faint truncate">
                            <span className="muted tabular">{formatTime(when(order))}</span> · #{order.number} ·{" "}
                            {itemsByOrder[order.id] || "—"}
                          </p>
                          {order.void_reason && <p className="text-xs faint truncate">Voided: {order.void_reason}</p>}
                        </div>
                        <div className="text-right">
                          <SaleTotal order={order} />
                          <span className="block text-xs muted">{order.payment_method ?? ""}</span>
                        </div>
                        <SaleActions
                          orderId={order.id}
                          number={order.number}
                          total={Number(order.total_price)}
                          canVoid={done && canVoid}
                          canDelete={isAdmin}
                          compact
                        />
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
      {truncated && <p className="text-xs faint mt-3">Showing the newest {num(limit)}. Narrow the dates or export to see everything.</p>}
    </>
  )
}

/** A sale's total: struck through when cancelled, with any discount or credit under it. */
function SaleTotal({ order }: { order: Order }) {
  const done = order.status === "COMPLETED"
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      {!done && (
        <span className="pill" data-tone="bad">
          {order.void_reason ? "Voided" : "Cancelled"}
        </span>
      )}
      <span className={`font-semibold tabular whitespace-nowrap ${done ? "text-white" : "faint line-through"}`}>
        {money(order.total_price)}
      </span>
      {Number(order.discount_total ?? 0) > 0 && (
        <span className="text-[0.72rem] muted whitespace-nowrap">
          {order.discount_kind === "senior" ? "Senior" : order.discount_kind === "pwd" ? "PWD" : "Discount"} −{money(order.discount_total!)}
        </span>
      )}
      {Number(order.on_credit ?? 0) > 0 && (
        <span className="text-[0.72rem] text-warn whitespace-nowrap">{money(order.on_credit!)} on credit</span>
      )}
    </span>
  )
}
