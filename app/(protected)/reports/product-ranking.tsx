"use client"

import { useMemo, useState } from "react"
import { money, num } from "@/lib/format"
import { margin, percent, type ProductProfit } from "@/lib/reports"

const SORTS = {
  profit: { label: "Profit", by: (p: ProductProfit) => -p.profit },
  quantity: { label: "Units sold", by: (p: ProductProfit) => -p.quantity },
  revenue: { label: "Sales", by: (p: ProductProfit) => -p.revenue },
  margin: { label: "Low margin", by: (p: ProductProfit) => margin(p.revenue, p.cost) ?? 0 },
} as const

type Sort = keyof typeof SORTS
const FIRST = 15

/** Best sellers, ranked by profit, units, sales or margin. */
export function ProductRanking({ products, showCategory }: { products: ProductProfit[]; showCategory: boolean }) {
  const [sort, setSort] = useState<Sort>("profit")
  const [all, setAll] = useState(false)
  const sorted = useMemo(() => [...products].sort((a, b) => SORTS[sort].by(a) - SORTS[sort].by(b)), [products, sort])
  const shown = all ? sorted : sorted.slice(0, FIRST)

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-4">
        <span className="text-xs faint">Rank by</span>
        <div className="segmented max-w-full overflow-x-auto">
          {(Object.keys(SORTS) as Sort[]).map(key => (
            <button key={key} data-active={sort === key} onClick={() => setSort(key)}>
              {SORTS[key].label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="w-8 hidden sm:table-cell">#</th>
              <th>Product</th>
              <th className="num hidden sm:table-cell">Sold</th>
              <th className="num">Sales</th>
              <th className="num hidden md:table-cell">Cost</th>
              <th className="num">Profit</th>
              <th className="num hidden sm:table-cell">Margin</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => {
              const m = margin(p.revenue, p.cost)
              return (
                <tr key={`${p.item_id}-${p.name}`}>
                  <td className="faint tabular-nums hidden sm:table-cell">{i + 1}</td>
                  <td>
                    <p className="text-white">{p.name}</p>
                    <p className="text-[0.7rem] faint sm:hidden">{num(p.quantity)} sold · {percent(m)} margin</p>
                    {showCategory && p.category && <p className="text-[0.7rem] faint">{p.category}</p>}
                    {p.cost === 0 && p.revenue > 0 && <p className="text-[0.7rem] text-warn">No buying price set</p>}
                  </td>
                  <td className="num tabular-nums hidden sm:table-cell">{num(p.quantity)}</td>
                  <td className="num tabular-nums">{money(p.revenue)}</td>
                  <td className="num tabular-nums muted hidden md:table-cell">{money(p.cost)}</td>
                  <td className={`num tabular-nums font-semibold ${p.profit < 0 ? "text-bad" : "text-white"}`}>{money(p.profit)}</td>
                  <td className="num hidden sm:table-cell">
                    <span className="pill" data-tone={m == null ? undefined : m < 0 ? "bad" : m < 0.1 ? "warn" : undefined}>
                      {percent(m)}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {sorted.length > FIRST && (
        <button className="btn btn-ghost btn-sm mt-3" onClick={() => setAll(a => !a)}>
          {all ? `Show the top ${FIRST}` : `Show all ${sorted.length} products`}
        </button>
      )}
    </>
  )
}
