"use client"

import { useState } from "react"
import { Undo2 } from "lucide-react"
import { Modal } from "@/components/modal"
import { money } from "@/lib/format"
import { voidSale } from "./actions"

const REASONS = ["Customer returned it", "Wrong item or price", "Rang up by mistake", "Customer changed their mind"]

/** Voids a completed sale: stock goes back and any credit comes off the customer's balance. */
export function VoidSaleButton({ orderId, number, total }: { orderId: number; number: number; total: number }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(REASONS[0])
  const [other, setOther] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const result = await voidSale(orderId, reason === "other" ? other : reason)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    setOpen(false)
  }

  return (
    <>
      <button className="btn btn-ghost btn-icon" title="Void this sale" aria-label={`Void sale #${number}`} onClick={() => setOpen(true)}>
        <Undo2 size={14} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Void sale #${number}?`} width={420}>
        <div className="flex flex-col gap-4">
          {error && <p className="alert alert-error">{error}</p>}
          <p className="text-sm muted">
            The {money(total)} sale is cancelled, its items go back into stock, and anything on credit comes off the customer&apos;s
            balance. It stays in the history, marked voided.
          </p>
          <label>
            <span className="label">Why</span>
            <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
              {REASONS.map(r => (
                <option key={r}>{r}</option>
              ))}
              <option value="other">Something else…</option>
            </select>
          </label>
          {reason === "other" && <input className="input" value={other} onChange={e => setOther(e.target.value)} placeholder="Reason" maxLength={200} autoFocus />}
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={() => setOpen(false)}>
              Keep it
            </button>
            <button className="btn btn-danger" onClick={confirm} disabled={busy || (reason === "other" && !other.trim())}>
              {busy ? "Voiding…" : "Void sale"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
