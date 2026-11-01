"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Lock, Printer } from "lucide-react"
import { Stat } from "@/components/page-header"
import { formatDate, formatDateTime, money, num } from "@/lib/format"
import type { DaySummary } from "@/lib/notify"
import { closeDay } from "./actions"

export type Closing = {
  day: string
  opening_cash: number
  expected_cash: number
  counted_cash: number | null
  difference: number | null
  note: string | null
  username: string | null
  updated_at: string
}

export function CloseDay({ day, today, summary, closing, recent }: { day: string; today: string; summary: DaySummary; closing: Closing | null; recent: Closing[] }) {
  const router = useRouter()
  const [opening, setOpening] = useState(closing ? String(closing.opening_cash) : "")
  const [counted, setCounted] = useState(closing?.counted_cash != null ? String(closing.counted_cash) : "")
  const [note, setNote] = useState(closing?.note ?? "")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  const cashIn = Number(summary.cash_in)
  const expected = (Number(opening) || 0) + cashIn
  const difference = counted.trim() === "" ? null : Math.round(((Number(counted) || 0) - expected) * 100) / 100
  const methods = Object.entries(summary.by_method ?? {}).sort((a, b) => b[1] - a[1])
  const collected = Object.entries(summary.collected ?? {}).sort((a, b) => b[1] - a[1])

  async function save() {
    setBusy(true)
    setStatus(null)
    const result = await closeDay({ day, openingCash: Number(opening) || 0, countedCash: Number(counted), note })
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    const d = result.data.difference
    setStatus({ ok: true, text: `Day closed. ${d === 0 ? "The drawer matched exactly." : `The drawer was ${d > 0 ? "over" : "short"} by ${money(Math.abs(d))}.`}` })
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3 no-print">
        <label className="flex items-center gap-2 text-sm">
          <span className="faint">Day</span>
          <input className="input w-44" type="date" value={day} max={today} onChange={e => e.target.value && router.push(`/sales/close?day=${e.target.value}`)} />
        </label>
        {closing && (
          <span className="pill" data-tone="good">
            <Lock size={11} className="inline -mt-0.5" /> Closed by {closing.username ?? "someone"}, {formatDateTime(closing.updated_at)}
          </span>
        )}
        <button className="btn btn-secondary ml-auto" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Sales" value={money(summary.net)} hint={`${num(summary.sales)} sale${summary.sales === 1 ? "" : "s"} · ${num(summary.items_sold)} items`} tone="good" />
        <Stat
          label="Discounts"
          value={money(summary.discounts)}
          hint={summary.senior_pwd ? `${summary.senior_pwd} Senior/PWD sale${summary.senior_pwd === 1 ? "" : "s"}` : "No Senior/PWD sales"}
        />
        <Stat label="Put on credit" value={money(summary.credit_given)} tone={summary.credit_given > 0 ? "warn" : undefined} />
        <Stat label="Voided" value={money(summary.voided_total)} hint={`${summary.voids} sale${summary.voids === 1 ? "" : "s"}`} tone={summary.voids ? "bad" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card card-body flex flex-col gap-3 print-break">
          <h2 className="section-title">Money in</h2>
          {methods.length === 0 && collected.length === 0 ? (
            <p className="text-sm faint">No payments this day.</p>
          ) : (
            <>
              {methods.map(([method, amount]) => (
                <div key={method} className="list-row text-sm">
                  <span className="flex-1 text-white">{method}</span>
                  <span className="text-white font-semibold">{money(amount)}</span>
                </div>
              ))}
              {collected.length > 0 && <p className="text-xs faint mt-2">Collected from customers who owed</p>}
              {collected.map(([method, amount]) => (
                <div key={`c-${method}`} className="list-row text-sm">
                  <span className="flex-1 muted">{method}</span>
                  <span className="text-white">{money(amount)}</span>
                </div>
              ))}
            </>
          )}
          {summary.vat_exempt > 0 && <p className="text-xs faint">VAT exempt (Senior/PWD): {money(summary.vat_exempt)}</p>}
        </section>

        <section className="card card-body flex flex-col gap-4 print-break">
          <h2 className="section-title">Cash drawer</h2>
          {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
          <div className="grid grid-cols-2 gap-3">
            <label>
              <span className="label">Starting cash</span>
              <input className="input" type="number" min={0} step="0.01" value={opening} onChange={e => setOpening(e.target.value)} placeholder="0.00" />
              <span className="hint">What was in the drawer when the day began</span>
            </label>
            <label>
              <span className="label">Cash counted now</span>
              <input className="input" type="number" min={0} step="0.01" value={counted} onChange={e => setCounted(e.target.value)} placeholder="0.00" />
            </label>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <p className="flex justify-between muted">
              <span>Cash taken in today</span>
              <span>{money(cashIn)}</span>
            </p>
            <p className="flex justify-between text-white">
              <span>Should be in the drawer</span>
              <span className="font-semibold">{money(expected)}</span>
            </p>
            {difference !== null && (
              <p className={`flex justify-between font-semibold ${difference === 0 ? "text-good" : difference > 0 ? "text-warn" : "text-bad"}`}>
                <span>{difference === 0 ? "Matches exactly" : difference > 0 ? "Over by" : "Short by"}</span>
                <span className="display text-2xl">{difference === 0 ? <CheckCircle2 size={20} /> : money(Math.abs(difference))}</span>
              </p>
            )}
          </div>
          <label className="no-print">
            <span className="label">Note</span>
            <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. ₱100 paid for ice from the drawer" maxLength={300} />
          </label>
          <button className="btn btn-primary btn-lg no-print" onClick={save} disabled={busy || counted.trim() === ""}>
            <Lock size={15} /> {busy ? "Closing…" : closing ? "Close again (replaces the last count)" : "Close the day"}
          </button>
        </section>
      </div>

      {summary.top_items?.length > 0 && (
        <section className="card card-body print-break">
          <h2 className="section-title mb-3">Best sellers on {formatDate(day)}</h2>
          {summary.top_items.map(t => (
            <div key={t.name} className="list-row text-sm">
              <span className="flex-1 text-white truncate">{t.name}</span>
              <span className="muted w-20 text-right">×{num(t.quantity)}</span>
              <span className="text-white w-28 text-right">{money(t.amount)}</span>
            </div>
          ))}
        </section>
      )}

      {recent.length > 0 && (
        <section className="flex flex-col gap-3 no-print">
          <h2 className="section-title">Past closings</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Closed by</th>
                  <th className="num">Expected</th>
                  <th className="num">Counted</th>
                  <th className="num">Over / short</th>
                </tr>
              </thead>
              <tbody>
                {recent.map(c => {
                  const d = Number(c.difference ?? 0)
                  return (
                    <tr key={c.day} className="cursor-pointer" onClick={() => router.push(`/sales/close?day=${c.day}`)}>
                      <td className="text-white">{formatDate(c.day)}</td>
                      <td className="muted">{c.username ?? "—"}</td>
                      <td className="num muted">{money(c.expected_cash)}</td>
                      <td className="num">{c.counted_cash != null ? money(c.counted_cash) : "—"}</td>
                      <td className="num">
                        <span className={d === 0 ? "text-good" : d > 0 ? "text-warn" : "text-bad"}>{d === 0 ? "Exact" : `${d > 0 ? "+" : "−"}${money(Math.abs(d))}`}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
