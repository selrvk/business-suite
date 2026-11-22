"use client"

import { useMemo, useState } from "react"
import { X } from "lucide-react"
import { ExportButton } from "@/components/export-button"
import { PageHeader } from "@/components/page-header"
import { ACTIVITY_LABELS } from "@/lib/activity-labels"
import { addDays, formatDateTime, formatTime, formatWeekday, money, num, toYmd } from "@/lib/format"

export type ActivityRow = {
  id: number
  username: string | null
  action: string
  target: string | null
  details: Record<string, unknown>
  created_at: string
}

const MONEY_KEYS = new Set(["amount", "total", "from", "to", "expected", "counted", "difference", "balance"])
/** Actions whose numbers are counts of stock, not pesos. */
const COUNT_ACTIONS = new Set(["stock_corrected", "batch_removed"])

/** Short, readable details: "₱60.00 → ₱65.00", "reason: Customer returned it". */
function describe(row: ActivityRow) {
  const d = row.details ?? {}
  const KINDS: Record<string, string> = { senior: "Senior Citizen", pwd: "PWD", amount: "peso discount", percent: "percent discount" }
  const fmt = (k: string, v: unknown) =>
    typeof v === "number" && MONEY_KEYS.has(k) && !COUNT_ACTIONS.has(row.action)
      ? money(v)
      : k === "kind" && typeof v === "string"
        ? (KINDS[v] ?? v)
        : String(v)
  if ("from" in d && "to" in d) return `${d.field ? `${d.field}: ` : ""}${fmt("from", d.from)} → ${fmt("to", d.to)}`
  if (Array.isArray(d.changes)) return (d.changes as string[]).join(" · ")
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : fmt(k, v)}`)
    .join(" · ")
}

/** Changes that can't be undone stand out in red. */
const IRREVERSIBLE = new Set(["product_deleted", "sale_deleted", "history_deleted", "customer_deleted", "staff_removed"])

export function ActivityList({ rows, today }: { rows: ActivityRow[]; today: string }) {
  const [person, setPerson] = useState("")
  const [action, setAction] = useState("")
  const people = useMemo(() => [...new Set(rows.map(r => r.username ?? "?"))].sort(), [rows])
  const actions = useMemo(() => [...new Set(rows.map(r => r.action))].sort((a, b) => (ACTIVITY_LABELS[a] ?? a).localeCompare(ACTIVITY_LABELS[b] ?? b)), [rows])
  const shown = rows.filter(r => (!person || (r.username ?? "?") === person) && (!action || r.action === action))
  const filtering = person !== "" || action !== ""

  // Entries grouped by day, newest first (they come sorted newest first).
  const days: { day: string; at: string; rows: ActivityRow[] }[] = []
  for (const r of shown) {
    const day = toYmd(r.created_at)
    let g = days[days.length - 1]
    if (!g || g.day !== day) days.push((g = { day, at: r.created_at, rows: [] }))
    g.rows.push(r)
  }
  const dayLabel = (g: (typeof days)[number]) => {
    const special = g.day === today ? "Today" : g.day === addDays(today, -1) ? "Yesterday" : null
    return special ? `${special} · ${formatWeekday(g.at)}` : formatWeekday(g.at)
  }
  const what = (r: ActivityRow) => (
    <span className={IRREVERSIBLE.has(r.action) ? "text-bad" : "text-white"}>{ACTIVITY_LABELS[r.action] ?? r.action}</span>
  )

  return (
    <>
      <PageHeader
        title="Activity Log"
        subtitle="Who changed prices, gave discounts, voided sales, corrected stock and more. Only owners and admins see this, and nobody can edit it."
      >
        {rows.length > 0 && (
          <ExportButton
            rows={shown.map(r => ({ When: formatDateTime(r.created_at), Who: r.username ?? "", What: ACTIVITY_LABELS[r.action] ?? r.action, About: r.target ?? "", Details: describe(r) }))}
            filename="activity_log"
            sheet="Activity"
          />
        )}
      </PageHeader>

      {rows.length === 0 ? (
        <p className="card card-body text-sm muted">Nothing yet. Price changes, discounts, voids and other changes will show up here.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
            <select className="input sm:w-auto" aria-label="Who" value={person} onChange={e => setPerson(e.target.value)}>
              <option value="">Everyone</option>
              {people.map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
            <select className="input sm:w-auto" aria-label="What" value={action} onChange={e => setAction(e.target.value)}>
              <option value="">Everything</option>
              {actions.map(a => (
                <option key={a} value={a}>
                  {ACTIVITY_LABELS[a] ?? a}
                </option>
              ))}
            </select>
            {filtering && (
              <p className="flex items-center gap-3 text-xs muted sm:ml-2">
                <span>
                  {num(shown.length)} of {num(rows.length)}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 underline decoration-dotted hover:text-white"
                  onClick={() => {
                    setPerson("")
                    setAction("")
                  }}
                >
                  <X size={12} aria-hidden /> Clear filters
                </button>
              </p>
            )}
          </div>

          {shown.length === 0 ? (
            <div className="table-wrap">
              <p className="empty">Nothing matches.</p>
            </div>
          ) : (
            <>
              {/* Table on wide screens, one section per day */}
              <div className="table-wrap hidden lg:block">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Who</th>
                      <th>What</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  {days.map(g => (
                    <tbody key={g.day}>
                      <tr className="day-row">
                        <th colSpan={4} scope="rowgroup">
                          {dayLabel(g)}
                          <span className="faint font-normal">
                            {" "}
                            · {g.rows.length} {g.rows.length === 1 ? "change" : "changes"}
                          </span>
                        </th>
                      </tr>
                      {g.rows.map(r => (
                        <tr key={r.id}>
                          <td className="muted whitespace-nowrap tabular">{formatTime(r.created_at)}</td>
                          <td className="text-white">{r.username ?? "—"}</td>
                          <td>
                            <p>{what(r)}</p>
                            {r.target && <p className="text-[0.72rem] faint">{r.target}</p>}
                          </td>
                          <td className="muted text-xs max-w-md">{describe(r)}</td>
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
                        <li key={r.id} className="px-4 py-3">
                          <p className="text-sm">
                            <span className="muted">{r.username ?? "Someone"}</span> {what(r)}
                            <span className="faint text-xs"> · {formatTime(r.created_at)}</span>
                          </p>
                          {(r.target || describe(r)) && (
                            <p className="text-xs faint mt-0.5 break-words">{[r.target, describe(r)].filter(Boolean).join(" · ")}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}
          {rows.length >= 1000 && <p className="text-xs faint">Showing the latest 1,000 entries.</p>}
        </div>
      )}
    </>
  )
}
