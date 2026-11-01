"use client"

import { useMemo, useState } from "react"
import { ExportButton } from "@/components/export-button"
import { ACTIVITY_LABELS } from "@/lib/activity-labels"
import { formatDateTime, money } from "@/lib/format"

export type ActivityRow = {
  id: number
  username: string | null
  action: string
  target: string | null
  details: Record<string, unknown>
  created_at: string
}

const MONEY_KEYS = new Set(["amount", "total", "from", "to", "expected", "counted", "difference", "balance"])

/** Short, readable details: "₱60.00 → ₱65.00", "reason: Customer returned it". */
function describe(row: ActivityRow) {
  const d = row.details ?? {}
  const KINDS: Record<string, string> = { senior: "Senior Citizen", pwd: "PWD", amount: "peso discount", percent: "percent discount" }
  const fmt = (k: string, v: unknown) =>
    typeof v === "number" && MONEY_KEYS.has(k) ? money(v) : k === "kind" && typeof v === "string" ? (KINDS[v] ?? v) : String(v)
  if ("from" in d && "to" in d) return `${d.field ? `${d.field}: ` : ""}${fmt("from", d.from)} → ${fmt("to", d.to)}`
  if (Array.isArray(d.changes)) return (d.changes as string[]).join(" · ")
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${Array.isArray(v) ? v.join(", ") : fmt(k, v)}`)
    .join(" · ")
}

export function ActivityList({ rows }: { rows: ActivityRow[] }) {
  const [person, setPerson] = useState("")
  const [action, setAction] = useState("")
  const people = useMemo(() => [...new Set(rows.map(r => r.username ?? "?"))].sort(), [rows])
  const actions = useMemo(() => [...new Set(rows.map(r => r.action))].sort((a, b) => (ACTIVITY_LABELS[a] ?? a).localeCompare(ACTIVITY_LABELS[b] ?? b)), [rows])
  const shown = rows.filter(r => (!person || (r.username ?? "?") === person) && (!action || r.action === action))

  if (!rows.length) {
    return <p className="card card-body text-sm muted">Nothing yet. Price changes, discounts, voids and other changes will show up here.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <select className="input sm:w-auto" value={person} onChange={e => setPerson(e.target.value)}>
          <option value="">Everyone</option>
          {people.map(p => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <select className="input sm:w-auto" value={action} onChange={e => setAction(e.target.value)}>
          <option value="">Everything</option>
          {actions.map(a => (
            <option key={a} value={a}>
              {ACTIVITY_LABELS[a] ?? a}
            </option>
          ))}
        </select>
        <span className="sm:ml-auto">
          <ExportButton
            rows={shown.map(r => ({ When: formatDateTime(r.created_at), Who: r.username ?? "", What: ACTIVITY_LABELS[r.action] ?? r.action, About: r.target ?? "", Details: describe(r) }))}
            filename="activity_log"
            sheet="Activity"
          />
        </span>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>What</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td className="muted whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                <td className="text-white">{r.username ?? "—"}</td>
                <td>
                  <p className="text-white">{ACTIVITY_LABELS[r.action] ?? r.action}</p>
                  {r.target && <p className="text-[0.7rem] faint">{r.target}</p>}
                </td>
                <td className="muted text-xs max-w-md">{describe(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="empty">Nothing matches.</p>}
      </div>
      {rows.length >= 1000 && <p className="text-xs faint">Showing the latest 1,000 entries.</p>}
    </div>
  )
}
