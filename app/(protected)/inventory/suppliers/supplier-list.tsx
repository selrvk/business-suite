"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, Pencil, Phone, Plus, Trash2 } from "lucide-react"
import { ConfirmDialog, Modal } from "@/components/modal"
import type { Supplier } from "@/lib/types"
import { deleteSupplier, saveSupplier } from "./actions"

export function SupplierList({
  suppliers,
  productCounts,
  lowCounts,
  isAdmin,
}: {
  suppliers: Supplier[]
  productCounts: Record<number, number>
  lowCounts: Record<number, number>
  isAdmin: boolean
}) {
  const [editing, setEditing] = useState<Supplier | null>(null)
  const [deleting, setDeleting] = useState<Supplier | null>(null)

  if (!suppliers.length) {
    return (
      <div className="card card-body text-center flex flex-col items-center gap-3 py-10">
        <p className="text-white font-semibold">No suppliers yet</p>
        <p className="text-sm muted max-w-md">
          Add the people and companies you buy from. Then pick them on each product, and the Reorder List groups what to buy by
          supplier.
        </p>
        <AddSupplierButton />
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {suppliers.map(s => (
          <div key={s.id} className="card card-body flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-white truncate">{s.name}</p>
                {s.contact_person && <p className="text-xs faint truncate">{s.contact_person}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <button className="btn btn-ghost btn-icon" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}>
                  <Pencil size={14} />
                </button>
                {isAdmin && (
                  <button className="btn btn-ghost btn-icon" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-1 text-sm">
              {s.phone && (
                <a href={`tel:${s.phone.replace(/[^\d+]/g, "")}`} className="muted inline-flex items-center gap-2 hover:text-white">
                  <Phone size={13} /> {s.phone}
                </a>
              )}
              {s.email && (
                <a href={`mailto:${s.email}`} className="muted inline-flex items-center gap-2 hover:text-white truncate">
                  <Mail size={13} /> {s.email}
                </a>
              )}
              {s.address && <p className="text-xs faint">{s.address}</p>}
              {s.notes && <p className="text-xs faint italic">{s.notes}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-auto pt-2">
              <span className="pill">{productCounts[s.id] ?? 0} products</span>
              {lowCounts[s.id] ? (
                <Link href="/inventory/reorder" className="pill" data-tone="warn">
                  {lowCounts[s.id]} to reorder
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <SupplierModal supplier={editing} open={!!editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete supplier?"
        message={
          <>
            <span className="text-white font-semibold">{deleting?.name}</span> will be removed. Its products stay, without a
            supplier.
          </>
        }
        confirmLabel="Delete"
        action={() => deleteSupplier(deleting!.id)}
      />
    </>
  )
}

export function AddSupplierButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add supplier
      </button>
      <SupplierModal supplier={null} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function SupplierModal({ supplier, open, onClose }: { supplier: Supplier | null; open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={supplier ? "Edit supplier" : "Add supplier"} width={480}>
      <SupplierForm key={supplier?.id ?? "new"} supplier={supplier} onClose={onClose} />
    </Modal>
  )
}

function SupplierForm({ supplier, onClose }: { supplier: Supplier | null; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (k: string) => String(form.get(k) ?? "")
    setBusy(true)
    setError(null)
    const result = await saveSupplier(
      { name: text("name"), contact_person: text("contact_person"), phone: text("phone"), email: text("email"), address: text("address"), notes: text("notes") },
      supplier?.id,
    )
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Name *</span>
        <input className="input" name="name" defaultValue={supplier?.name} required maxLength={120} autoFocus placeholder="e.g. Metro Drug Distribution" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Contact person</span>
          <input className="input" name="contact_person" defaultValue={supplier?.contact_person ?? ""} />
        </label>
        <label>
          <span className="label">Phone</span>
          <input className="input" name="phone" type="tel" defaultValue={supplier?.phone ?? ""} placeholder="0917 123 4567" />
        </label>
      </div>
      <label>
        <span className="label">Email</span>
        <input className="input" name="email" type="email" defaultValue={supplier?.email ?? ""} />
      </label>
      <label>
        <span className="label">Address</span>
        <input className="input" name="address" defaultValue={supplier?.address ?? ""} />
      </label>
      <label>
        <span className="label">Notes</span>
        <textarea className="input min-h-20" name="notes" defaultValue={supplier?.notes ?? ""} placeholder="e.g. Delivers Tuesdays, 30-day terms" />
      </label>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : supplier ? "Save changes" : "Add supplier"}
        </button>
      </div>
    </form>
  )
}
