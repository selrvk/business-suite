import Link from "next/link"
import { DbError } from "@/components/db-error"
import { DateRange } from "@/components/date-range"
import { Empty, PageHeader } from "@/components/page-header"
import { ExportButton } from "@/components/export-button"
import { requireModule, requireUser } from "@/lib/auth"
import { getSupabase } from "@/lib/supabase/server"
import { addDays, dayRange, formatDateTime, readRange, toYmd } from "@/lib/format"
import type { StockReason } from "@/lib/types"

export const metadata = { title: "Stock Log" }

const REASONS: Record<StockReason, { label: string; tone: string }> = {
  initial: { label: "Opening", tone: "info" },
  receive: { label: "Received", tone: "good" },
  sale: { label: "Sale", tone: "brand" },
  adjust: { label: "Correction", tone: "warn" },
  return: { label: "Return", tone: "good" },
  out: { label: "Stock out", tone: "bad" },
}

type Movement = {
  id: number
  change: number
  reason: StockReason
  note: string | null
  order_id: number | null
  created_by: string | null
  created_at: string
  items: { name: string; unit: string } | null
  orders: { number: number } | null
}

const LIMIT = 500

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; reason?: string; q?: string }>
}) {
  requireModule("inventory")
  const params = await searchParams
  const supabase = await getSupabase()
  const today = toYmd()
  const { from, to } = readRange(params, { from: addDays(today, -6), to: today })
  const range = dayRange(from, to)
  const reason = params.reason && params.reason in REASONS ? (params.reason as StockReason) : undefined
  const q = params.q?.trim() ?? ""

  let query = supabase
    .from("stock_movements")
    .select(`id, change, reason, note, order_id, created_by, created_at, orders(number), items${q ? "!inner" : ""}(name, unit)`)
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(LIMIT)
  if (reason) query = query.eq("reason", reason)
  if (q) query = query.ilike("items.name", `%${q}%`)

  const [, { data, error }, { data: profiles }] = await Promise.all([
    requireUser(),
    query,
    supabase.from("members").select("user_id, username"),
  ])
  if (error) return <DbError error={error} />

  const rows = (data ?? []) as unknown as Movement[]
  const names = new Map((profiles ?? []).map(p => [p.user_id, p.username]))
  const totalIn = rows.filter(r => r.change > 0).reduce((s, r) => s + r.change, 0)
  const totalOut = rows.filter(r => r.change < 0).reduce((s, r) => s - r.change, 0)

  return (
    <>
      <PageHeader eyebrow="Inventory" title="Stock Log" subtitle="Every stock change (sales, deliveries, corrections) and who made it.">
        <ExportButton
          filename={`stock_log_${from}_to_${to}`}
          sheet="Stock log"
          rows={rows.map(r => ({
            Date: formatDateTime(r.created_at),
            Product: r.items?.name ?? "(deleted)",
            Change: r.change,
            Unit: r.items?.unit ?? "",
            Reason: REASONS[r.reason]?.label ?? r.reason,
            Note: r.note ?? "",
            Order: r.orders?.number ?? "",
            By: (r.created_by && names.get(r.created_by)) || "",
          }))}
        />
      </PageHeader>

      <div className="flex flex-col gap-3 mb-6">
        <DateRange path="/inventory/movements" from={from} to={to} extra={{ reason, q: q || undefined }} />
        <form className="flex flex-wrap items-end gap-2" action="/inventory/movements">
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
          <label className="flex-1 min-w-48">
            <span className="label">Product</span>
            <input className="input" name="q" defaultValue={q} placeholder="Search product name" />
          </label>
          <label>
            <span className="label">Type</span>
            <select className="input" name="reason" defaultValue={reason ?? ""}>
              <option value="">All changes</option>
              {Object.entries(REASONS).map(([value, r]) => (
                <option key={value} value={value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <button className="btn btn-secondary" type="submit">
            Filter
          </button>
        </form>
        <p className="text-xs faint">
          <span className="text-good font-semibold">+{totalIn}</span> in · <span className="text-bad font-semibold">−{totalOut}</span> out ·{" "}
          {rows.length} changes{rows.length === LIMIT && ` (showing newest ${LIMIT}; narrow the dates to see more)`}
        </p>
      </div>

      <div className="table-wrap">
        {rows.length === 0 ? (
          <Empty title="No stock changes">Nothing matches these filters.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Product</th>
                <th className="num">Change</th>
                <th>Type</th>
                <th>Note</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap muted">{formatDateTime(r.created_at)}</td>
                  <td className="text-white">{r.items?.name ?? <span className="faint">(deleted product)</span>}</td>
                  <td className={`num font-semibold ${r.change > 0 ? "text-good" : "text-bad"}`}>
                    {r.change > 0 ? "+" : "−"}
                    {Math.abs(r.change)} <span className="faint text-xs font-normal">{r.items?.unit}</span>
                  </td>
                  <td>
                    <span className="pill" data-tone={REASONS[r.reason]?.tone}>
                      {REASONS[r.reason]?.label ?? r.reason}
                    </span>
                  </td>
                  <td className="muted">
                    {r.order_id ? (
                      <Link className="underline decoration-dotted" href={`/print/receipt/${r.order_id}`} target="_blank">
                        Order #{r.orders?.number ?? r.order_id}
                      </Link>
                    ) : (
                      (r.note ?? "—")
                    )}
                  </td>
                  <td className="muted">{(r.created_by && names.get(r.created_by)) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
