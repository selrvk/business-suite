"use client"

import { useMemo, useState } from "react"
import { Check, Copy, MessageSquare, PackageCheck, Printer } from "lucide-react"
import { useCan } from "@/components/business-features"
import { Empty } from "@/components/page-header"
import { money, num } from "@/lib/format"

export type LowItem = {
  id: number
  name: string
  brand: string | null
  unit: string
  current_stock: number
  reorder_level: number | null
  supplier_id: number | null
  price_buy: number
  barcode: string | null
}

/** How much to order: enough to get back to twice the low-stock level. */
function suggested(item: LowItem, defaultLevel: number) {
  const level = item.reorder_level ?? defaultLevel
  return Math.max(1, level * 2 - Math.max(0, item.current_stock))
}

export function ReorderList({
  items,
  suppliers,
  bySupplier,
  businessName,
  defaultLevel,
  dateLabel,
}: {
  items: LowItem[]
  suppliers: { id: number; name: string; phone: string | null }[]
  bySupplier: boolean
  businessName: string
  defaultLevel: number
  dateLabel: string
}) {
  const [qty, setQty] = useState<Record<number, number>>(() => Object.fromEntries(items.map(i => [i.id, suggested(i, defaultLevel)])))
  const [skipped, setSkipped] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState<string | null>(null)
  const showCost = useCan()("see_costs")

  const groups = useMemo(() => {
    const byId = new Map(suppliers.map(s => [s.id, s]))
    const map = new Map<string, { key: string; name: string; phone: string | null; items: LowItem[] }>()
    for (const item of items) {
      const supplier = bySupplier && item.supplier_id ? byId.get(item.supplier_id) : undefined
      const key = supplier ? String(supplier.id) : "none"
      if (!map.has(key)) map.set(key, { key, name: supplier?.name ?? (bySupplier ? "No supplier set" : "To reorder"), phone: supplier?.phone ?? null, items: [] })
      map.get(key)!.items.push(item)
    }
    return [...map.values()].sort((a, b) => (a.key === "none" ? 1 : b.key === "none" ? -1 : a.name.localeCompare(b.name)))
  }, [items, suppliers, bySupplier])

  if (!items.length) {
    return (
      <div className="card">
        <Empty title="Nothing to reorder" icon={<PackageCheck size={30} />}>
          Every product is above its low-stock level.
        </Empty>
      </div>
    )
  }

  function orderText(group: (typeof groups)[number]) {
    const lines = group.items
      .filter(i => !skipped.has(i.id) && (qty[i.id] ?? 0) > 0)
      .map(i => `• ${i.name}${i.brand ? ` (${i.brand})` : ""}: ${num(qty[i.id])} ${i.unit}`)
    return [`Order from ${businessName}, ${dateLabel}`, "", ...lines, "", "Thank you!"].join("\n")
  }

  async function copy(group: (typeof groups)[number]) {
    try {
      await navigator.clipboard.writeText(orderText(group))
      setCopied(group.key)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // clipboard blocked; nothing else to do
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end no-print">
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={14} /> Print
        </button>
      </div>
      {groups.map(group => {
        const active = group.items.filter(i => !skipped.has(i.id))
        const total = active.reduce((s, i) => s + (qty[i.id] ?? 0) * Number(i.price_buy), 0)
        return (
          <section key={group.key} className="card print-break">
            <div className="card-header flex-wrap gap-2">
              <h2 className="display text-xl text-white">{group.name}</h2>
              <span className="text-xs faint">
                {active.length} product{active.length === 1 ? "" : "s"}
                {showCost && ` · about ${money(total)} at cost`}
              </span>
              <span className="ml-auto flex gap-2 no-print">
                {group.phone && (
                  <a className="btn btn-secondary btn-sm" href={`sms:${group.phone.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(orderText(group))}`}>
                    <MessageSquare size={13} /> Text order
                  </a>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => copy(group)}>
                  {copied === group.key ? <Check size={13} /> : <Copy size={13} />} {copied === group.key ? "Copied" : "Copy order"}
                </button>
              </span>
            </div>
            <div className="table-wrap border-0 rounded-none">
              <table className="table">
                <thead>
                  <tr>
                    <th className="no-print w-8" />
                    <th>Product</th>
                    <th className="num">In stock</th>
                    <th className="num">Low at</th>
                    <th className="num">Order</th>
                    {showCost && <th className="num hidden sm:table-cell">Cost</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.items.map(i => {
                    const off = skipped.has(i.id)
                    return (
                      <tr key={i.id} className={off ? "opacity-40 print-hide" : undefined}>
                        <td className="no-print">
                          <input
                            type="checkbox"
                            checked={!off}
                            aria-label={`Include ${i.name}`}
                            onChange={() =>
                              setSkipped(s => {
                                const next = new Set(s)
                                if (next.has(i.id)) next.delete(i.id)
                                else next.add(i.id)
                                return next
                              })
                            }
                          />
                        </td>
                        <td>
                          <p className="text-white">{i.name}</p>
                          <p className="text-[0.7rem] faint">{[i.brand, i.barcode].filter(Boolean).join(" · ") || "—"}</p>
                        </td>
                        <td className="num">
                          <span className="pill" data-tone={i.current_stock <= 0 ? "bad" : "warn"}>
                            {i.current_stock <= 0 ? "Out" : num(i.current_stock)}
                          </span>
                        </td>
                        <td className="num muted">{num(i.reorder_level ?? defaultLevel)}</td>
                        <td className="num">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            <input
                              className="input input-sm w-20 text-right no-print"
                              type="number"
                              min={0}
                              step={1}
                              value={qty[i.id] ?? 0}
                              disabled={off}
                              onChange={e => setQty(q => ({ ...q, [i.id]: Math.max(0, Math.trunc(Number(e.target.value)) || 0) }))}
                            />
                            <span className="print-only">{num(qty[i.id] ?? 0)}</span>
                            <span className="faint text-xs">{i.unit}</span>
                          </span>
                        </td>
                        {showCost && <td className="num muted hidden sm:table-cell">{money((qty[i.id] ?? 0) * Number(i.price_buy))}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}
    </div>
  )
}
