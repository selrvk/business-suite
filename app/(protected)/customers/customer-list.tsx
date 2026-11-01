"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Banknote, History, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react"
import { ConfirmDialog, Modal } from "@/components/modal"
import { formatDateTime, money } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { customerHistory, deleteCustomer, recordPayment, saveCustomer, type LedgerEntry } from "./actions"

const METHODS = ["Cash", "GCash", "Maya", "Card", "Bank transfer", "Other"]

export function CustomerList({ customers, isAdmin, canCredit }: { customers: Customer[]; isAdmin: boolean; canCredit: boolean }) {
  const [search, setSearch] = useState("")
  const [owingOnly, setOwingOnly] = useState(false)
  const [editing, setEditing] = useState<Customer | null>(null)
  const [paying, setPaying] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers
      .filter(c => (!q || [c.name, c.phone, c.address].some(v => v?.toLowerCase().includes(q))) && (!owingOnly || Number(c.balance) > 0))
      .sort((a, b) => Number(b.balance) - Number(a.balance) || a.name.localeCompare(b.name))
  }, [customers, search, owingOnly])

  if (!customers.length) {
    return (
      <div className="card card-body text-center flex flex-col items-center gap-3 py-10">
        <p className="text-white font-semibold">No customers yet</p>
        <p className="text-sm muted max-w-md">Add the customers you sell to regularly, especially the ones who pay later. Then pick them at Point of Sale.</p>
        <AddCustomerButton canSetLimit={canCredit} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 faint" />
          <input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or address" />
        </div>
        <div className="segmented">
          <button data-active={!owingOnly} onClick={() => setOwingOnly(false)}>
            Everyone
          </button>
          <button data-active={owingOnly} onClick={() => setOwingOnly(true)}>
            Owes money
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th className="hidden md:table-cell">Phone</th>
              <th className="num">Owes</th>
              <th className="num hidden sm:table-cell">Limit</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map(c => {
              const balance = Number(c.balance)
              const over = c.credit_limit != null && balance > Number(c.credit_limit)
              return (
                <tr key={c.id}>
                  <td>
                    <p className="text-white">{c.name}</p>
                    {c.notes && <p className="text-[0.7rem] faint truncate max-w-64">{c.notes}</p>}
                  </td>
                  <td className="muted hidden md:table-cell">
                    {c.phone ? (
                      <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 hover:text-white">
                        <Phone size={12} /> {c.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="num">
                    {balance > 0 ? (
                      <span className="pill" data-tone={over ? "bad" : "warn"}>
                        {money(balance)}
                      </span>
                    ) : balance < 0 ? (
                      <span className="text-good text-xs">{money(-balance)} credit</span>
                    ) : (
                      <span className="faint">—</span>
                    )}
                  </td>
                  <td className="num muted hidden sm:table-cell">{c.credit_limit != null ? money(c.credit_limit) : "No limit"}</td>
                  <td className="text-right whitespace-nowrap">
                    {canCredit && balance > 0 && (
                      <button className="btn btn-good btn-sm" onClick={() => setPaying(c)}>
                        <Banknote size={13} /> Payment
                      </button>
                    )}
                    <button className="btn btn-ghost btn-icon" aria-label={`History for ${c.name}`} onClick={() => setHistory(c)}>
                      <History size={14} />
                    </button>
                    <button className="btn btn-ghost btn-icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                      <Pencil size={14} />
                    </button>
                    {isAdmin && (
                      <button className="btn btn-ghost btn-icon" aria-label={`Delete ${c.name}`} onClick={() => setDeleting(c)}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">{owingOnly ? "Nobody owes anything. Nice." : "No customers match."}</p>}
      </div>

      <CustomerModal customer={editing} open={!!editing} onClose={() => setEditing(null)} canSetLimit={canCredit} />
      <PaymentModal customer={paying} onClose={() => setPaying(null)} />
      <HistoryModal customer={history} onClose={() => setHistory(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete customer?"
        message={
          <>
            <span className="text-white font-semibold">{deleting?.name}</span> and their history will be removed. Past sales keep
            their name.
          </>
        }
        confirmLabel="Delete"
        action={() => deleteCustomer(deleting!.id)}
      />
    </div>
  )
}

export function AddCustomerButton({ canSetLimit }: { canSetLimit: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        <Plus size={15} /> Add customer
      </button>
      <CustomerModal customer={null} open={open} onClose={() => setOpen(false)} canSetLimit={canSetLimit} />
    </>
  )
}

function CustomerModal({ customer, open, onClose, canSetLimit }: { customer: Customer | null; open: boolean; onClose: () => void; canSetLimit: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={customer ? "Edit customer" : "Add customer"} width={460}>
      <CustomerForm key={customer?.id ?? "new"} customer={customer} onClose={onClose} canSetLimit={canSetLimit} />
    </Modal>
  )
}

function CustomerForm({ customer, onClose, canSetLimit }: { customer: Customer | null; onClose: () => void; canSetLimit: boolean }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (k: string) => String(form.get(k) ?? "")
    setBusy(true)
    setError(null)
    const result = await saveCustomer(
      { name: text("name"), phone: text("phone"), address: text("address"), notes: text("notes"), credit_limit: text("credit_limit") },
      customer?.id,
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
        <input className="input" name="name" defaultValue={customer?.name} required maxLength={120} autoFocus placeholder="e.g. Aling Rosa's Store" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Phone</span>
          <input className="input" name="phone" type="tel" defaultValue={customer?.phone ?? ""} />
        </label>
        {canSetLimit && (
          <label>
            <span className="label">Credit limit (₱)</span>
            <input className="input" name="credit_limit" type="number" min={0} step="0.01" defaultValue={customer?.credit_limit ?? ""} placeholder="No limit" />
          </label>
        )}
      </div>
      <label>
        <span className="label">Address</span>
        <input className="input" name="address" defaultValue={customer?.address ?? ""} />
      </label>
      <label>
        <span className="label">Notes</span>
        <textarea className="input min-h-16" name="notes" defaultValue={customer?.notes ?? ""} placeholder="e.g. Pays every 15th and 30th" />
      </label>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : customer ? "Save changes" : "Add customer"}
        </button>
      </div>
    </form>
  )
}

function PaymentModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return (
    <Modal open={!!customer} onClose={onClose} title="Record a payment" width={420}>
      {customer && <PaymentForm key={customer.id} customer={customer} onClose={onClose} />}
    </Modal>
  )
}

function PaymentForm({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const balance = Number(customer.balance)
  const [amount, setAmount] = useState(String(balance))
  const [method, setMethod] = useState("Cash")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const after = balance - (Number(amount) || 0)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const result = await recordPayment({
      customerId: customer.id,
      amount: Number(amount),
      method,
      reference: String(form.get("reference") ?? ""),
      note: String(form.get("note") ?? ""),
    })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <p className="text-sm muted">
        <span className="text-white font-semibold">{customer.name}</span> owes {money(balance)}.
      </p>
      <label>
        <span className="label">Amount paid (₱)</span>
        <input className="input text-lg" type="number" min={0.01} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required autoFocus />
        <span className="hint">{after > 0 ? `Still owes ${money(after)} after this.` : after < 0 ? `${money(-after)} extra becomes credit for next time.` : "Paid in full."}</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {METHODS.map(m => (
          <button key={m} type="button" className={`btn btn-sm ${method === m ? "btn-primary" : "btn-secondary"}`} onClick={() => setMethod(m)}>
            {m}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Reference no.</span>
          <input className="input" name="reference" placeholder="Optional" />
        </label>
        <label>
          <span className="label">Note</span>
          <input className="input" name="note" placeholder="Optional" />
        </label>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-good" disabled={busy || !(Number(amount) > 0)}>
          {busy ? "Saving…" : `Record ${money(Number(amount) || 0)}`}
        </button>
      </div>
    </form>
  )
}

const KIND_LABEL: Record<LedgerEntry["kind"], string> = { sale: "Credit sale", payment: "Payment", void: "Sale voided", adjust: "Adjustment" }

function HistoryModal({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  return (
    <Modal open={!!customer} onClose={onClose} title={customer ? `${customer.name}: history` : "History"} width={560}>
      {customer && <HistoryList key={customer.id} customer={customer} />}
    </Modal>
  )
}

function HistoryList({ customer }: { customer: Customer }) {
  const [entries, setEntries] = useState<LedgerEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requested, setRequested] = useState(false)
  if (!requested) {
    setRequested(true)
    customerHistory(customer.id).then(r => (r.ok ? setEntries(r.data) : setError(r.error)))
  }

  if (error) return <p className="alert alert-error">{error}</p>
  if (!entries) return <p className="text-sm faint py-6 text-center">Loading…</p>
  if (!entries.length) return <p className="text-sm faint py-6 text-center">No credit sales or payments yet.</p>
  return (
    <div className="flex flex-col gap-1 max-h-[60vh] overflow-y-auto">
      <p className="text-sm muted mb-2">Owes {money(customer.balance)} now.</p>
      {entries.map(e => (
        <div key={e.id} className="list-row text-sm">
          <span className="flex-1 min-w-0">
            <span className="text-white">{KIND_LABEL[e.kind]}</span>
            <span className="block text-xs faint truncate">
              {[formatDateTime(e.created_at), e.method, e.reference && `ref ${e.reference}`, e.note].filter(Boolean).join(" · ")}
            </span>
          </span>
          {e.order_id && (
            <Link href={`/print/receipt/${e.order_id}`} target="_blank" className="text-xs muted underline decoration-dotted">
              Receipt
            </Link>
          )}
          <span className={`w-24 text-right font-semibold ${Number(e.change) > 0 ? "text-warn" : "text-good"}`}>
            {Number(e.change) > 0 ? "+" : "−"}
            {money(Math.abs(Number(e.change)))}
          </span>
        </div>
      ))}
    </div>
  )
}
