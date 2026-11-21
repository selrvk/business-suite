"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Banknote, History, MoreHorizontal, Pencil, Plus, Search, Trash2, X } from "lucide-react"
import { ConfirmDialog, Modal } from "@/components/modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { formatDateTime, money, num } from "@/lib/format"
import type { Customer } from "@/lib/types"
import { customerHistory, deleteCustomer, recordPayment, saveCustomer, type LedgerEntry } from "./actions"

const METHODS = ["Cash", "GCash", "Maya", "Card", "Bank transfer", "Other"]

export function CustomerList({ customers, isAdmin, canCredit }: { customers: Customer[]; isAdmin: boolean; canCredit: boolean }) {
  const [search, setSearch] = useState("")
  const [show, setShow] = useState<"all" | "owing" | "over">("all")
  const [editing, setEditing] = useState<Customer | null>(null)
  const [paying, setPaying] = useState<Customer | null>(null)
  const [history, setHistory] = useState<Customer | null>(null)
  const [deleting, setDeleting] = useState<Customer | null>(null)

  const owes = (c: Customer) => Number(c.balance) > 0
  const isOver = (c: Customer) => c.credit_limit != null && Number(c.balance) > Number(c.credit_limit)
  const counts = { all: customers.length, owing: customers.filter(owes).length, over: customers.filter(isOver).length }

  // People who owe the most come first.
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers
      .filter(c => !q || [c.name, c.phone, c.address, c.notes].some(v => v?.toLowerCase().includes(q)))
      .filter(c => (show === "owing" ? owes(c) : show === "over" ? isOver(c) : true))
      .sort((a, b) => Number(b.balance) - Number(a.balance) || a.name.localeCompare(b.name))
  }, [customers, search, show])
  const filtering = search.trim() !== "" || show !== "all"

  /** What they owe: amber, red with "Over limit" past their limit, or credit they have with you. */
  const owed = (c: Customer) => {
    const balance = Number(c.balance)
    if (balance < 0) return <span className="muted text-xs whitespace-nowrap">{money(-balance)} credit</span>
    if (balance === 0) return <span className="faint">—</span>
    const over = isOver(c)
    return (
      <span className="inline-flex flex-col items-end gap-1 whitespace-nowrap">
        <span className={`font-semibold tabular ${over ? "text-bad" : "text-warn"}`}>{money(balance)}</span>
        {over && (
          <span className="pill" data-tone="bad">
            Over limit
          </span>
        )}
      </span>
    )
  }

  /** The row menu: payment, history, edit and (owners) delete. */
  const menu = (c: Customer, withPayment: boolean) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="btn btn-ghost btn-icon" aria-label={`Actions for ${c.name}`}>
          <MoreHorizontal size={16} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {withPayment && canCredit && owes(c) && (
          <DropdownMenuItem onSelect={() => setPaying(c)}>
            <Banknote /> Record payment
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => setHistory(c)}>
          <History /> History
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setEditing(c)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(c)}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  /** Tapping a name shows what they bought on credit and paid. */
  const nameOf = (c: Customer, className = "") => (
    <button type="button" className={`product-name ${className}`} onClick={() => setHistory(c)}>
      {c.name}
    </button>
  )
  const tel = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

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
      <div className="flex flex-col md:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 faint" aria-hidden />
          <input
            className="input pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, phone, address or notes"
            aria-label="Search customers"
          />
        </div>
        <div className="segmented w-full md:w-auto" role="group" aria-label="Show">
          {(
            [
              ["all", "Everyone"],
              ["owing", "Owe money"],
              ["over", "Over limit"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="flex-1 md:flex-none"
              data-active={show === key}
              aria-pressed={show === key}
              onClick={() => setShow(key)}
            >
              {label}
              <span className="seg-count" data-tone={counts[key] > 0 ? (key === "owing" ? "warn" : key === "over" ? "bad" : undefined) : undefined}>
                {num(counts[key])}
              </span>
            </button>
          ))}
        </div>
      </div>
      {filtering && (
        <p className="flex items-center gap-3 text-xs muted">
          <span>
            {num(rows.length)} of {num(customers.length)} customers
          </span>
          <button
            type="button"
            className="inline-flex items-center gap-1 underline decoration-dotted hover:text-white"
            onClick={() => {
              setSearch("")
              setShow("all")
            }}
          >
            <X size={12} aria-hidden /> Clear filters
          </button>
        </p>
      )}

      {/* Table on wide screens */}
      <div className="table-wrap hidden lg:block">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone</th>
              <th className="num">Owes</th>
              <th className="num hidden xl:table-cell">Limit</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(c => (
              <tr key={c.id}>
                <td className="max-w-[16rem] xl:max-w-[24rem]">
                  {nameOf(c)}
                  <p className="text-[0.72rem] faint truncate">
                    <span className="xl:hidden">{c.credit_limit != null ? `Limit ${money(c.credit_limit)}` : "No limit"}</span>
                    {(c.notes || c.address) && <span className="xl:hidden"> · </span>}
                    {[c.address, c.notes].filter(Boolean).join(" · ")}
                  </p>
                </td>
                <td className="muted whitespace-nowrap">
                  {c.phone ? (
                    <a href={tel(c.phone)} className="hover:text-white">
                      {c.phone}
                    </a>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td className="num">{owed(c)}</td>
                <td className="num muted hidden xl:table-cell">{c.credit_limit != null ? money(c.credit_limit) : <span className="faint">No limit</span>}</td>
                <td className="whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {canCredit && owes(c) && (
                      <button type="button" className="btn btn-good btn-sm" onClick={() => setPaying(c)}>
                        <Banknote size={13} aria-hidden /> Payment
                      </button>
                    )}
                    {menu(c, false)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="empty">{show === "owing" ? "Nobody owes anything. Nice." : show === "over" ? "Nobody is over their limit." : "No customers match."}</p>}
      </div>

      {/* List on phones and tablets */}
      <div className="lg:hidden card divide-y divide-white/5">
        {rows.map(c => (
          <div key={c.id} className="flex items-center gap-3 pl-4 pr-1 py-3">
            <div className="min-w-0 flex-1">
              {nameOf(c, "block max-w-full truncate text-left")}
              <p className="text-xs faint truncate">
                {c.phone && (
                  <a href={tel(c.phone)} className="muted underline decoration-dotted">
                    {c.phone}
                  </a>
                )}
                {c.phone && (c.notes || c.address) && " · "}
                {[c.address, c.notes].filter(Boolean).join(" · ")}
                {!c.phone && !c.notes && !c.address && (c.credit_limit != null ? `Limit ${money(c.credit_limit)}` : "No limit")}
              </p>
            </div>
            <div className="text-right text-sm">{owed(c)}</div>
            {menu(c, true)}
          </div>
        ))}
        {rows.length === 0 && <p className="empty">{show === "owing" ? "Nobody owes anything. Nice." : show === "over" ? "Nobody is over their limit." : "No customers match."}</p>}
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
  // Loads once the window opens (not while rendering: a server action updates the router).
  useEffect(() => {
    let live = true
    customerHistory(customer.id).then(r => {
      if (!live) return
      if (r.ok) setEntries(r.data)
      else setError(r.error)
    })
    return () => {
      live = false
    }
  }, [customer.id])

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
