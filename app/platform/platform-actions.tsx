"use client"

import { useState } from "react"
import { CalendarPlus, Check, Trash2, X } from "lucide-react"
import { ConfirmButton, Modal } from "@/components/modal"
import { approvePayment, deleteBusiness, extendTrial, rejectPayment, setPaidUntil } from "./actions"

export function PaymentActions({ id }: { id: number }) {
  return (
    <span className="flex justify-end gap-1.5">
      <ConfirmButton
        className="btn btn-good btn-sm"
        title="Approve this payment?"
        message="Only approve after you've found this reference number in your GCash or bank app. Paid time is added on top of any trial or paid time left."
        confirmLabel="Approve"
        danger={false}
        action={() => approvePayment(id)}
      >
        <Check size={13} /> Approve
      </ConfirmButton>
      <ConfirmButton
        className="btn btn-ghost btn-sm"
        title="Reject this payment?"
        message="Use this when you can't find the payment. The business will see it as rejected and can send it again."
        confirmLabel="Reject"
        action={() => rejectPayment(id)}
      >
        <X size={13} />
      </ConfirmButton>
    </span>
  )
}

export function BusinessActions({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) return setError(result.error ?? "Failed")
    setOpen(false)
  }

  return (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => setOpen(true)}>
        <CalendarPlus size={13} /> Access
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={name} width={420}>
        {error && <p className="alert alert-error">{error}</p>}
        <div>
          <p className="label">Extend free trial</p>
          <div className="flex gap-2">
            {[7, 14, 30].map(days => (
              <button key={days} className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run(() => extendTrial(id, days))}>
                +{days} days
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label">Set paid until</p>
          <div className="flex gap-2">
            <input className="input" type="date" value={date} onChange={e => setDate(e.target.value)} />
            <button className="btn btn-primary" disabled={busy || !date} onClick={() => run(() => setPaidUntil(id, date))}>
              Save
            </button>
          </div>
          <p className="hint">For payments made outside the app. Usually you&apos;d just approve their payment report instead.</p>
        </div>
        <button className="btn btn-ghost btn-sm self-start" disabled={busy} onClick={() => run(() => setPaidUntil(id, ""))}>
          Clear paid time
        </button>
        <div className="border-t pt-4 mt-1" style={{ borderColor: "var(--app-border)" }}>
          <p className="label text-bad">Delete business</p>
          <p className="text-xs muted mb-2">
            Permanently removes {name}: products, sales, people, trucks, payments and its staff logins. Your own login is never
            deleted. Type the business name to confirm.
          </p>
          <div className="flex gap-2">
            <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder={name} />
            <button className="btn btn-danger shrink-0" disabled={busy || typed.trim() !== name} onClick={() => run(() => deleteBusiness(id, typed))}>
              <Trash2 size={14} /> Delete
            </button>
          </div>
        </div>
      </Modal>
    </>
  )
}
