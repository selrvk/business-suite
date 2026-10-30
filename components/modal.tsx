"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"
import type { ActionResult } from "@/lib/types"

export function Modal({
  open,
  onClose,
  title,
  children,
  width = 440,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  children: React.ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="modal-overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width }} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

type ConfirmProps = {
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  action: () => Promise<ActionResult<unknown>>
  onDone?: () => void
}

/** "Are you sure?" dialog that runs a server action and shows its error, if any. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  message,
  confirmLabel = "Confirm",
  danger = true,
  action,
  onDone,
}: ConfirmProps & { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    setError(null)
    const result = await action()
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
    onDone?.()
  }

  function close() {
    if (busy) return
    setError(null)
    onClose()
  }

  return (
    <Modal open={open} onClose={close} title={title} width={400}>
      <div className="text-sm muted leading-relaxed">{message}</div>
      {error && <p className="alert alert-error">{error}</p>}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={close} disabled={busy}>
          Cancel
        </button>
        <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={run} disabled={busy}>
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

/** A button that opens a ConfirmDialog. */
export function ConfirmButton({
  children,
  className = "btn btn-danger btn-sm",
  ...props
}: ConfirmProps & { children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <ConfirmDialog open={open} onClose={() => setOpen(false)} {...props} />
    </>
  )
}
