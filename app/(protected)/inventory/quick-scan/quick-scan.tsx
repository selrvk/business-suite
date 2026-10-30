"use client"

import { useRef, useState } from "react"
import { Minus, Plus, ScanBarcode, Undo2 } from "lucide-react"
import { ScanInput } from "@/components/scan-input"
import { QtyInput, ScanSafeInput } from "@/components/qty-input"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { formatTime, num } from "@/lib/format"
import { quickScan, undoScan } from "../actions"
import { ProductModal } from "../product-modals"

type Mode = "out" | "in"
type Entry = {
  key: number
  code: string
  change: number
  note: string
  at: number
  status: "saving" | "done" | "undone" | "error" | "unknown" | "added"
  busy?: boolean
  itemId?: number
  name?: string
  unit?: string
  stock?: number
  error?: string
}

const MODES: Record<Mode, { label: string; color: string; icon: typeof Minus }> = {
  out: { label: "Stock out", color: "var(--app-warning)", icon: Minus },
  in: { label: "Stock in", color: "var(--app-success)", icon: Plus },
}

export function QuickScan() {
  const [mode, setMode] = useState<Mode>("out")
  const [qty, setQty] = useState(1)
  const [note, setNote] = useState("")
  const [code, setCode] = useState("")
  const [entries, setEntries] = useState<Entry[]>([])
  const [creating, setCreating] = useState<Entry | null>(null)
  const queue = useRef<Promise<void>>(Promise.resolve())
  const counter = useRef(0)

  const update = (key: number, patch: Partial<Entry>) => setEntries(prev => prev.map(e => (e.key === key ? { ...e, ...patch } : e)))

  /** Runs saves one at a time, in scan order, however fast people scan. */
  function enqueue(key: number, task: () => Promise<void>) {
    queue.current = queue.current.then(() =>
      task().catch(() => {
        beep("error")
        update(key, { busy: false, status: "error", error: "No connection. This scan was not saved." })
      }),
    )
  }

  function scan(raw: string) {
    const value = raw.trim()
    if (!value) return
    setCode("")
    const change = mode === "out" ? -qty : qty
    const key = ++counter.current
    setEntries(prev => [{ key, code: value, change, note, at: Date.now(), status: "saving" as const }, ...prev].slice(0, 50))

    enqueue(key, async () => {
      const result = await quickScan(value, change, note)
      if (!result.ok) {
        beep("error")
        return update(key, { status: "error", error: result.error })
      }
      if (!result.data.found) {
        beep("error")
        return update(key, { status: "unknown" })
      }
      beep(change < 0 ? "out" : "ok")
      const { item_id, name, unit, stock } = result.data
      update(key, { status: "done", itemId: item_id, name, unit, stock })
    })
  }

  function undo(entry: Entry) {
    if (!entry.itemId) return
    update(entry.key, { busy: true })
    enqueue(entry.key, async () => {
      const result = await undoScan(entry.itemId!, entry.change)
      if (!result.ok) return update(entry.key, { busy: false, error: result.error })
      update(entry.key, { busy: false, status: "undone", stock: result.data, error: undefined })
    })
  }

  useScanner(scan, { enabled: !creating })

  const current = MODES[mode]
  const last = entries[0]
  const done = entries.filter(e => e.status === "done")
  const outUnits = done.filter(e => e.change < 0).reduce((s, e) => s - e.change, 0)
  const inUnits = done.filter(e => e.change > 0).reduce((s, e) => s + e.change, 0)

  return (
    <div className="flex flex-col gap-5">
      {/* Mode */}
      <div className="grid grid-cols-2 gap-2 max-w-xl">
        {(Object.keys(MODES) as Mode[]).map(m => {
          const M = MODES[m]
          const active = m === mode
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="card flex items-center gap-3 px-4 py-3 text-left transition-colors"
              style={active ? { borderColor: M.color, background: `color-mix(in srgb, ${M.color} 12%, transparent)` } : { opacity: 0.6 }}
            >
              <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: M.color, color: "#0b0e14" }}>
                <M.icon size={18} strokeWidth={3} />
              </span>
              <span>
                <span className="display text-2xl text-white block">{M.label}</span>
                <span className="text-xs muted">{m === "out" ? "Each scan removes from stock" : "Each scan adds to stock"}</span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Scan row */}
      <div
        className="grid gap-3 md:grid-cols-[1fr_110px_1fr] items-end"
        style={{ "--brand": current.color, "--brand-line": current.color } as React.CSSProperties}
      >
        <div>
          <span className="label">Scan</span>
          <ScanInput value={code} onChange={setCode} onEnter={scan} placeholder={`Scan to ${mode === "out" ? "remove" : "add"} ${qty}`} />
        </div>
        <div>
          <span className="label">Per scan</span>
          <QtyInput value={qty} onCommit={setQty} onScan={scan} label="Quantity per scan" className="py-[0.85rem]" />
        </div>
        <div>
          <span className="label">What for? (optional)</span>
          <ScanSafeInput
            className="input py-[0.85rem]"
            value={note}
            onChange={setNote}
            onScan={scan}
            placeholder={mode === "out" ? "e.g. Truck 1 delivery, used in shop" : "e.g. Supplier, returned unused"}
          />
        </div>
      </div>

      {/* Last scan */}
      <div
        className="card px-6 py-5 flex flex-wrap items-center gap-x-8 gap-y-2 min-h-24"
        style={last ? { borderColor: statusColor(last) } : undefined}
        aria-live="polite"
      >
        {!last ? (
          <p className="flex items-center gap-3 muted">
            <ScanBarcode size={22} className="text-brand" /> Ready. Scan the first item.
          </p>
        ) : (
          <>
            <div className="min-w-0 flex-1">
              <p className="stat-label">Last scan · {formatTime(last.at)}</p>
              <p className="display text-3xl md:text-4xl text-white truncate mt-1">{last.name ?? last.code}</p>
              <p className="text-sm mt-1" style={{ color: statusColor(last) }}>
                {statusText(last)}
              </p>
            </div>
            {last.stock !== undefined && (
              <div className="text-right">
                <p className="stat-label">Now in stock</p>
                <p className="display text-5xl text-white mt-1">
                  {num(last.stock)} <span className="text-lg faint">{last.unit}</span>
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Session log */}
      {entries.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">This session</h2>
            <p className="text-xs faint">
              <span className="text-warn font-semibold">−{num(outUnits)}</span> out ·{" "}
              <span className="text-good font-semibold">+{num(inUnits)}</span> in · saved to the stock log
            </p>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Product</th>
                  <th className="num">Change</th>
                  <th className="num">Stock after</th>
                  <th>Note</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.key} style={{ opacity: e.status === "undone" ? 0.45 : 1 }}>
                    <td className="muted whitespace-nowrap">{formatTime(e.at)}</td>
                    <td>
                      <p className={e.name ? "text-white" : "mono muted"}>{e.name ?? e.code}</p>
                      {e.status !== "done" && e.status !== "undone" && (
                        <p className="text-xs" style={{ color: statusColor(e) }}>
                          {statusText(e)}
                        </p>
                      )}
                      {e.status === "undone" && <p className="text-xs faint">Undone</p>}
                    </td>
                    <td
                      className={`num font-semibold ${
                        e.status === "done" ? (e.change < 0 ? "text-warn" : "text-good") : e.status === "saving" ? "faint" : "faint line-through"
                      }`}
                    >
                      {e.change < 0 ? "−" : "+"}
                      {Math.abs(e.change)}
                    </td>
                    <td className="num text-white">{e.stock !== undefined ? num(e.stock) : "—"}</td>
                    <td className="muted">{e.note || "—"}</td>
                    <td className="text-right whitespace-nowrap">
                      {e.status === "done" && (
                        <button className="btn btn-ghost btn-sm" onClick={() => undo(e)} disabled={e.busy}>
                          <Undo2 size={13} /> {e.busy ? "Undoing…" : "Undo"}
                        </button>
                      )}
                      {e.status === "unknown" && (
                        <button className="btn btn-primary btn-sm" onClick={() => setCreating(e)}>
                          <Plus size={13} /> Add product
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <ProductModal
        open={!!creating}
        item={null}
        initialBarcode={creating?.code ?? ""}
        onClose={() => setCreating(null)}
        onSaved={() => creating && update(creating.key, { status: "added" })}
      />
    </div>
  )
}

function statusColor(e: Entry) {
  if (e.status === "error") return "var(--app-danger)"
  if (e.status === "unknown") return "var(--app-warning)"
  if (e.status === "saving") return "var(--app-faint)"
  if (e.status === "undone" || e.status === "added") return "var(--app-info)"
  return e.change < 0 ? "var(--app-warning)" : "var(--app-success)"
}

function statusText(e: Entry) {
  switch (e.status) {
    case "saving":
      return "Saving…"
    case "error":
      return e.error ?? "Couldn't save"
    case "unknown":
      return `No product has barcode ${e.code}`
    case "added":
      return "Product added. Scan it again to record the change."
    case "undone":
      return "Undone"
    default:
      return `${e.change < 0 ? "Removed" : "Added"} ${Math.abs(e.change)} ${e.unit ?? ""}${e.note ? ` · ${e.note}` : ""}`
  }
}
