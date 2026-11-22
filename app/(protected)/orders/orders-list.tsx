import { CheckCheck } from "lucide-react"
import { Empty } from "@/components/page-header"
import { formatShortDateTime, money } from "@/lib/format"
import type { Order, OrderLine } from "@/lib/types"
import { OrderActions } from "./order-actions"

/** Orders saved for later, oldest first, each with how long it's been waiting. */
export function OrdersList({ pending, lines: allLines, now, canCancel }: { pending: Order[]; lines: OrderLine[]; now: number; canCancel: boolean }) {
  const pendingValue = pending.reduce((s, o) => s + Number(o.total_price), 0)
  /** How long an order has been waiting; amber once it's a day old. */
  const waiting = (created: string) => {
    const minutes = Math.max(0, Math.floor((now - new Date(created).getTime()) / 60000))
    const text =
      minutes < 1
        ? "just now"
        : minutes < 60
          ? `${minutes} min ago`
          : minutes < 24 * 60
            ? `${Math.floor(minutes / 60)} h ago`
            : `${Math.floor(minutes / (24 * 60))} day${minutes < 48 * 60 ? "" : "s"} ago`
    return { text, old: minutes >= 24 * 60 }
  }

  return (
    <>
      {pending.length === 0 ? (
        <div className="card">
          <Empty title="All clear" icon={<CheckCheck size={32} className="text-good" />}>
            No pending orders right now.
          </Empty>
        </div>
      ) : (
        <>
          <p className="text-sm muted mb-4">
            <span className="text-white font-semibold">
              {pending.length} waiting
            </span>{" "}
            · {money(pendingValue)} in total, oldest first
          </p>
          <div className="flex flex-col gap-3">
            {pending.map((order, i) => {
              const own = allLines.filter(l => l.order_id === order.id)
              return (
                <article key={order.id} className="card rise overflow-hidden" style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
                    <div>
                      <p className="stat-label">Order</p>
                      <p className="display text-2xl sm:text-3xl text-white">#{order.number}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{order.customer_name || "No name"}</p>
                      <p className="text-xs faint">
                        <span className="hidden sm:inline">Saved {formatShortDateTime(order.date_created)} · </span>
                        <span className={waiting(order.date_created).old ? "text-warn font-semibold" : ""}>{waiting(order.date_created).text}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="stat-label">Total</p>
                      <p className="display text-2xl text-white">{money(order.total_price)}</p>
                    </div>
                    <OrderActions orderId={order.id} number={order.number} canCancel={canCancel} />
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
