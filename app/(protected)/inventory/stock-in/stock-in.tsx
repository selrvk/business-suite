"use client"

import { useMemo, useRef, useState } from "react"
import { PackageCheck, Plus, Trash2 } from "lucide-react"
import { ScanInput } from "@/components/scan-input"
import { QtyInput, ScanSafeInput } from "@/components/qty-input"
import { Empty } from "@/components/page-header"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import type { Item } from "@/lib/types"
import { receiveStock } from "../actions"
import { ProductModal } from "../product-modals"

type Line = { id: number; qty: number }

export function StockIn({ items }: { items: Item[] }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "good" | "bad" | "warn"; text: string } | null>(null)
  const [unknown, setUnknown] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return items.filter(i => [i.name, i.brand, i.barcode].some(v => v?.toLowerCase().includes(q))).slice(0, 8)
  }, [items, query])

  function add(id: number, qty = 1) {
    setLines(prev => {
      const found = prev.find(l => l.id === id)
      if (found) return prev.map(l => (l.id === id ? { ...l, qty: l.qty + qty } : l))
      return [{ id, qty }, ...prev]
    })
    setQuery("")
    setMessage(null)
    setUnknown(null)
    inputRef.current?.focus()
  }

  function handleCode(code: string) {
    const hit = items.find(i => i.barcode === code)
    if (hit) {
      beep()
      return add(hit.id)
    }
    const q = code.toLowerCase()
    const named = items.filter(i => [i.name, i.brand].some(v => v?.toLowerCase().includes(q)))
    if (named.length === 1) {
      beep()
      return add(named[0].id)
    }
    if (named.length === 0) {
      beep("error")
      const looksLikeCode = /^\S+$/.test(code)
      setUnknown(looksLikeCode ? code : null)
      setMessage({ tone: "warn", text: looksLikeCode ? `No product has barcode ${code}.` : `Nothing found for “${code}”.` })
    }
  }

  useScanner(handleCode)

  async function save() {
    setBusy(true)
    const result = await receiveStock(
      lines.map(l => ({ item_id: l.id, quantity: l.qty })),
      note,
    )
    setBusy(false)
    if (!result.ok) {
      beep("error")
      return setMessage({ tone: "bad", text: result.error })
    }
    const units = lines.reduce((s, l) => s + l.qty, 0)
    setMessage({ tone: "good", text: `Received ${units} units across ${lines.length} products.` })
    setLines([])
    setNote("")
  }

  const totalUnits = lines.reduce((s, l) => s + l.qty, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px] items-start">
      <div className="flex flex-col gap-4 min-w-0">
        <div className="relative">
          <ScanInput
            inputRef={inputRef}
            value={query}
            onChange={setQuery}
            onEnter={handleCode}
            placeholder="Scan a product, or type its name"
          />
          {matches.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 card overflow-hidden shadow-2xl">
              {matches.map(i => (
                <button key={i.id} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-white/5" onClick={() => add(i.id)}>
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{i.name}</span>
                    <span className="block text-xs faint mono">{i.barcode ?? "no barcode"}</span>
                  </span>
                  <span className="text-xs faint shrink-0">
                    {i.current_stock} {i.unit}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {message && (
          <div className={`alert ${message.tone === "good" ? "alert-success" : message.tone === "bad" ? "alert-error" : "alert-warn"} flex flex-wrap items-center justify-between gap-2`}>
            <span>{message.text}</span>
            {unknown && message.tone === "warn" && (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => {
                  setCreating(unknown)
                  setUnknown(null)
                  setMessage(null)
                }}
              >
                <Plus size={13} /> Add as new product
              </button>
            )}
          </div>
        )}

        <div className="card">
          {lines.length === 0 ? (
            <Empty title="Nothing scanned yet" icon={<PackageCheck size={30} />}>
              Scan the first product in the delivery.
            </Empty>
          ) : (
            <div className="divide-y divide-white/5">
              {lines.map(line => {
                const item = byId.get(line.id)
                return (
                  <div key={line.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{item?.name ?? "Loading…"}</p>
                      <p className="text-xs faint">
                        {item ? `${item.current_stock} → ${item.current_stock + line.qty} ${item.unit}` : ""}
                      </p>
                    </div>
                    <QtyInput
                      className="w-24"
                      value={line.qty}
                      label="Quantity received"
                      onCommit={qty => setLines(prev => prev.map(l => (l.id === line.id ? { ...l, qty } : l)))}
                      onScan={handleCode}
                    />
                    <button className="btn btn-ghost btn-icon" onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))} aria-label="Remove">
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="card card-body flex flex-col gap-4 lg:sticky lg:top-8">
        <p className="section-title">Delivery</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="stat-label">Products</p>
            <p className="display text-3xl text-white mt-1">{lines.length}</p>
          </div>
          <div>
            <p className="stat-label">Units</p>
            <p className="display text-3xl text-white mt-1">{totalUnits}</p>
          </div>
        </div>
        <label>
          <span className="label">Supplier / reference</span>
          <ScanSafeInput className="input" value={note} onChange={setNote} onScan={handleCode} placeholder="e.g. ABC Supply, DR #1042" />
        </label>
        <button className="btn btn-primary btn-lg btn-block" onClick={save} disabled={busy || lines.length === 0}>
          <PackageCheck size={16} />
          {busy ? "Saving…" : "Receive stock"}
        </button>
        {lines.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setLines([])}>
            Clear list
          </button>
        )}
      </div>

      <ProductModal
        open={!!creating}
        item={null}
        initialBarcode={creating ?? ""}
        onClose={() => setCreating(null)}
        onSaved={id => {
          setCreating(null)
          add(id)
        }}
      />
    </div>
  )
}
