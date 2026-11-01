"use client"

import { useMemo, useState } from "react"
import { CalendarPlus, PackageMinus, Pencil } from "lucide-react"
import { Modal } from "@/components/modal"
import { EXPIRY_SOON_DAYS, EXPIRY_WATCH_DAYS, daysUntil, describeExpiry } from "@/lib/expiry"
import { formatDate, num } from "@/lib/format"
import { recordBatch, removeBatch, updateBatch } from "./actions"

export type BatchRow = {
  id: number
  item_id: number
  quantity: number
  expires_on: string | null
  lot: string | null
  received_at: string
  items: { name: string; unit: string; barcode: string | null } | null
  suppliers: { name: string } | null
}
export type UndatedProduct = { id: number; name: string; unit: string; undated: number }

type Filter = "expired" | "soon" | "watch" | "all"

export function ExpiryBoard({ batches, undated, today }: { batches: BatchRow[]; undated: UndatedProduct[]; today: string }) {
  const [filter, setFilter] = useState<Filter>(() => (batches.some(b => b.expires_on && b.expires_on < today) ? "expired" : "soon"))
  const [removing, setRemoving] = useState<BatchRow | null>(null)
  const [editing, setEditing] = useState<BatchRow | null>(null)
  const [dating, setDating] = useState(false)

  const shown = useMemo(
    () =>
      batches.filter(b => {
        if (filter === "all") return true
        if (!b.expires_on) return false
        const days = daysUntil(b.expires_on, today)
        return filter === "expired" ? days < 0 : filter === "soon" ? days >= 0 && days <= EXPIRY_SOON_DAYS : days >= 0 && days <= EXPIRY_WATCH_DAYS
      }),
    [batches, filter, today],
  )

  const labels: Record<Filter, string> = {
    expired: "Expired",
    soon: `Next ${EXPIRY_SOON_DAYS} days`,
    watch: `Next ${EXPIRY_WATCH_DAYS} days`,
    all: "All batches",
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="segmented">
          {(Object.keys(labels) as Filter[]).map(f => (
            <button key={f} data-active={filter === f} onClick={() => setFilter(f)}>
              {labels[f]}
            </button>
          ))}
        </div>
        {undated.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => setDating(true)}>
            <CalendarPlus size={13} /> Add dates to stock on hand
          </button>
        )}
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th className="num">Quantity</th>
              <th>Expires</th>
              <th className="hidden md:table-cell">Received</th>
              <th className="hidden md:table-cell">Supplier</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {shown.map(b => {
              const e = b.expires_on ? describeExpiry(b.expires_on, today) : null
              return (
                <tr key={b.id}>
                  <td>
                    <p className="text-white">{b.items?.name}</p>
                    <p className="text-[0.7rem] faint">{b.lot ? `Lot ${b.lot}` : "No lot number"}</p>
                  </td>
                  <td className="num">
                    {num(b.quantity)} <span className="faint text-xs">{b.items?.unit}</span>
                  </td>
                  <td>
                    {e ? (
                      <span className="pill" data-tone={e.tone}>
                        {e.days < 0 || e.days > EXPIRY_SOON_DAYS ? e.text : `${formatDate(b.expires_on!)} · ${e.text}`}
                      </span>
                    ) : (
                      <span className="faint">No date</span>
                    )}
                  </td>
                  <td className="muted hidden md:table-cell">{formatDate(b.received_at)}</td>
                  <td className="muted hidden md:table-cell">{b.suppliers?.name ?? "—"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button className="btn btn-ghost btn-icon" aria-label="Fix date or lot" onClick={() => setEditing(b)}>
                      <Pencil size={14} />
                    </button>
                    <button
                      className={`btn btn-sm ${e && e.days < 0 ? "btn-danger" : "btn-ghost"}`}
                      onClick={() => setRemoving(b)}
                      title="Take this batch out of stock"
                    >
                      <PackageMinus size={13} /> Remove
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="empty">
            {filter === "expired" ? "Nothing expired in stock." : filter === "all" ? "No batches yet. Enter expiry dates when you receive stock." : "Nothing expires in this period."}
          </p>
        )}
      </div>

      <RemoveModal batch={removing} onClose={() => setRemoving(null)} />
      <EditModal batch={editing} onClose={() => setEditing(null)} />
      <DateStockModal open={dating} products={undated} onClose={() => setDating(false)} />
    </div>
  )
}

const REMOVE_REASONS = ["Expired", "Damaged", "Returned to supplier", "Recalled"]

function RemoveModal({ batch, onClose }: { batch: BatchRow | null; onClose: () => void }) {
  const [reason, setReason] = useState(REMOVE_REASONS[0])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function confirm() {
    setBusy(true)
    setError(null)
    const result = await removeBatch(batch!.id, reason)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <Modal open={!!batch} onClose={onClose} title="Take this batch out of stock?" width={420}>
      {batch && (
        <div className="flex flex-col gap-4">
          {error && <p className="alert alert-error">{error}</p>}
          <p className="text-sm muted">
            <span className="text-white font-semibold">
              {num(batch.quantity)} {batch.items?.unit}
            </span>{" "}
            of {batch.items?.name}
            {batch.lot && ` (lot ${batch.lot})`} will be removed from stock and logged.
          </p>
          <label>
            <span className="label">Why</span>
            <select className="input" value={reason} onChange={e => setReason(e.target.value)}>
              {REMOVE_REASONS.map(r => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <div className="modal-footer">
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-danger" onClick={confirm} disabled={busy}>
              {busy ? "Removing…" : "Remove from stock"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function EditModal({ batch, onClose }: { batch: BatchRow | null; onClose: () => void }) {
  return (
    <Modal open={!!batch} onClose={onClose} title="Fix expiry date or lot" width={420}>
      {batch && <EditForm key={batch.id} batch={batch} onClose={onClose} />}
    </Modal>
  )
}

function EditForm({ batch, onClose }: { batch: BatchRow; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setBusy(true)
    setError(null)
    const result = await updateBatch(batch.id, { expires_on: String(form.get("expires_on") ?? ""), lot: String(form.get("lot") ?? "") })
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}
      <p className="text-sm text-white font-semibold">{batch.items?.name}</p>
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Expiry date</span>
          <input className="input" name="expires_on" type="date" defaultValue={batch.expires_on ?? ""} />
        </label>
        <label>
          <span className="label">Lot / batch no.</span>
          <input className="input" name="lot" defaultValue={batch.lot ?? ""} maxLength={60} />
        </label>
      </div>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}

/** For stock that was on hand before expiry dates were turned on. */
function DateStockModal({ open, products, onClose }: { open: boolean; products: UndatedProduct[]; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Add expiry dates to stock on hand" width={480}>
      {open && <DateStockForm products={products} onClose={onClose} />}
    </Modal>
  )
}

function DateStockForm({ products, onClose }: { products: UndatedProduct[]; onClose: () => void }) {
  const [search, setSearch] = useState("")
  const [productId, setProductId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const product = products.find(p => p.id === productId)
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (q ? products.filter(p => p.name.toLowerCase().includes(q)) : products).slice(0, 50)
  }, [products, search])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!product) return
    const formEl = e.currentTarget
    const form = new FormData(formEl)
    setBusy(true)
    setStatus(null)
    const result = await recordBatch({
      item_id: product.id,
      quantity: Number(form.get("quantity")),
      expires_on: String(form.get("expires_on") ?? ""),
      lot: String(form.get("lot") ?? ""),
    })
    setBusy(false)
    if (!result.ok) return setStatus({ ok: false, text: result.error })
    setStatus({ ok: true, text: `Saved for ${product.name}. Pick the next product, or close.` })
    setProductId(null)
    formEl.reset()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <p className="text-sm muted">
        Check the dates on the shelf and record them here. This doesn&apos;t change your stock counts; it only adds the dates.
      </p>
      {status && <p className={`alert ${status.ok ? "alert-success" : "alert-error"}`}>{status.text}</p>}
      <label>
        <span className="label">Product</span>
        <input className="input mb-2" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products without dates" />
        <select className="input" value={productId ?? ""} onChange={e => setProductId(e.target.value ? Number(e.target.value) : null)} required size={Math.min(6, Math.max(2, matches.length))}>
          {matches.map(p => (
            <option key={p.id} value={p.id}>
              {p.name} · {num(p.undated)} {p.unit} without a date
            </option>
          ))}
        </select>
      </label>
      {product && (
        <div className="grid grid-cols-3 gap-3">
          <label>
            <span className="label">How many</span>
            <input className="input" name="quantity" type="number" min={1} max={product.undated} step={1} defaultValue={product.undated} required />
          </label>
          <label>
            <span className="label">Expiry date</span>
            <input className="input" name="expires_on" type="date" required />
          </label>
          <label>
            <span className="label">Lot</span>
            <input className="input" name="lot" maxLength={60} placeholder="Optional" />
          </label>
        </div>
      )}
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Done
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || !product}>
          {busy ? "Saving…" : "Save date"}
        </button>
      </div>
    </form>
  )
}
