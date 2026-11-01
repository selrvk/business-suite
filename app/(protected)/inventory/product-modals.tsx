"use client"

import { useEffect, useState } from "react"
import { Wand2, X } from "lucide-react"
import { useBusinessFeatures } from "@/components/business-features"
import { Modal } from "@/components/modal"
import { codeFieldProps } from "@/components/scan-input"
import { generateProductBarcode } from "@/components/barcode"
import { currencySymbol } from "@/lib/format"
import type { Item, StockReason } from "@/lib/types"
import type { ProductOption } from "@/lib/features"
import { addProduct, adjustStock, productChoices, updateProduct, type ProductInput } from "./actions"
import { quickAddSupplier } from "./suppliers/actions"

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
    <Modal open={open} onClose={onClose} title={item ? "Edit product" : "Add product"} width={540}>
      {/* Keyed so the form resets each time it opens for a different product. */}
      <ProductForm key={item?.id ?? `new-${initialBarcode}`} item={item} initialBarcode={initialBarcode} onClose={onClose} onSaved={onSaved} />
    </Modal>
  )
}

type Choices = { suppliers: { id: number; name: string }[]; categories: string[]; locations: string[] }

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
  const { options, customFields, lowStock } = useBusinessFeatures()
  const has = (o: ProductOption) => options.includes(o)
  const [barcode, setBarcode] = useState(item?.barcode ?? initialBarcode)
  const [supplierId, setSupplierId] = useState<number | null>(item?.supplier_id ?? null)
  const [openingStock, setOpeningStock] = useState(String(item?.current_stock ?? 0))
  const [choices, setChoices] = useState<Choices>({ suppliers: [], categories: [], locations: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sym = currencySymbol()

  // Load suppliers and the categories/locations already in use, for the pickers.
  const needsChoices = has("suppliers") || has("categories") || has("locations")
  useEffect(() => {
    if (!needsChoices) return
    let live = true
    productChoices().then(result => {
      if (live && result.ok) setChoices(result.data)
    })
    return () => {
      live = false
    }
  }, [needsChoices])

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const text = (key: string) => String(form.get(key) ?? "")
    const level = text("reorder_level").trim()
    const input: ProductInput = {
      name: text("name"),
      brand: text("brand"),
      barcode,
      unit: text("unit"),
      price_buy: Number(form.get("price_buy")),
      price_sell: Number(form.get("price_sell")),
      current_stock: Number(form.get("current_stock")),
      reorder_level: level === "" ? null : Number(level),
      ...(has("suppliers") ? { supplier_id: supplierId } : {}),
      ...(has("categories") ? { category: text("category") } : {}),
      ...(has("locations") ? { location: text("location") } : {}),
      ...(customFields.length ? { extra: Object.fromEntries(customFields.map(f => [f.id, text(`extra_${f.id}`)])) } : {}),
      ...(!item && has("expiry") ? { expires_on: text("expires_on"), lot: text("lot") } : {}),
    }
    setBusy(true)
    setError(null)
    const result = item ? await updateProduct(item.id, input, item.current_stock) : await addProduct(input)
    setBusy(false)
    if (!result.ok) return setError(result.error)
    onSaved?.(item?.id ?? (result.data as { id: number }).id)
    onClose()
  }

  const extraValue = (id: string) => {
    const v = item?.extra?.[id]
    return v === null || v === undefined ? "" : String(v)
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
          <input
            className="input"
            name="current_stock"
            type="number"
            step="1"
            min="0"
            value={openingStock}
            onChange={e => setOpeningStock(e.target.value)}
            required
          />
        </label>
      </div>
      {item && <p className="hint -mt-2">Changing the stock here is logged as a correction. For deliveries, use Stock In.</p>}

      {!item && has("expiry") && Number(openingStock) > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <label>
            <span className="label">Expiry date</span>
            <input className="input" name="expires_on" type="date" />
          </label>
          <label>
            <span className="label">Lot / batch no.</span>
            <input className="input" name="lot" placeholder="Optional" maxLength={60} />
          </label>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {has("suppliers") && (
          <SupplierPicker
            value={supplierId}
            onChange={setSupplierId}
            suppliers={choices.suppliers}
            onAdded={s => setChoices(c => ({ ...c, suppliers: [...c.suppliers, s].sort((a, b) => a.name.localeCompare(b.name)) }))}
          />
        )}
        {has("categories") && (
          <label>
            <span className="label">Category</span>
            <input className="input" name="category" list="category-choices" defaultValue={item?.category ?? ""} placeholder="e.g. Drinks" maxLength={60} />
            <datalist id="category-choices">
              {choices.categories.map(c => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </label>
        )}
        {has("locations") && (
          <label>
            <span className="label">Shelf / location</span>
            <input className="input" name="location" list="location-choices" defaultValue={item?.location ?? ""} placeholder="e.g. Shelf A2" maxLength={60} />
            <datalist id="location-choices">
              {choices.locations.map(l => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </label>
        )}
        <label>
          <span className="label">Low-stock level</span>
          <input className="input" name="reorder_level" type="number" min="0" step="1" defaultValue={item?.reorder_level ?? ""} placeholder={`Default: ${lowStock}`} />
        </label>
        {customFields.map(f => (
          <label key={f.id}>
            <span className="label">{f.label}</span>
            <input
              className="input"
              name={`extra_${f.id}`}
              type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
              step={f.type === "number" ? "any" : undefined}
              defaultValue={extraValue(f.id)}
              maxLength={f.type === "text" ? 200 : undefined}
            />
          </label>
        ))}
      </div>
      {item && has("expiry") && <p className="hint -mt-2">Expiry dates are kept per delivery: enter them in Stock In, or see Expiry Dates.</p>}

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

/** Supplier dropdown, with a quick way to add a new one without leaving the form. */
export function SupplierPicker({
  value,
  onChange,
  suppliers,
  onAdded,
  label = "Supplier",
}: {
  value: number | null
  onChange: (id: number | null) => void
  suppliers: { id: number; name: string }[]
  onAdded: (supplier: { id: number; name: string }) => void
  label?: string
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function add() {
    setError(null)
    const result = await quickAddSupplier(name)
    if (!result.ok) return setError(result.error)
    onAdded(result.data)
    onChange(result.data.id)
    setAdding(false)
    setName("")
  }

  if (adding) {
    return (
      <div>
        <span className="label">New supplier</span>
        <div className="flex gap-1.5">
          <input
            className="input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Supplier name"
            maxLength={120}
            autoFocus
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault()
                add()
              }
            }}
          />
          <button type="button" className="btn btn-primary btn-sm shrink-0" onClick={add} disabled={!name.trim()}>
            Add
          </button>
          <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => setAdding(false)} aria-label="Cancel">
            <X size={13} />
          </button>
        </div>
        {error && <p className="hint text-bad">{error}</p>}
      </div>
    )
  }

  return (
    <label>
      <span className="label">{label}</span>
      <select
        className="input"
        value={value ?? ""}
        onChange={e => {
          if (e.target.value === "new") return setAdding(true)
          onChange(e.target.value ? Number(e.target.value) : null)
        }}
      >
        <option value="">None</option>
        {suppliers.map(s => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
        {value && !suppliers.some(s => s.id === value) && <option value={value}>Loading…</option>}
        <option value="new">+ Add a new supplier</option>
      </select>
    </label>
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
