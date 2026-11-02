"use client"

import { useState } from "react"
import { SENIOR_RATE_LABELS, SENIOR_WEEKLY_CAP, type SeniorRate } from "@/lib/sale-math"
import { money, num } from "@/lib/format"
import { setCategorySenior, updateSeniorSettings } from "./actions"

export type CategoryRates = { category: string | null; products: number; rates: Record<string, number> }

const RATES: SeniorRate[] = [20, 5, 0]

/** Settings → Senior Citizen & PWD discounts. */
export function SeniorForm({ seniorDefault, basicExempt, categories }: { seniorDefault: number; basicExempt: boolean; categories: CategoryRates[] | null }) {
  const [rate, setRate] = useState(String(seniorDefault))
  const [exempt, setExempt] = useState(basicExempt)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const result = await updateSeniorSettings({ senior_default: Number(rate), senior_basic_exempt: exempt })
    setBusy(false)
    setStatus(result.ok ? { ok: true, text: "Saved." } : { ok: false, text: result.error })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-sm muted leading-relaxed flex flex-col gap-2">
        <p>
          The law gives Senior Citizens and PWDs <span className="text-white">20% off, VAT-free</span>, on medicine, medical supplies and
          meals, and <span className="text-white">5% off</span> on basic necessities and prime commodities like rice, bread, canned
          goods, milk, noodles, coffee, sugar, cooking oil, soap, condiments, school supplies and construction materials, up to{" "}
          {money(SENIOR_WEEKLY_CAP)} off a week, written in their purchase booklet. Other products don&apos;t need a discount.
        </p>
        <p>At checkout each item gets its own rate. Set the rate most of your products need here, then change the others.</p>
      </div>

      <form onSubmit={save} className="flex flex-col gap-4">
        {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
        <label className="max-w-sm">
          <span className="label">Most of my products</span>
          <select className="input" value={rate} onChange={e => setRate(e.target.value)}>
            {RATES.map(r => (
              <option key={r} value={r}>
                {SENIOR_RATE_LABELS[r]}
              </option>
            ))}
          </select>
          <span className="hint">Products you haven&apos;t set get this. Change one product in its Edit form.</span>
        </label>
        <label className="check-row">
          <input type="checkbox" checked={exempt} onChange={e => setExempt(e.target.checked)} />
          <span>
            <span className="block text-sm font-semibold text-white">We&apos;re a BMBE or a cooperative</span>
            <span className="block text-xs faint">
              Businesses registered as a Barangay Micro Business Enterprise, and CDA-registered cooperatives, don&apos;t have to give the
              5% on basic goods. The 20% on medicine and meals still applies.
            </span>
          </span>
        </label>
        <div>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      {categories && categories.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="section-title">By category</p>
          <p className="text-xs faint -mt-1">Set every product in a category at once.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th className="hidden sm:table-cell">Now</th>
                  <th className="text-right">Set all to</th>
                </tr>
              </thead>
              <tbody>
                {categories.map(c => (
                  <CategoryRow key={c.category ?? ""} row={c} seniorDefault={seniorDefault} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CategoryRow({ row, seniorDefault }: { row: CategoryRates; seniorDefault: number }) {
  const [value, setValue] = useState("")
  const [state, setState] = useState<{ busy?: boolean; text?: string; ok?: boolean }>({})
  const summary = Object.entries(row.rates)
    .sort(([a], [b]) => (a === "default" ? 1 : b === "default" ? -1 : Number(b) - Number(a)))
    .map(([r, n]) => `${num(n)} ${r === "default" ? `default (${seniorDefault}%)` : r === "0" ? "none" : `${r}%`}`)
    .join(", ")

  async function apply() {
    if (!value) return
    setState({ busy: true })
    const result = await setCategorySenior(row.category, value === "default" ? null : Number(value))
    setState(result.ok ? { ok: true, text: `${num(result.data)} updated` } : { ok: false, text: result.error })
  }

  return (
    <tr>
      <td>
        <p className={row.category ? "text-white" : "faint"}>{row.category ?? "No category"}</p>
        <p className="text-[0.7rem] faint">
          {num(row.products)} product{row.products === 1 ? "" : "s"}
          <span className="sm:hidden"> · {summary}</span>
        </p>
      </td>
      <td className="muted text-xs hidden sm:table-cell">{summary}</td>
      <td className="text-right">
        <span className="inline-flex items-center gap-2 justify-end flex-wrap">
          {state.text && <span className={`text-xs ${state.ok ? "text-good" : "text-bad"}`}>{state.text}</span>}
          <select className="input input-sm w-auto" value={value} onChange={e => setValue(e.target.value)} aria-label={`Senior/PWD discount for ${row.category ?? "products without a category"}`}>
            <option value="">Choose…</option>
            <option value="20">20%</option>
            <option value="5">5%</option>
            <option value="0">None</option>
            <option value="default">Default</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={apply} disabled={!value || state.busy}>
            {state.busy ? "…" : "Apply"}
          </button>
        </span>
      </td>
    </tr>
  )
}
