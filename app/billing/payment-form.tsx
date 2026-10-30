"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { price } from "@/lib/format"
import { submitPayment } from "./actions"

export function PaymentForm({ prices }: { prices: { monthly: number; yearly: number | null } }) {
  const [period, setPeriod] = useState<"month" | "year">("month")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setBusy(true)
    setStatus(null)
    const result = await submitPayment({ period, reference: String(form.get("reference")), note: String(form.get("note")) })
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    setStatus({ ok: true, text: "Thanks! We'll confirm your payment shortly. Your suite unlocks as soon as we do." })
    formEl.reset()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 border-t pt-5" style={{ borderColor: "var(--app-border)" }}>
      <p className="section-title">Already paid? Tell us</p>
      {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
      {prices.yearly ? (
        <div className="segmented self-start">
          <button type="button" data-active={period === "month"} onClick={() => setPeriod("month")}>
            1 month · {price(prices.monthly)}
          </button>
          <button type="button" data-active={period === "year"} onClick={() => setPeriod("year")}>
            1 year · {price(prices.yearly)}
          </button>
        </div>
      ) : (
        <p className="text-sm muted">1 month · {price(prices.monthly)}</p>
      )}
      <div className="grid sm:grid-cols-2 gap-3">
        <label>
          <span className="label">Reference number</span>
          <input className="input mono" name="reference" required minLength={3} maxLength={80} placeholder="From your GCash or bank receipt" />
        </label>
        <label>
          <span className="label">Note (optional)</span>
          <input className="input" name="note" maxLength={200} placeholder="e.g. Paid from Maria's GCash" />
        </label>
      </div>
      <button className="btn btn-primary self-start" disabled={busy}>
        <Send size={14} /> {busy ? "Sending…" : "Send payment details"}
      </button>
    </form>
  )
}
