import Link from "next/link"
import { Empty } from "@/components/page-header"
import { addDays, formatTime, formatWeekday, num, toYmd } from "@/lib/format"
import type { StockReason } from "@/lib/types"

export const REASONS: Record<StockReason, { label: string }> = {
  initial: { label: "Opening" },
  receive: { label: "Received" },
  sale: { label: "Sale" },
  adjust: { label: "Correction" },
  return: { label: "Return" },
  out: { label: "Stock out" },
  transfer: { label: "Transfer" },
}

export type Movement = {
  id: number
  change: number
  reason: StockReason
  note: string | null
  order_id: number | null
  created_by: string | null
  created_at: string
  location_id?: number | null
  items: { name: string; unit: string } | null
  orders: { number: number } | null
}


/** The Stock Log's changes, one section per day. */
export function MovementsList({
  rows,
  names,
  today,
  places = null,
}: {
  rows: Movement[]
  names: Record<string, string>
  today: string
  /** Location names by id, when showing several locations' changes. */
  places?: Record<number, string> | null
}) {
  const by = (r: Movement) => (r.created_by && names[r.created_by]) || null
  const where = (r: Movement) => (places && r.location_id ? places[r.location_id] : null)

  // Changes grouped by day, newest first (they come sorted newest first).
  const days: { day: string; at: string; rows: Movement[] }[] = []
  for (const r of rows) {
    const day = toYmd(r.created_at)
    let g = days[days.length - 1]
    if (!g || g.day !== day) days.push((g = { day, at: r.created_at, rows: [] }))
    g.rows.push(r)
  }
  const dayLabel = (g: (typeof days)[number]) => {
    const special = g.day === today ? "Today" : g.day === addDays(today, -1) ? "Yesterday" : null
    return special ? `${special} · ${formatWeekday(g.at)}` : formatWeekday(g.at)
  }
  const change = (r: Movement) => (
    <span className={`font-semibold tabular whitespace-nowrap ${r.change > 0 ? "text-good" : "text-bad"}`}>
      {r.change > 0 ? "+" : "−"}
      {num(Math.abs(r.change))} <span className="faint text-xs font-normal">{r.items?.unit}</span>
    </span>
  )
  const about = (r: Movement) =>
    r.order_id ? (
      <Link className="underline decoration-dotted" href={`/print/receipt/${r.order_id}`} target="_blank">
        Order #{r.orders?.number ?? r.order_id}
      </Link>
    ) : (
      r.note
    )

  return (
    <>
      {rows.length === 0 ? (
        <div className="table-wrap">
          <Empty title="No stock changes">Nothing matches these filters.</Empty>
        </div>
      ) : (
        <>
          {/* Table on wide screens, one section per day */}
          <div className="table-wrap hidden lg:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Product</th>
                  <th className="num">Change</th>
                  <th>Type</th>
                  <th>Note</th>
                  <th>By</th>
                </tr>
              </thead>
              {days.map(g => (
                <tbody key={g.day}>
                  <tr className="day-row">
                    <th colSpan={6} scope="rowgroup">
                      {dayLabel(g)}
                      <span className="faint font-normal">
                        {" "}
                        · {g.rows.length} {g.rows.length === 1 ? "change" : "changes"}
                      </span>
                    </th>
                  </tr>
                  {g.rows.map(r => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap muted tabular">{formatTime(r.created_at)}</td>
                      <td className="text-white">
                        {r.items?.name ?? <span className="faint">(deleted product)</span>}
                        {where(r) && <span className="block text-[0.72rem] faint">at {where(r)}</span>}
                      </td>
                      <td className="num">{change(r)}</td>
                      <td className="muted">{REASONS[r.reason]?.label ?? r.reason}</td>
                      <td className="muted">{about(r) ?? <span className="faint">—</span>}</td>
                      <td className="muted">{by(r) ?? <span className="faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>

          {/* List on phones and tablets */}
          <div className="lg:hidden flex flex-col gap-4">
            {days.map(g => (
              <section key={g.day} className="card overflow-hidden" aria-label={dayLabel(g)}>
                <header className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
                  <h2 className="text-sm font-semibold text-white">{dayLabel(g)}</h2>
                  <span className="text-xs muted">{g.rows.length}</span>
                </header>
                <ul className="divide-y divide-white/5">
                  {g.rows.map(r => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-white truncate">{r.items?.name ?? "(deleted product)"}</p>
                        <p className="text-xs faint truncate">
                          {formatTime(r.created_at)} · {REASONS[r.reason]?.label ?? r.reason}
                          {where(r) && ` at ${where(r)}`}
                          {by(r) && ` · ${by(r)}`}
                          {about(r) && <> · {about(r)}</>}
                        </p>
                      </div>
                      <span className="text-sm">{change(r)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  )
}
