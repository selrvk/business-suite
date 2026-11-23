"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeftRight, ArrowRight, Trash2, Truck } from "lucide-react"
import { Empty } from "@/components/page-header"
import { ScanInput } from "@/components/scan-input"
import { QtyInput, ScanSafeInput } from "@/components/qty-input"
import { useScanner } from "@/hooks/use-scanner"
import { beep } from "@/lib/beep"
import { addDays, formatTime, formatWeekday, num, toYmd } from "@/lib/format"
import { transferStock } from "../actions"

type Product = { id: number; barcode: string | null; name: string; brand: string | null; unit: string }
type Place = { id: number; name: string; kind: "branch" | "warehouse" }
type Line = { id: number; qty: number }

/** A sensible place to send to: a branch when sending from a warehouse, otherwise the first other location. */
function defaultTo(locations: Place[], from: number) {
  const others = locations.filter(l => l.id !== from)
  const fromKind = locations.find(l => l.id === from)?.kind
  return (fromKind === "warehouse" ? others.find(l => l.kind === "branch") : undefined)?.id ?? others[0]?.id ?? 0
}

/** Pick where from and where to, scan what's going, send. */
export function TransferForm({
  items,
  stock,
  from: initialFrom,
  canPickFrom,
  locations,
}: {
  items: Product[]
  /** Product id → location id → quantity. */
  stock: Record<number, Record<number, number>>
  from: number
  /** Owners and admins can send from anywhere; staff from their own branch. */
  canPickFrom: boolean
  locations: Place[]
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(() => defaultTo(locations, initialFrom))
  const [query, setQuery] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null)

  const byId = useMemo(() => new Map(items.map(i => [i.id, i])), [items])
  const have = (id: number, at = from) => stock[id]?.[at] ?? 0
  const nameOf = (id: number) => locations.find(l => l.id === id)?.name ?? "?"
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    return items.filter(i => [i.name, i.brand, i.barcode].some(v => v?.toLowerCase().includes(q))).slice(0, 8)
  }, [items, query])

  useScanner(handleCode)

  function add(id: number) {
    const item = byId.get(id)
    const inList = lines.find(l => l.id === id)?.qty ?? 0
    if (item && inList + 1 > have(id)) {
      beep("error")
      setMessage({
        tone: "bad",
        text: have(id) <= 0 ? `${nameOf(from)} has no ${item.name}.` : `${nameOf(from)} only has ${have(id)} ${item.unit} of ${item.name}.`,
      })
      setQuery("")
      return
    }
    beep()
    setLines(prev =>
      prev.some(l => l.id === id) ? prev.map(l => (l.id === id ? { ...l, qty: l.qty + 1 } : l)) : [{ id, qty: 1 }, ...prev],
    )
    setQuery("")
    setMessage(null)
    inputRef.current?.focus()
  }

  function handleCode(code: string) {
    const hit = items.find(i => i.barcode === code)
    if (hit) return add(hit.id)
    const q = code.toLowerCase()
    const named = items.filter(i => [i.name, i.brand].some(v => v?.toLowerCase().includes(q)))
    if (named.length === 1) return add(named[0].id)
    beep("error")
    setMessage({
      tone: "bad",
      text: named.length ? `${named.length} products match "${code}". Pick one from the list.` : `No product has barcode ${code}.`,
    })
  }

  function pickFrom(id: number) {
    setFrom(id)
    if (id === to) setTo(defaultTo(locations, id))
    setMessage(null)
  }

  const short = lines.filter(l => l.qty > have(l.id))
  const units = lines.reduce((s, l) => s + l.qty, 0)

  async function send() {
    if (!lines.length || short.length || busy) return
    setBusy(true)
    const result = await transferStock(
      from,
      to,
      lines.map(l => ({ item_id: l.id, quantity: l.qty })),
      note,
    )
    setBusy(false)
    if (!result.ok) {
      beep("error")
      return setMessage({ tone: "bad", text: result.error })
    }
    beep("out")
    setMessage({
      tone: "good",
      text: `Moved ${num(result.data.units)} units of ${result.data.products} product${result.data.products === 1 ? "" : "s"} from ${nameOf(from)} to ${nameOf(to)}.`,
    })
    setLines([])
    setNote("")
    router.refresh()
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start mb-10">
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
                <button
                  key={i.id}
                  className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-white/5"
                  onClick={() => add(i.id)}
                >
                  <span className="min-w-0">
                    <span className="block text-sm text-white truncate">{i.name}</span>
                    <span className="block text-xs faint mono">{i.barcode ?? "no barcode"}</span>
                  </span>
                  <span className={`text-xs shrink-0 ${have(i.id) > 0 ? "faint" : "text-bad"}`}>
                    {have(i.id)} {i.unit} at {nameOf(from)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {message && <p className={`alert ${message.tone === "good" ? "alert-success" : "alert-error"}`}>{message.text}</p>}

        <div className="card">
          {lines.length === 0 ? (
            <Empty title="Nothing to send yet" icon={<Truck size={30} />}>
              Scan each product going to {nameOf(to)}, or type its name.
            </Empty>
          ) : (
            <div className="divide-y divide-white/5">
              {lines.map(line => {
                const item = byId.get(line.id)
                const there = have(line.id)
                const over = line.qty > there
                return (
                  <div key={line.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{item?.name ?? "?"}</p>
                      <p className={`text-xs ${over ? "text-bad" : "faint"}`}>
                        {over
                          ? `${nameOf(from)} only has ${there} ${item?.unit ?? ""}`
                          : `${nameOf(from)} ${there} → ${there - line.qty} · ${nameOf(to)} ${have(line.id, to)} → ${have(line.id, to) + line.qty} ${item?.unit ?? ""}`}
                      </p>
                    </div>
                    <QtyInput
                      className="w-24"
                      value={line.qty}
                      label="Quantity to send"
                      onCommit={qty => setLines(prev => prev.map(l => (l.id === line.id ? { ...l, qty } : l)))}
                      onScan={handleCode}
                    />
                    <button
                      className="btn btn-ghost btn-icon"
                      onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))}
                      aria-label={`Remove ${item?.name ?? "product"}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* On phones this comes first: pick where from and to before scanning. */}
      <div className="card card-body flex flex-col gap-4 order-first lg:order-none lg:sticky lg:top-8">
        <p className="section-title">Transfer</p>
        <label>
          <span className="label">From</span>
          <select
            className="input"
            value={from}
            onChange={e => pickFrom(Number(e.target.value))}
            disabled={!canPickFrom || lines.length > 0}
          >
            {locations.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          {canPickFrom && lines.length > 0 && <span className="hint block mt-1">Clear the list to send from somewhere else.</span>}
        </label>
        <label>
          <span className="label">To</span>
          <select className="input" value={to} onChange={e => setTo(Number(e.target.value))}>
            {locations
              .filter(l => l.id !== from)
              .map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="stat-label">Products</p>
            <p className="display text-3xl text-white mt-1">{lines.length}</p>
          </div>
          <div>
            <p className="stat-label">Units</p>
            <p className="display text-3xl text-white mt-1">{num(units)}</p>
          </div>
        </div>
        <label>
          <span className="label">Note</span>
          <ScanSafeInput className="input" value={note} onChange={setNote} onScan={handleCode} placeholder="e.g. Truck 1, Monday restock" />
        </label>
        <button className="btn btn-primary btn-lg btn-block" onClick={send} disabled={busy || !lines.length || short.length > 0 || !to}>
          <ArrowLeftRight size={16} />
          {busy ? "Sending…" : `Send to ${nameOf(to)}`}
        </button>
        {lines.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setLines([])}>
            Clear list
          </button>
        )}
      </div>
    </div>
  )
}

export type TransferRow = {
  id: number
  from: number
  to: number
  note: string | null
  by: string | null
  at: string
  units: number
  lines: { name: string; quantity: number; unit: string }[]
}

/** Past transfers, one section per day. */
export function TransfersList({
  rows,
  names,
  today,
  limit,
}: {
  rows: TransferRow[]
  names: Record<number, string>
  today: string
  /** Set when there may be older transfers than the ones shown. */
  limit: number | null
}) {
  const days: { day: string; at: string; rows: TransferRow[] }[] = []
  for (const r of rows) {
    const day = toYmd(r.at)
    let g = days[days.length - 1]
    if (!g || g.day !== day) days.push((g = { day, at: r.at, rows: [] }))
    g.rows.push(r)
  }
  const dayLabel = (g: (typeof days)[number]) => {
    const special = g.day === today ? "Today" : g.day === addDays(today, -1) ? "Yesterday" : null
    return special ? `${special} · ${formatWeekday(g.at)}` : formatWeekday(g.at)
  }
  const what = (r: TransferRow) => r.lines.map(l => `${l.name} ×${num(l.quantity)}`).join(", ")

  return (
    <section aria-labelledby="past-transfers">
      <h2 id="past-transfers" className="section-title mb-3">
        Past transfers
      </h2>
      {rows.length === 0 ? (
        <div className="table-wrap">
          <Empty title="No transfers yet" icon={<ArrowLeftRight size={30} />}>
            Stock you send between locations shows up here, and in the Stock Log.
          </Empty>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map(g => (
            <section key={g.day} className="card overflow-hidden" aria-label={dayLabel(g)}>
              <header
                className="flex items-center justify-between px-4 py-2.5 border-b"
                style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}
              >
                <h3 className="text-sm font-semibold text-white">{dayLabel(g)}</h3>
                <span className="text-xs muted">
                  {g.rows.length} {g.rows.length === 1 ? "transfer" : "transfers"}
                </span>
              </header>
              <ul className="divide-y divide-white/5">
                {g.rows.map(r => (
                  <li key={r.id} className="px-4 py-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                    <span className="text-xs muted tabular sm:w-16 shrink-0 sm:pt-0.5">{formatTime(r.at)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white flex flex-wrap items-center gap-x-1.5">
                        {names[r.from] ?? "?"} <ArrowRight size={13} className="faint" aria-label="to" /> {names[r.to] ?? "?"}
                      </p>
                      <p className="text-xs muted">{what(r) || "—"}</p>
                      <p className="text-xs faint">{[r.by && `by ${r.by}`, r.note].filter(Boolean).join(" · ")}</p>
                    </div>
                    <span className="text-sm font-semibold text-white tabular whitespace-nowrap">
                      {num(r.units)} <span className="faint text-xs font-normal">units</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {limit && <p className="text-xs faint">Showing the newest {limit} transfers. Older ones are in the Stock Log.</p>}
        </div>
      )}
    </section>
  )
}
