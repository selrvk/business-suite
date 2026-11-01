"use client"

import { useState } from "react"
import { CheckCheck, Printer, X } from "lucide-react"
import { ConfirmButton } from "@/components/modal"
import { cancelOrder, completeOrder } from "../sales/actions"

export function OrderActions({ orderId, number, canCancel = true }: { orderId: number; number: number; canCancel?: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const result = await completeOrder(orderId)
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/print/receipt/${orderId}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="Print order slip">
          <Printer size={13} />
        </a>
        <button className="btn btn-good btn-sm" onClick={confirm} disabled={busy}>
          <CheckCheck size={13} /> {busy ? "Confirming…" : "Confirm"}
        </button>
        {canCancel && (
          <ConfirmButton
            title={`Cancel order #${number}?`}
            message="The order will move to Sales History as cancelled. Stock isn't affected."
            confirmLabel="Cancel order"
            action={() => cancelOrder(orderId)}
          >
            <X size={13} /> Cancel
          </ConfirmButton>
        )}
      </div>
      {error && <p className="text-xs text-bad max-w-xs text-right">{error}</p>}
    </div>
  )
}
