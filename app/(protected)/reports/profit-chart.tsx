"use client"

import { useState } from "react"
import { config } from "@/lib/config"
import { money } from "@/lib/format"
import { margin, percent, type Bucket } from "@/lib/reports"

// Two series on the dark card surface; checked for colour-blind separation and 3:1 contrast.
const PROFIT = "#3987e5"
const COST = "#d95926"
const PLOT_HEIGHT = 200

const compact = new Intl.NumberFormat(config.locale, {
  style: "currency",
  currency: config.currency,
  notation: "compact",
  maximumFractionDigits: 1,
})

/** Round axis steps: 1, 2 or 5 times a power of ten, about four of them. */
function ticks(max: number) {
  const rough = max / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map(m => m * power).find(s => s >= rough) ?? rough
  const top = Math.ceil(max / step) * step
  return { top, values: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) }
}

/**
 * Sales per day (or month) as columns: the bottom part is what the goods cost,
 * the top part is the profit. Hover or tap a column for its numbers.
 */
export function ProfitChart({ buckets, monthly }: { buckets: Bucket[]; monthly: boolean }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(0, ...buckets.map(b => b.revenue))
  const hasLoss = buckets.some(b => b.cost > b.revenue + 0.005 && b.revenue > 0)

  if (max <= 0) {
    return <p className="empty py-14">No sales in this period.</p>
  }

  const { top, values } = ticks(max)
  const labelEvery = Math.max(1, Math.ceil(buckets.length / (monthly ? 12 : 8)))
  const shown = active == null ? null : buckets[active]

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 text-xs muted">
        <Key color={PROFIT} label="Profit" />
        <Key color={COST} label="Cost of the goods" />
        {hasLoss && <Key color="var(--app-danger)" label="Sold below cost" thin />}
        <span className="faint">Whole column = sales</span>
      </div>

      <div className="flex gap-2">
        {/* Y axis */}
        <div className="relative shrink-0 w-11 text-right text-[0.65rem] faint tabular-nums" style={{ height: PLOT_HEIGHT }}>
          {values.map(v => (
            <span key={v} className="absolute right-0 -translate-y-1/2 leading-none" style={{ top: PLOT_HEIGHT - (v / top) * PLOT_HEIGHT }}>
              {compact.format(v)}
            </span>
          ))}
        </div>

        <div className="relative flex-1 min-w-0" onPointerLeave={() => setActive(null)}>
          {/* Gridlines */}
          <div className="absolute inset-x-0 top-0 pointer-events-none" style={{ height: PLOT_HEIGHT }}>
            {values.map(v => (
              <div
                key={v}
                className="absolute inset-x-0"
                style={{ top: PLOT_HEIGHT - (v / top) * PLOT_HEIGHT, borderTop: `1px solid ${v === 0 ? "var(--app-border-strong)" : "var(--app-border)"}` }}
              />
            ))}
          </div>

          {/* Columns */}
          <div className="relative flex items-end" style={{ height: PLOT_HEIGHT }}>
            {buckets.map((b, i) => {
              const total = (b.revenue / top) * PLOT_HEIGHT
              const loss = b.cost > b.revenue
              const costHeight = loss ? total : (b.cost / top) * PLOT_HEIGHT
              const profitHeight = Math.max(0, total - costHeight)
              const gap = profitHeight >= 3 && costHeight >= 3 ? 2 : 0
              return (
                <button
                  key={b.key}
                  type="button"
                  className="relative flex-1 min-w-0 h-full flex flex-col justify-end items-center outline-none"
                  style={{ background: active === i ? "rgba(255,255,255,0.04)" : undefined }}
                  onPointerEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  aria-label={`${b.long}: sales ${money(b.revenue)}, cost ${money(b.cost)}, profit ${money(b.revenue - b.cost)}`}
                >
                  {b.revenue > 0 && (
                    <span className="flex flex-col w-[70%] max-w-6" style={{ height: total }}>
                      <span style={{ height: Math.max(0, profitHeight - gap), background: PROFIT, borderRadius: "4px 4px 0 0" }} />
                      {gap > 0 && <span style={{ height: gap }} />}
                      <span
                        style={{
                          height: costHeight,
                          background: COST,
                          borderRadius: profitHeight > 0 ? 0 : "4px 4px 0 0",
                        }}
                      />
                    </span>
                  )}
                  {loss && b.revenue > 0 && (
                    <span className="absolute -bottom-1.5 w-[70%] max-w-6 h-[3px] rounded-full" style={{ background: "var(--app-danger)" }} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Day / month labels */}
          <div className="flex mt-2 text-[0.65rem] faint">
            {buckets.map((b, i) => (
              <span
                key={b.key}
                className={`flex-1 min-w-0 text-center whitespace-nowrap overflow-visible ${i % (labelEvery * 2) !== 0 ? "max-sm:invisible" : ""}`}
              >
                {i % labelEvery === 0 ? b.label : ""}
              </span>
            ))}
          </div>

          {/* Tooltip */}
          {shown && active != null && (
            <div
              className="absolute top-0 z-10 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-xl"
              style={{
                background: "var(--app-surface-2)",
                border: "1px solid var(--app-border-strong)",
                ...(active < buckets.length / 2
                  ? { left: `${((active + 0.5) / buckets.length) * 100}%`, marginLeft: 12 }
                  : { right: `${((buckets.length - active - 0.5) / buckets.length) * 100}%`, marginRight: 12 }),
              }}
            >
              <p className="font-semibold text-white mb-1 whitespace-nowrap">{shown.long}</p>
              <Row label="Sales" value={money(shown.revenue)} />
              <Row label="Cost" value={money(shown.cost)} color={COST} />
              {shown.revenue - shown.cost < 0 ? (
                <Row label="Loss" value={money(shown.cost - shown.revenue)} color="var(--app-danger)" />
              ) : (
                <Row label="Profit" value={`${money(shown.revenue - shown.cost)} · ${percent(margin(shown.revenue, shown.cost))}`} color={PROFIT} />
              )}
            </div>
          )}
        </div>
      </div>

      <details className="mt-5">
        <summary className="text-xs muted cursor-pointer select-none">See the numbers {monthly ? "by month" : "by day"}</summary>
        <div className="table-wrap mt-3">
          <table className="table">
            <thead>
              <tr>
                <th>{monthly ? "Month" : "Day"}</th>
                <th className="num">Sales</th>
                <th className="num">Cost</th>
                <th className="num">Profit</th>
                <th className="num">Margin</th>
              </tr>
            </thead>
            <tbody>
              {buckets
                .filter(b => b.revenue > 0 || b.cost > 0)
                .map(b => (
                  <tr key={b.key}>
                    <td className="whitespace-nowrap">{b.long}</td>
                    <td className="num">{money(b.revenue)}</td>
                    <td className="num muted">{money(b.cost)}</td>
                    <td className={`num ${b.revenue - b.cost < 0 ? "text-bad" : "text-white"}`}>{money(b.revenue - b.cost)}</td>
                    <td className="num muted">{percent(margin(b.revenue, b.cost))}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function Key({ color, label, thin = false }: { color: string; label: string; thin?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-2.5 rounded-sm" style={{ background: color, height: thin ? 3 : 10 }} />
      {label}
    </span>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <p className="flex items-center justify-between gap-4 whitespace-nowrap">
      <span className="inline-flex items-center gap-1.5 muted">
        {color && <span className="inline-block w-2 h-2 rounded-sm" style={{ background: color }} />}
        {label}
      </span>
      <span className="text-white tabular-nums">{value}</span>
    </p>
  )
}
