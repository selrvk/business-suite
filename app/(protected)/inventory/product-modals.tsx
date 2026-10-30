"use client"

import { useState } from "react"
import { Wand2 } from "lucide-react"
import { Modal } from "@/components/modal"
import { codeFieldProps } from "@/components/scan-input"
import { generateProductBarcode } from "@/components/barcode"
import { currencySymbol } from "@/lib/format"
import type { Item, StockReason } from "@/lib/types"
import { addProduct, adjustStock, updateProduct, type ProductInput } from "./actions"

export const UNIT_SUGGESTIONS = [
  "pieces", "boxes", "packs", "sets", "rolls", "bottles", "cans", "sacks", "bags",
  "kg", "grams", "liters", "ml", "meters", "feet", "dozens", "pairs", "trays", "gallons",
]

/** Add a product (item = null) or edit one. */
export function ProductModal({
  open,
  onClose,
  item,
  initialBarcode = "",
  onSaved,
}: {
  open: boolean
  onClose: () => void
  item: Item | null
  initialBarcode?: string
  onSaved?: (id: number) => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={item ? "Edit product" : "Add product"} width={480}>
      {/* Keyed so the form resets each time it opens for a different product. */}
      <ProductForm key={item?.id ?? `new-${initialBarcode}`} item={item} initialBarcode={initialBarcode} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}

function ProductForm({
  item,
  initialBarcode,
  onClose,
  onSaved,
}: {
  item: Item | null
  initialBarcode: string
  onClose: () => void
  onSaved?: (id: number) => void
}) {
  const [barcode, setBarcode] = useState(item?.barcode ?? initialBarcode)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sym = currencySymbol()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const input: ProductInput = {
      name: String(form.get("name")),
      brand: String(form.get("brand")),
      barcode,
      unit: String(form.get("unit")),
      price_buy: Number(form.get("price_buy")),
      price_sell: Number(form.get("price_sell")),
      current_stock: Number(form.get("current_stock")),
    }
    setBusy(true)
    setError(null)
    const result = item ? await updateProduct(item.id, input, item.current_stock) : await addProduct(input)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onSaved?.(item?.id ?? (result.data as { id: number }).id)
    onClose()
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {error && <p className="alert alert-error">{error}</p>}

      <label>
        <span className="label">Product name *</span>
        <input className="input" name="name" defaultValue={item?.name} placeholder="e.g. Cooking Oil 1L" required autoFocus />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Brand</span>
          <input className="input" name="brand" defaultValue={item?.brand ?? ""} placeholder="Optional" />
        </label>
        <label>
          <span className="label">Unit *</span>
          <input className="input" name="unit" list="unit-suggestions" defaultValue={item?.unit ?? "pieces"} required />
          <datalist id="unit-suggestions">
            {UNIT_SUGGESTIONS.map(u => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </label>
      </div>

      <div>
        <span className="label">Barcode</span>
        <div className="flex gap-2">
          <input
            className="input mono"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            {...codeFieldProps}
            placeholder="Scan it, type it, or generate one"
          />
          <button type="button" className="btn btn-secondary shrink-0" onClick={() => setBarcode(generateProductBarcode())} title="Make a barcode for products that don't have one">
            <Wand2 size={14} /> Generate
          </button>
        </div>
        <p className="hint">Click the box and scan the product. No barcode? Generate one and print a label.</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label>
          <span className="label">Cost ({sym}) *</span>
          <input className="input" name="price_buy" type="number" step="0.01" min="0" defaultValue={item?.price_buy ?? ""} placeholder="0.00" required />
        </label>
        <label>
          <span className="label">Price ({sym}) *</span>
          <input className="input" name="price_sell" type="number" step="0.01" min="0" defaultValue={item?.price_sell ?? ""} placeholder="0.00" required />
        </label>
        <label>
          <span className="label">{item ? "In stock" : "Opening stock"}</span>
          <input className="input" name="current_stock" type="number" step="1" min="0" defaultValue={item?.current_stock ?? 0} required />
        </label>
      </div>
      {item && <p className="hint -mt-2">Changing the stock here is logged as a correction. For deliveries, use Stock In.</p>}

      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : item ? "Save changes" : "Add product"}
        </button>
      </div>
    </form>
  )
}

const REASONS: { value: StockReason; label: string; sign: 1 | -1 | 0 }[] = [
  { value: "receive", label: "Received / delivery", sign: 1 },
  { value: "return", label: "Customer return", sign: 1 },
  { value: "adjust", label: "Correction (count, damage, loss)", sign: 0 },
]

/** Quick +/- on a single product's stock, with a reason for the log. */
export function AdjustStockModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <Modal open={!!item} onClose={onClose} title="Adjust stock" width={420}>
      {item && <AdjustForm key={item.id} item={item} onClose={onClose} />}
    </Modal>
  )
}

function AdjustForm({ item, onClose }: { item: Item; onClose: () => void }) {
  const [reason, setReason] = useState<StockReason>("adjust")
  const [direction, setDirection] = useState<1 | -1>(-1)
  const [qty, setQty] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sign = REASONS.find(r => r.value === reason)!.sign || direction
  const amount = Math.trunc(Number(qty)) || 0
  const after = item.current_stock + sign * amount

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const result = await adjustStock(item.id, sign * amount, reason, note)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="font-semibold text-white">{item.name}</p>
        <p className="text-xs faint">
          Now: {item.current_stock} {item.unit}
        </p>
      </div>
      {error && <p className="alert alert-error">{error}</p>}
      <label>
        <span className="label">Reason</span>
        <select className="input" value={reason} onChange={e => setReason(e.target.value as StockReason)}>
          {REASONS.map(r => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      {reason === "adjust" && (
        <div className="segmented self-start">
          <button type="button" data-active={direction === -1} onClick={() => setDirection(-1)}>
            Remove stock
          </button>
          <button type="button" data-active={direction === 1} onClick={() => setDirection(1)}>
            Add stock
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Quantity</span>
          <input className="input" type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} required autoFocus />
        </label>
        <div>
          <span className="label">After</span>
          <p className={`display text-3xl pt-1 ${after < 0 ? "text-bad" : "text-white"}`}>{after}</p>
        </div>
      </div>
      <label>
        <span className="label">Note</span>
        <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Monthly count, 2 damaged" />
      </label>
      <div className="modal-footer">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={busy || amount <= 0 || after < 0}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  )
}
